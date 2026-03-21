const socket = io({ reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 2000 });

// ─── State ───
let myIndex = -1;
let myHand = [];
let selectedCardIds = new Set();
let highlightedCardIds = new Set();
let gameState = null;
let roomCode = sessionStorage.getItem('bluff-room');
let playerName = sessionStorage.getItem('bluff-name');
let turnTimerInterval = null;

if (!roomCode || !playerName) {
  window.location.href = '/';
}

// ─── DOM refs ───
const handArea = document.getElementById('handArea');
const boardPileCount = document.getElementById('boardPileCount');
const boardCount = document.getElementById('boardCount');
const roundType = document.getElementById('roundType');
const phaseDisplay = document.getElementById('phaseDisplay');
const timerDisplay = document.getElementById('timerDisplay');
const timerItem = document.getElementById('timerItem');
const typeSelect = document.getElementById('typeSelect');
const toastContainer = document.getElementById('toastContainer');
const bluffOverlay = document.getElementById('bluffOverlay');
const bluffTitle = document.getElementById('bluffTitle');
const bluffDetail = document.getElementById('bluffDetail');
const bluffSarcasm = document.getElementById('bluffSarcasm');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const winnerText = document.getElementById('winnerText');
const boardPile = document.getElementById('boardPile');
const playerSeatsEl = document.getElementById('playerSeats');
const gameTimerSelect = document.getElementById('gameTimerSelect');

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

// ─── Constants ───
const SUIT_SYMBOLS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
const SUIT_COLORS = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };

const SARCASM_CAUGHT = [
  "Caught red-handed! Nice poker face though... NOT!",
  "Your bluffing skills need some serious work!",
  "Did you really think that would work?",
  "The art of deception... you haven't mastered it yet!",
  "That was about as subtle as a freight train!",
  "Better luck next time, bluffer!",
  "Busted! Time to pick up those cards, friend!",
  "That bluff was so bad, even the cards are laughing.",
  "Pro tip: practice your poker face in the mirror first.",
  "And the award for worst bluff goes to...",
];

const SARCASM_WRONG_CALL = [
  "Doubted the wrong person! Oops!",
  "Trust issues much? Should have believed them!",
  "That backfired spectacularly!",
  "You played yourself! Congratulations!",
  "Note to self: don't accuse honest people!",
  "Well, that was embarrassing...",
  "Maybe next time, trust your instincts... wait, don't.",
  "The call was wrong. The cards don't lie!",
  "Innocent until proven guilty, and they were innocent!",
  "You came, you accused, you picked up cards.",
];

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Toast ───
function showToast(msg, type) {
  type = type || 'info';
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  toastContainer.appendChild(t);
  requestAnimationFrame(function() { t.classList.add('show'); });
  setTimeout(function() {
    t.classList.remove('show');
    setTimeout(function() { t.remove(); }, 300);
  }, 3000);
}

// ─── Card rendering ───
function renderCard(card, selectable) {
  var el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = card.id;

  if (card.isJoker) {
    el.classList.add('card-joker');
    el.innerHTML = '<div class="card-rank">Jkr</div><div class="card-suit joker-star">\u2605</div>';
  } else {
    el.classList.add('card-' + SUIT_COLORS[card.suit]);
    el.innerHTML = '<div class="card-rank">' + card.rank + '</div><div class="card-suit">' + SUIT_SYMBOLS[card.suit] + '</div>';
  }

  if (highlightedCardIds.has(card.id)) {
    el.classList.add('card-highlighted');
  }

  if (selectable) {
    if (selectedCardIds.has(card.id)) el.classList.add('selected');
    el.addEventListener('click', function() { toggleCard(card.id); });
  }

  return el;
}

function toggleCard(id) {
  if (selectedCardIds.has(id)) selectedCardIds.delete(id);
  else selectedCardIds.add(id);
  renderHand();
}

