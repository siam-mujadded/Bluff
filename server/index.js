const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const roomManager = require('./roomManager');
const gameEngine = require('./gameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/game', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'game.html'));
});

function broadcastLobby(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;
  const playerList = room.players.map(p => ({ name: p.name, isHost: p.id === room.hostId }));
  io.to(roomCode).emit('lobby-update', { players: playerList, hostId: room.hostId });
}

function broadcastGameState(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room || !room.gameState) return;
  const pubState = gameEngine.getPublicState(room.gameState);
  io.to(roomCode).emit('game-state', pubState);
}

function sendAllHands(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room || !room.gameState) return;
  room.gameState.players.forEach((p, i) => {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) {
      sock.emit('hand-update', { hand: p.hand });
      sock.emit('your-index', { index: i });
    }
  });
}

io.on('connection', (socket) => {

  socket.on('create-room', ({ playerName }, cb) => {
    if (!playerName || playerName.trim().length === 0) {
      return cb({ error: 'Name is required' });
    }
    const room = roomManager.createRoom(socket.id, playerName.trim());
    socket.join(room.code);
    cb({ roomCode: room.code });
    broadcastLobby(room.code);
  });

  socket.on('join-room', ({ roomCode, playerName }, cb) => {
    if (!playerName || playerName.trim().length === 0) {
      return cb({ error: 'Name is required' });
    }
    if (!roomCode) return cb({ error: 'Room code is required' });
    const code = roomCode.toUpperCase().trim();
    const result = roomManager.joinRoom(code, socket.id, playerName.trim());
    if (result.error) return cb({ error: result.error });
    socket.join(code);
    cb({ roomCode: code });
    broadcastLobby(code);
  });

  socket.on('rejoin-room', ({ roomCode, playerName }, cb) => {
    if (!roomCode || !playerName) return cb({ error: 'Missing room code or name' });
    const code = roomCode.toUpperCase().trim();
    const result = roomManager.rejoinRoom(code, socket.id, playerName.trim());
    if (result.error) return cb({ error: result.error });
    socket.join(code);

    if (result.room.gameStarted && result.room.gameState) {
      const pIdx = result.playerIndex;
      cb({ success: true, gameStarted: true });
      if (pIdx !== -1) {
        socket.emit('your-index', { index: pIdx });
        socket.emit('hand-update', { hand: result.room.gameState.players[pIdx].hand });
      }
      broadcastGameState(code);
    } else {
      cb({ success: true, gameStarted: false });
      broadcastLobby(code);
    }
  });

  socket.on('start-game', ({ roomCode }, cb) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return cb({ error: 'Room not found' });
    if (room.hostId !== socket.id) return cb({ error: 'Only host can start the game' });
    if (room.players.length < 2) return cb({ error: 'Need at least 2 players' });
    if (room.gameStarted) return cb({ error: 'Game already started' });

    room.gameStarted = true;
    room.gameState = gameEngine.createGameState(room.players);

    cb({ success: true });
    io.to(roomCode).emit('game-started', {});
    sendAllHands(roomCode);
    broadcastGameState(roomCode);
  });

  socket.on('play-cards', ({ roomCode, cardIds, declaredType }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.gameState) return;

    const playerIndex = room.gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    const result = gameEngine.playCards(room.gameState, playerIndex, cardIds, declaredType);
    if (result.error) {
      return socket.emit('action-error', { message: result.error });
    }

    io.to(roomCode).emit('cards-played', {
      playerName: result.playerName,
      playerIndex: result.playerIndex,
      count: result.cardsCount,
      declaredType: result.declaredType,
    });

    sendAllHands(roomCode);
    broadcastGameState(roomCode);

    if (result.gameOver) {
      io.to(roomCode).emit('game-over', { winner: result.winner });
    }
  });

  socket.on('pass-turn', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.gameState) return;

    const playerIndex = room.gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    const result = gameEngine.pass(room.gameState, playerIndex);
    if (result.error) {
      return socket.emit('action-error', { message: result.error });
    }

    if (result.event === 'full-circle') {
      io.to(roomCode).emit('player-passed', { playerName: result.playerName });
      io.to(roomCode).emit('full-circle', {
        currentPlayerIndex: result.currentPlayerIndex,
        currentPlayerName: result.currentPlayerName,
      });
    } else {
      io.to(roomCode).emit('player-passed', { playerName: result.playerName });
    }

    broadcastGameState(roomCode);
  });

  socket.on('call-bluff', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.gameState) return;

    const playerIndex = room.gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    const result = gameEngine.callBluff(room.gameState, playerIndex);
    if (result.error) {
      return socket.emit('action-error', { message: result.error });
    }

    io.to(roomCode).emit('bluff-result', {
      callerName: result.callerName,
      accusedName: result.accusedName,
      bluffDetected: result.bluffDetected,
      boardCardCount: result.boardCardCount,
      loserIndex: result.loserIndex,
      winnerIndex: result.winnerIndex,
    });

    setTimeout(() => {
      sendAllHands(roomCode);
      broadcastGameState(roomCode);
      if (result.gameOver) {
        io.to(roomCode).emit('game-over', { winner: result.winner });
      }
    }, 3000);
  });

  socket.on('discard-board', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.gameState) return;

    const playerIndex = room.gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    const result = gameEngine.discardBoard(room.gameState, playerIndex);
    if (result.error) {
      return socket.emit('action-error', { message: result.error });
    }

    io.to(roomCode).emit('board-discarded', {
      playerName: result.playerName,
      discardedCount: result.discardedCount,
    });

    broadcastGameState(roomCode);

    if (result.gameOver) {
      io.to(roomCode).emit('game-over', { winner: result.winner });
    }
  });

  socket.on('chat-message', ({ roomCode, message }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    let senderName = null;
    const lobbyP = room.players.find(p => p.id === socket.id);
    if (lobbyP) senderName = lobbyP.name;
    if (!senderName && room.gameState) {
      const gsP = room.gameState.players.find(p => p.id === socket.id);
      if (gsP) senderName = gsP.name;
    }
    if (!senderName) return;
    const text = (message || '').trim().slice(0, 300);
    if (!text) return;
    socket.broadcast.to(roomCode).emit('chat-message', {
      sender: senderName,
      text,
      timestamp: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    const result = roomManager.leaveRoom(socket.id);
    if (!result || !result.room) return;

    if (!result.room.gameStarted) {
      broadcastLobby(result.code);
    } else {
      const gs = result.room.gameState;
      if (!gs) return;

      const disconnectedPlayer = gs.players.find(p => !p.connected);
      if (!disconnectedPlayer) return;
      const dpIdx = gs.players.indexOf(disconnectedPlayer);

      setTimeout(() => {
        if (!disconnectedPlayer.connected) {
          if (gs.currentPlayerIndex === dpIdx && gs.phase !== 'GAME_OVER') {
            autoPassDisconnected(result.code, gs, dpIdx);
          }
          io.to(result.code).emit('player-disconnected', {
            playerName: disconnectedPlayer.name,
          });
          broadcastGameState(result.code);
        }
      }, 5000);
    }
  });
});

