const socket = io({ reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 2000 });

const landing = document.getElementById('landing');
const waitingRoom = document.getElementById('waitingRoom');
const playerNameInput = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playerList = document.getElementById('playerList');
const btnCreate = document.getElementById('btnCreate');
const btnShowJoin = document.getElementById('btnShowJoin');
const btnJoin = document.getElementById('btnJoin');
const btnStart = document.getElementById('btnStart');
const joinSection = document.getElementById('joinSection');
const landingError = document.getElementById('landingError');
const waitError = document.getElementById('waitError');
const waitMsg = document.getElementById('waitMsg');

let currentRoomCode = null;
let isHost = false;

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

btnShowJoin.addEventListener('click', () => {
  joinSection.classList.toggle('hidden');
});

btnCreate.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) return showError(landingError, 'Please enter your name');

  btnCreate.disabled = true;
  socket.emit('create-room', { playerName: name }, (res) => {
    btnCreate.disabled = false;
    if (res.error) return showError(landingError, res.error);
    currentRoomCode = res.roomCode;
    isHost = true;
    enterWaitingRoom();
  });
});

btnJoin.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!name) return showError(landingError, 'Please enter your name');
  if (!code) return showError(landingError, 'Please enter a room code');

  btnJoin.disabled = true;
  socket.emit('join-room', { roomCode: code, playerName: name }, (res) => {
    btnJoin.disabled = false;
    if (res.error) return showError(landingError, res.error);
    currentRoomCode = res.roomCode;
    isHost = false;
    enterWaitingRoom();
  });
});

function enterWaitingRoom() {
  landing.classList.add('hidden');
  waitingRoom.classList.remove('hidden');
  roomCodeDisplay.textContent = currentRoomCode;
}

btnStart.addEventListener('click', () => {
  btnStart.disabled = true;
  socket.emit('start-game', { roomCode: currentRoomCode }, (res) => {
    btnStart.disabled = false;
    if (res.error) return showError(waitError, res.error);
  });
});

socket.on('lobby-update', ({ players, hostId }) => {
  playerList.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.isHost ? ' (Host)' : '');
    if (p.isHost) li.classList.add('host');
    playerList.appendChild(li);
  });

  const count = players.length;
  waitMsg.textContent = `${count} player${count !== 1 ? 's' : ''} in room${count < 2 ? ' (need at least 2)' : ''}`;

  if (isHost && count >= 2) {
    btnStart.classList.remove('hidden');
  } else {
    btnStart.classList.add('hidden');
  }
});

socket.on('game-started', () => {
  sessionStorage.setItem('bluff-room', currentRoomCode);
  sessionStorage.setItem('bluff-name', playerNameInput.value.trim());
  window.location.href = '/game';
});

socket.on('disconnect', () => {
  if (currentRoomCode) {
    showError(waitError, 'Lost connection to server. Reconnecting\u2026');
  }
});

socket.on('connect', () => {
  if (currentRoomCode) {
    const name = playerNameInput.value.trim();
    socket.emit('join-room', { roomCode: currentRoomCode, playerName: name }, (res) => {
      if (res.error) {
        showError(waitError, 'Room was lost (server restarted). Please create a new room.');
        currentRoomCode = null;
        waitingRoom.classList.add('hidden');
        landing.classList.remove('hidden');
      }
    });
  }
});