function renderHand() {
  handArea.innerHTML = '';
  var sorted = myHand.slice().sort(function(a, b) {
    if (a.isJoker && !b.isJoker) return 1;
    if (!a.isJoker && b.isJoker) return -1;
    if (a.isJoker && b.isJoker) return 0;
    var order = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    var ri = order.indexOf(a.rank) - order.indexOf(b.rank);
    if (ri !== 0) return ri;
    return a.suit.localeCompare(b.suit);
  });
  sorted.forEach(function(card) { handArea.appendChild(renderCard(card, true)); });
}

// ─── Circular player seats ───
function renderPlayerSeats() {
  playerSeatsEl.innerHTML = '';
  if (!gameState || myIndex === -1) return;

  var players = gameState.players;
  var n = players.length;

  for (var i = 0; i < n; i++) {
    var offset = (i - myIndex + n) % n;
    var angle = Math.PI / 2 - (offset / n) * 2 * Math.PI;
    var xPct = 50 + 40 * Math.cos(angle);
    var yPct = 50 + 38 * Math.sin(angle);

    var p = players[i];
    var seat = document.createElement('div');
    seat.className = 'player-seat';
    if (i === gameState.currentPlayerIndex) seat.classList.add('active');
    if (i === myIndex) seat.classList.add('is-me');
    if (p.hasWon) seat.classList.add('won');
    if (!p.connected) seat.classList.add('disconnected');

    var nameEl = document.createElement('div');
    nameEl.className = 'seat-name';
    var label = p.name;
    if (i === myIndex) label += ' (You)';
    if (i === gameState.dealerIndex) label += ' [D]';
    nameEl.textContent = label;

    var countEl = document.createElement('div');
    countEl.className = 'seat-count';
    if (p.hasWon) { countEl.textContent = 'WON'; countEl.classList.add('won-text'); }
    else { countEl.textContent = p.cardCount + ' cards'; }

    seat.appendChild(nameEl);

    if (!p.hasWon && i !== myIndex) {
      var backs = document.createElement('div');
      backs.className = 'seat-card-backs';
      var show = Math.min(p.cardCount, 8);
      for (var c = 0; c < show; c++) {
        var b = document.createElement('div');
        b.className = 'card-back-mini';
        backs.appendChild(b);
      }
      seat.appendChild(backs);
    }

    seat.appendChild(countEl);
    seat.style.left = xPct + '%';
    seat.style.top = yPct + '%';
    playerSeatsEl.appendChild(seat);
  }
}

// ─── Board rendering ───
function renderBoard() {
  if (!gameState) return;
  boardPileCount.textContent = gameState.boardCount;
  boardCount.textContent = gameState.boardCount + ' cards';
  roundType.textContent = gameState.declaredType || '--';
  boardPile.classList.toggle('has-cards', gameState.boardCount > 0);
}

// ─── Timer ───
function startClientTimer(deadline) {
  clearInterval(turnTimerInterval);
  if (!deadline) {
    timerDisplay.textContent = '--';
    timerDisplay.className = 'info-value';
    return;
  }
  function tick() {
    var remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerDisplay.textContent = remaining + 's';
    if (remaining <= 5) timerDisplay.className = 'info-value timer-danger';
    else if (remaining <= 10) timerDisplay.className = 'info-value timer-warning';
    else timerDisplay.className = 'info-value';
    if (remaining <= 0) clearInterval(turnTimerInterval);
  }
  tick();
  turnTimerInterval = setInterval(tick, 500);
}

// ─── Controls ───
function updateControls() {
  if (!gameState) return;

  newRoundControls.classList.add('hidden');
  inPlayControls.classList.add('hidden');
  fullCircleControls.classList.add('hidden');
  waitingMsg.classList.add('hidden');

  var isMyTurn = gameState.currentPlayerIndex === myIndex;
  var phase = gameState.phase;

  var phaseNames = { NEW_ROUND: 'New Round', IN_PLAY: 'In Play', FULL_CIRCLE: 'Full Circle', GAME_OVER: 'Game Over' };
  phaseDisplay.textContent = phaseNames[phase] || phase;

  startClientTimer(gameState.turnDeadline);

  if (phase === 'GAME_OVER') return;

  if (!isMyTurn) {
    waitingMsg.classList.remove('hidden');
    var currentName = gameState.players[gameState.currentPlayerIndex] ? gameState.players[gameState.currentPlayerIndex].name : '...';
    waitingMsg.textContent = 'Waiting for ' + currentName;
    return;
  }

  if (phase === 'NEW_ROUND') newRoundControls.classList.remove('hidden');
  else if (phase === 'IN_PLAY') inPlayControls.classList.remove('hidden');
  else if (phase === 'FULL_CIRCLE') fullCircleControls.classList.remove('hidden');
}