function autoPassDisconnected(roomCode, gs, playerIndex) {
  if (gs.phase === 'FULL_CIRCLE' && playerIndex === gs.lastPlayerIndex) {
    const result = gameEngine.discardBoard(gs, playerIndex);
    if (result.success) {
      io.to(roomCode).emit('board-discarded', {
        playerName: gs.players[playerIndex].name,
        discardedCount: result.discardedCount,
      });
    }
  } else if (gs.phase === 'IN_PLAY') {
    gs.currentPlayerIndex = playerIndex;
    const result = gameEngine.pass(gs, playerIndex);
    if (result.success) {
      io.to(roomCode).emit('player-passed', { playerName: gs.players[playerIndex].name });
      if (result.event === 'full-circle' && !gs.players[result.currentPlayerIndex].connected) {
        autoPassDisconnected(roomCode, gs, result.currentPlayerIndex);
        return;
      }
    }
  } else if (gs.phase === 'NEW_ROUND') {
    const next = gameEngine.getNextActivePlayer(gs.players, playerIndex);
    if (next === -1) {
      gs.phase = 'GAME_OVER';
    } else {
      gs.currentPlayerIndex = next;
      gs.phase = 'NEW_ROUND';
    }
  }
  broadcastGameState(roomCode);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bluff server running on port ${PORT}`);
});
