const socket = io({ reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 2000 });

// State
let myIndex = -1;
let myHand = [];
let selectedCardIds = new Set();
let gameState = null;
let roomCode = sessionStorage.getItem('bluff-room');
let playerName = sessionStorage.getItem('bluff-name');

if (!roomCode || !playerName) {
  window.location.href = '/';
}

// DOM refs
const handArea = document.getElementById('handArea');
const opponents = document.getElementById('opponents');
const boardPileCount = document.getElementById('boardPileCount');
const boardCount = document.getElementById('boardCount');
const roundType = document.getElementById('roundType');
const phaseDisplay = document.getElementById('phaseDisplay');
const turnDisplay = document.getElementById('turnDisplay');
const typeSelect = document.getElementById('typeSelect');
const toastContainer = document.getElementById('toastContainer');
const bluffOverlay = document.getElementById('bluffOverlay');
const bluffTitle = document.getElementById('bluffTitle');
const bluffDetail = document.getElementById('bluffDetail');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const winnerText = document.getElementById('winnerText');
const boardPile = document.getElementById('boardPile');

const newRoundControls = document.getElementById('newRoundControls');
const inPlayControls = document.getElementById('inPlayControls');
const fullCircleControls = document.getElementById('fullCircleControls');
const waitingMsg = document.getElementById('waitingMsg');

const btnPlayNew = document.getElementById('btnPlayNew');
const btnPlaySame = document.getElementById('btnPlaySame');
const btnCallBluff = document.getElementById('btnCallBluff');
const btnPass = document.getElementById('btnPass');
const btnPlayCircle = document.getElementById('btnPlayCircle');
const btnDiscard = document.getElementById('btnDiscard');

// ─── Suit symbols ───
const SUIT_SYMBOLS = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS = {
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
  spades: 'black',
};

// ─── Toast ───
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  toastContainer.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ─── Card rendering ───
function renderCard(card, selectable = false) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = card.id;

  if (card.isJoker) {
    el.classList.add('card-joker');
    el.innerHTML = `<div class="card-rank">Jkr</div><div class="card-suit joker-star">\u2605</div>`;
  } else {
    const color = SUIT_COLORS[card.suit];
    el.classList.add(`card-${color}`);
    el.innerHTML = `<div class="card-rank">${card.rank}</div><div class="card-suit">${SUIT_SYMBOLS[card.suit]}</div>`;
  }

  if (selectable) {
    if (selectedCardIds.has(card.id)) el.classList.add('selected');
    el.addEventListener('click', () => toggleCard(card.id));
  }

  return el;
}

function toggleCard(id) {
  if (selectedCardIds.has(id)) {
    selectedCardIds.delete(id);
  } else {
    selectedCardIds.add(id);
  }
  renderHand();
}

function renderHand() {
  handArea.innerHTML = '';
  const sorted = [...myHand].sort((a, b) => {
    if (a.isJoker && !b.isJoker) return 1;
    if (!a.isJoker && b.isJoker) return -1;
    if (a.isJoker && b.isJoker) return 0;
    const rankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const ri = rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
    if (ri !== 0) return ri;
    return a.suit.localeCompare(b.suit);
  });
  sorted.forEach(card => {
    handArea.appendChild(renderCard(card, true));
  });
}

// ─── Opponent rendering ───
function renderOpponents() {
  if (!gameState) return;
  opponents.innerHTML = '';
  gameState.players.forEach((p, i) => {
    if (i === myIndex) return;
    const div = document.createElement('div');
    div.className = 'opponent';
    if (i === gameState.currentPlayerIndex) div.classList.add('active-player');
    if (p.hasWon) div.classList.add('opponent-won');
    if (!p.connected) div.classList.add('opponent-disconnected');

    const nameEl = document.createElement('div');
    nameEl.className = 'opponent-name';
    nameEl.textContent = p.name;
    if (i === gameState.dealerIndex) nameEl.textContent += ' (D)';

    const countEl = document.createElement('div');
    countEl.className = 'opponent-cards';
    if (p.hasWon) {
      countEl.textContent = 'WON';
      countEl.classList.add('won-badge');
    } else {
      countEl.textContent = p.cardCount + ' cards';
    }

    const backs = document.createElement('div');
    backs.className = 'opponent-card-backs';
    const displayCount = Math.min(p.cardCount, 10);
    for (let c = 0; c < displayCount; c++) {
      const back = document.createElement('div');
      back.className = 'card-back-mini';
      backs.appendChild(back);
    }

    div.appendChild(nameEl);
    div.appendChild(backs);
    div.appendChild(countEl);
    opponents.appendChild(div);
  });
}