// ─── Action handlers ───
btnPlayNew.addEventListener('click', function() {
  var type = typeSelect.value;
  if (!type) return showToast('Choose a card type first', 'error');
  if (selectedCardIds.size === 0) return showToast('Select cards to play', 'error');
  socket.emit('play-cards', { roomCode: roomCode, cardIds: Array.from(selectedCardIds), declaredType: type });
  selectedCardIds.clear();
});

btnPlaySame.addEventListener('click', function() {
  if (selectedCardIds.size === 0) return showToast('Select cards to play', 'error');
  socket.emit('play-cards', { roomCode: roomCode, cardIds: Array.from(selectedCardIds), declaredType: gameState.declaredType });
  selectedCardIds.clear();
});

btnCallBluff.addEventListener('click', function() { socket.emit('call-bluff', { roomCode: roomCode }); });
btnPass.addEventListener('click', function() { socket.emit('pass-turn', { roomCode: roomCode }); });

btnPlayCircle.addEventListener('click', function() {
  if (selectedCardIds.size === 0) return showToast('Select cards to play', 'error');
  socket.emit('play-cards', { roomCode: roomCode, cardIds: Array.from(selectedCardIds), declaredType: gameState.declaredType });
  selectedCardIds.clear();
});

btnDiscard.addEventListener('click', function() { socket.emit('discard-board', { roomCode: roomCode }); });

gameTimerSelect.addEventListener('change', function() {
  var val = parseInt(gameTimerSelect.value) || 0;
  socket.emit('change-timer', { roomCode: roomCode, turnTimeout: val });
});

// ─── Socket events ───
socket.on('your-index', function(data) { myIndex = data.index; });

socket.on('hand-update', function(data) {
  myHand = data.hand;
  selectedCardIds.clear();
  renderHand();
});

socket.on('game-state', function(state) {
  var wasMyTurn = gameState && gameState.currentPlayerIndex === myIndex;
  gameState = state;
  var isMyTurn = gameState.currentPlayerIndex === myIndex;

  if (isMyTurn && !wasMyTurn && highlightedCardIds.size > 0) {
    highlightedCardIds.clear();
    renderHand();
  }

  renderPlayerSeats();
  renderBoard();
  updateControls();
});

socket.on('cards-played', function(data) {
  showToast(data.playerName + ' played ' + data.count + ' card' + (data.count > 1 ? 's' : '') + ' as ' + data.declaredType, 'info');
});

socket.on('player-passed', function(data) { showToast(data.playerName + ' passed', 'info'); });

socket.on('full-circle', function(data) {
  showToast('All players passed. ' + data.currentPlayerName + ' can discard or play more.', 'warn');
});

socket.on('bluff-result', function(data) {
  bluffOverlay.classList.remove('hidden');

  if (data.bluffDetected) {
    bluffTitle.textContent = 'BLUFF CAUGHT!';
    bluffTitle.className = 'bluff-success';
    bluffDetail.textContent = data.callerName + ' caught ' + data.accusedName + ' bluffing! ' + data.accusedName + ' picks up ' + data.boardCardCount + ' cards.';
    bluffSarcasm.textContent = randomFrom(SARCASM_CAUGHT);
  } else {
    bluffTitle.textContent = 'NOT A BLUFF!';
    bluffTitle.className = 'bluff-fail';
    bluffDetail.textContent = data.accusedName + ' was telling the truth! ' + data.callerName + ' picks up ' + data.boardCardCount + ' cards.';
    bluffSarcasm.textContent = randomFrom(SARCASM_WRONG_CALL);
  }

  setTimeout(function() { bluffOverlay.classList.add('hidden'); }, 3500);
});

