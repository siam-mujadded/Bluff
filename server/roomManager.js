const rooms = new Map();
const socketToRoom = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(socketId, playerName) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));

  const room = {
    code,
    hostId: socketId,
    players: [{ id: socketId, name: playerName, index: 0 }],
    gameStarted: false,
    gameState: null,
  };
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return room;
}

function joinRoom(code, socketId, playerName) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.gameStarted) return { error: 'Game already in progress' };
  if (room.players.length >= 8) return { error: 'Room is full (max 8 players)' };
  if (room.players.some(p => p.name === playerName)) return { error: 'Name already taken in this room' };

  room.players.push({ id: socketId, name: playerName, index: room.players.length });
  socketToRoom.set(socketId, code);
  return { room };
}

function leaveRoom(socketId) {
  const code = socketToRoom.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) { socketToRoom.delete(socketId); return null; }

  if (!room.gameStarted) {
    room.players = room.players.filter(p => p.id !== socketId);
    room.players.forEach((p, i) => { p.index = i; });
    if (room.players.length === 0) {
      rooms.delete(code);
    } else if (room.hostId === socketId) {
      room.hostId = room.players[0].id;
    }
  } else {
    const player = room.players.find(p => p.id === socketId);
    if (player) player.connected = false;
  }

  socketToRoom.delete(socketId);
  return { code, room: rooms.get(code) };
}

function getRoom(code) {
  return rooms.get(code);
}

function getRoomBySocket(socketId) {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

function rejoinRoom(code, socketId, playerName) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };

  const lobbyPlayer = room.players.find(p => p.name === playerName);
  if (lobbyPlayer) {
    const oldId = lobbyPlayer.id;
    lobbyPlayer.id = socketId;
    socketToRoom.delete(oldId);
    socketToRoom.set(socketId, code);

    if (room.gameState) {
      const gsPlayer = room.gameState.players.find(p => p.id === oldId);
      if (gsPlayer) {
        gsPlayer.id = socketId;
        gsPlayer.connected = true;
      }
    }

    if (room.hostId === oldId) room.hostId = socketId;
    return { room, playerIndex: room.gameState ? room.gameState.players.findIndex(p => p.id === socketId) : -1 };
  }

  return { error: 'Player not found in room' };
}

function getRoomCode(socketId) {
  return socketToRoom.get(socketId);
}

module.exports = { createRoom, joinRoom, rejoinRoom, leaveRoom, getRoom, getRoomBySocket, getRoomCode };