// ─── Board rendering ───
function renderBoard() {
  if (!gameState) return;
  boardPileCount.textContent = gameState.boardCount;
  boardCount.textContent = gameState.boardCount + ' cards';
  roundType.textContent = gameState.declaredType || '--';
  boardPile.classList.toggle('has-cards', gameState.boardCount > 0);
}

// ─── Controls ───
function updateControls() {
  if (!gameState) return;

  newRoundControls.classList.add('hidden');
  inPlayControls.classList.add('hidden');
  fullCircleControls.classList.add('hidden');
  waitingMsg.classList.add('hidden');

  const isMyTurn = gameState.currentPlayerIndex === myIndex;
  const phase = gameState.phase;

  const phaseNames = {
    NEW_ROUND: 'New Round',
    IN_PLAY: 'In Play',
    FULL_CIRCLE: 'Full Circle',
    GAME_OVER: 'Game Over',
  };
  phaseDisplay.textContent = phaseNames[phase] || phase;

  if (gameState.players[gameState.currentPlayerIndex]) {
    const currentName = gameState.players[gameState.currentPlayerIndex].name;
    turnDisplay.textContent = isMyTurn ? 'Your Turn!' : currentName;
    turnDisplay.classList.toggle('your-turn', isMyTurn);
  }

  if (phase === 'GAME_OVER') return;

  if (!isMyTurn) {
    waitingMsg.classList.remove('hidden');
    waitingMsg.textContent = `Waiting for ${gameState.players[gameState.currentPlayerIndex]?.name || '...'}`;
    return;
  }

  if (phase === 'NEW_ROUND') {
    newRoundControls.classList.remove('hidden');
  } else if (phase === 'IN_PLAY') {
    inPlayControls.classList.remove('hidden');
  } else if (phase === 'FULL_CIRCLE') {
    fullCircleControls.classList.remove('hidden');
  }
}

// ─── Action handlers ───
btnPlayNew.addEventListener('click', () => {
  const type = typeSelect.value;
  if (!type) return showToast('Choose a card type first', 'error');
  if (selectedCardIds.size === 0) return showToast('Select cards to play', 'error');
  socket.emit('play-cards', {
    roomCode,
    cardIds: Array.from(selectedCardIds),
    declaredType: type,
  });
  selectedCardIds.clear();
});

btnPlaySame.addEventListener('click', () => {
  if (selectedCardIds.size === 0) return showToast('Select cards to play', 'error');
  socket.emit('play-cards', {
    roomCode,
    cardIds: Array.from(selectedCardIds),
    declaredType: gameState.declaredType,
  });
  selectedCardIds.clear();
});

btnCallBluff.addEventListener('click', () => {
  socket.emit('call-bluff', { roomCode });
});

btnPass.addEventListener('click', () => {
  socket.emit('pass-turn', { roomCode });
});

btnPlayCircle.addEventListener('click', () => {
  if (selectedCardIds.size === 0) return showToast('Select cards to play', 'error');
  socket.emit('play-cards', {
    roomCode,
    cardIds: Array.from(selectedCardIds),
    declaredType: gameState.declaredType,
  });
  selectedCardIds.clear();
});

btnDiscard.addEventListener('click', () => {
  socket.emit('discard-board', { roomCode });
});

// ─── Socket events ───
socket.on('your-index', ({ index }) => {
  myIndex = index;
});

socket.on('hand-update', ({ hand }) => {
  myHand = hand;
  selectedCardIds.clear();
  renderHand();
});

socket.on('game-state', (state) => {
  gameState = state;
  renderOpponents();
  renderBoard();
  updateControls();
});

socket.on('cards-played', ({ playerName, count, declaredType }) => {
  showToast(`${playerName} played ${count} card${count > 1 ? 's' : ''} as ${declaredType}`, 'info');
});