socket.on('bluff-pickup', function(data) {
  highlightedCardIds = new Set(data.cardIds);
});

socket.on('turn-timeout', function(data) {
  showToast(data.playerName + "'s turn timed out!", 'warn');
});

socket.on('timer-changed', function(data) {
  var label = data.turnTimeout > 0 ? (data.turnTimeout + 's') : 'No Limit';
  showToast(data.changedBy + ' changed the turn timer to ' + label, 'warn');
  gameTimerSelect.value = String(data.turnTimeout);
});

socket.on('board-discarded', function(data) {
  showToast(data.playerName + ' discarded ' + data.discardedCount + ' cards from the board', 'info');
});

socket.on('player-disconnected', function(data) { showToast(data.playerName + ' disconnected', 'error'); });
socket.on('action-error', function(data) { showToast(data.message, 'error'); });

socket.on('game-over', function(data) {
  gameOverOverlay.classList.remove('hidden');
  winnerText.textContent = data.winner ? data.winner + ' wins!' : 'Game ended.';
});

socket.on('connect', function() {
  if (roomCode && playerName) {
    socket.emit('rejoin-room', { roomCode: roomCode, playerName: playerName }, function(res) {
      if (res.error) {
        showToast('Room lost (server restarted). Returning to lobby\u2026', 'error');
        sessionStorage.removeItem('bluff-room');
        sessionStorage.removeItem('bluff-name');
        setTimeout(function() { window.location.href = '/'; }, 2500);
      }
    });
  }
});

socket.on('disconnect', function() { showToast('Connection lost. Reconnecting\u2026', 'error'); });

// ─── Chat ───
var chatToggle = document.getElementById('chatToggle');
var chatPanel = document.getElementById('chatPanel');
var chatClose = document.getElementById('chatClose');
var chatMessages = document.getElementById('chatMessages');
var chatInput = document.getElementById('chatInput');
var chatSend = document.getElementById('chatSend');
var chatBadge = document.getElementById('chatBadge');
var chatOpen = false;
var unreadCount = 0;

chatToggle.addEventListener('click', function() {
  chatOpen = !chatOpen;
  chatPanel.classList.toggle('hidden', !chatOpen);
  chatToggle.classList.toggle('chat-toggle-active', chatOpen);
  if (chatOpen) { unreadCount = 0; chatBadge.classList.add('hidden'); chatInput.focus(); chatMessages.scrollTop = chatMessages.scrollHeight; }
});

chatClose.addEventListener('click', function() {
  chatOpen = false; chatPanel.classList.add('hidden'); chatToggle.classList.remove('chat-toggle-active');
});

function appendChatMessage(sender, text, isMine) {
  var wrapper = document.createElement('div');
  wrapper.className = 'chat-msg' + (isMine ? ' chat-msg-mine' : '');
  var nameEl = document.createElement('span'); nameEl.className = 'chat-msg-name'; nameEl.textContent = sender;
  var now = new Date();
  var timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  var timeEl = document.createElement('span'); timeEl.className = 'chat-msg-time'; timeEl.textContent = timeStr;
  var header = document.createElement('div'); header.className = 'chat-msg-header'; header.appendChild(nameEl); header.appendChild(timeEl);
  var body = document.createElement('div'); body.className = 'chat-msg-body'; body.textContent = text;
  wrapper.appendChild(header); wrapper.appendChild(body);
  chatMessages.appendChild(wrapper); chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage() {
  var text = chatInput.value.trim();
  if (!text) return;
  appendChatMessage(playerName, text, true);
  socket.emit('chat-message', { roomCode: roomCode, message: text });
  chatInput.value = ''; chatInput.focus();
}

chatSend.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendChatMessage(); });

socket.on('chat-message', function(data) {
  appendChatMessage(data.sender, data.text, false);
  if (!chatOpen) { unreadCount++; chatBadge.textContent = unreadCount; chatBadge.classList.remove('hidden'); }
});