socket.on('player-passed', ({ playerName }) => {
  showToast(`${playerName} passed`, 'info');
});

socket.on('full-circle', ({ currentPlayerName }) => {
  showToast(`All players passed. ${currentPlayerName} can discard or play more.`, 'warn');
});

socket.on('bluff-result', ({ callerName, accusedName, bluffDetected, boardCardCount }) => {
  bluffOverlay.classList.remove('hidden');

  if (bluffDetected) {
    bluffTitle.textContent = 'BLUFF CAUGHT!';
    bluffTitle.className = 'bluff-success';
    bluffDetail.textContent = `${callerName} caught ${accusedName} bluffing! ${accusedName} picks up ${boardCardCount} cards.`;
  } else {
    bluffTitle.textContent = 'NOT A BLUFF!';
    bluffTitle.className = 'bluff-fail';
    bluffDetail.textContent = `${accusedName} was telling the truth! ${callerName} picks up ${boardCardCount} cards.`;
  }

  setTimeout(() => {
    bluffOverlay.classList.add('hidden');
  }, 3000);
});

socket.on('board-discarded', ({ playerName, discardedCount }) => {
  showToast(`${playerName} discarded ${discardedCount} cards from the board`, 'info');
});

socket.on('player-disconnected', ({ playerName }) => {
  showToast(`${playerName} disconnected`, 'error');
});

socket.on('action-error', ({ message }) => {
  showToast(message, 'error');
});

socket.on('game-over', ({ winner }) => {
  gameOverOverlay.classList.remove('hidden');
  winnerText.textContent = winner ? `${winner} wins!` : 'Game ended.';
});

socket.on('connect', () => {
  if (roomCode && playerName) {
    socket.emit('rejoin-room', { roomCode, playerName }, (res) => {
      if (res.error) {
        showToast('Room lost (server restarted). Returning to lobby\u2026', 'error');
        sessionStorage.removeItem('bluff-room');
        sessionStorage.removeItem('bluff-name');
        setTimeout(() => { window.location.href = '/'; }, 2500);
      }
    });
  }
});

socket.on('disconnect', () => {
  showToast('Connection lost. Reconnecting\u2026', 'error');
});

// ─── Chat ───
const chatToggle = document.getElementById('chatToggle');
const chatPanel = document.getElementById('chatPanel');
const chatClose = document.getElementById('chatClose');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const chatBadge = document.getElementById('chatBadge');

let chatOpen = false;
let unreadCount = 0;

chatToggle.addEventListener('click', () => {
  chatOpen = !chatOpen;
  chatPanel.classList.toggle('hidden', !chatOpen);
  chatToggle.classList.toggle('chat-toggle-active', chatOpen);
  if (chatOpen) {
    unreadCount = 0;
    chatBadge.classList.add('hidden');
    chatInput.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});

chatClose.addEventListener('click', () => {
  chatOpen = false;
  chatPanel.classList.add('hidden');
  chatToggle.classList.remove('chat-toggle-active');
});

function appendChatMessage(sender, text, isMine) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chat-msg' + (isMine ? ' chat-msg-mine' : '');

  const nameEl = document.createElement('span');
  nameEl.className = 'chat-msg-name';
  nameEl.textContent = sender;

  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
                  now.getMinutes().toString().padStart(2, '0');
  const timeEl = document.createElement('span');
  timeEl.className = 'chat-msg-time';
  timeEl.textContent = timeStr;

  const header = document.createElement('div');
  header.className = 'chat-msg-header';
  header.appendChild(nameEl);
  header.appendChild(timeEl);

  const body = document.createElement('div');
  body.className = 'chat-msg-body';
  body.textContent = text;

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  appendChatMessage(playerName, text, true);
  socket.emit('chat-message', { roomCode, message: text });
  chatInput.value = '';
  chatInput.focus();
}

chatSend.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

socket.on('chat-message', ({ sender, text }) => {
  appendChatMessage(sender, text, false);
  if (!chatOpen) {
    unreadCount++;
    chatBadge.textContent = unreadCount;
    chatBadge.classList.remove('hidden');
  }
});
