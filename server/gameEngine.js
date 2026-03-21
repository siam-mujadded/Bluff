const { createDeck, shuffle, deal, RANKS } = require('./deck');

const PHASES = {
  NEW_ROUND: 'NEW_ROUND',
  IN_PLAY: 'IN_PLAY',
  FULL_CIRCLE: 'FULL_CIRCLE',
  GAME_OVER: 'GAME_OVER',
};

function createGameState(players) {
  const deck = shuffle(createDeck());
  const { hands, discarded } = deal(deck, players.length);

  const playerStates = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    hand: hands[i],
    connected: true,
    hasWon: false,
  }));

  const dealerIndex = Math.floor(Math.random() * players.length);

  return {
    phase: PHASES.NEW_ROUND,
    players: playerStates,
    currentPlayerIndex: getNextActivePlayer(playerStates, dealerIndex),
    declaredType: null,
    board: [],
    lastPlayerIndex: null,
    lastPlayedCards: [],
    discardedPile: discarded,
    dealerIndex,
    winner: null,
  };
}

function getNextActivePlayer(players, fromIndex) {
  const n = players.length;
  let idx = ((fromIndex - 1) + n) % n;
  let checked = 0;
  while (checked < n) {
    if (!players[idx].hasWon && players[idx].connected) return idx;
    idx = ((idx - 1) + n) % n;
    checked++;
  }
  return -1;
}

function countActivePlayers(state) {
  return state.players.filter(p => !p.hasWon && p.connected).length;
}

function checkForWinner(state) {
  const active = state.players.filter(p => !p.hasWon && p.connected);
  if (active.length <= 1) {
    state.phase = PHASES.GAME_OVER;
    state.winner = active.length === 1 ? active[0].name : null;
    return true;
  }
  return false;
}

function playCards(state, playerIndex, cardIds, declaredType) {
  const player = state.players[playerIndex];

  if (playerIndex !== state.currentPlayerIndex) {
    return { error: 'Not your turn' };
  }
  if (player.hasWon) {
    return { error: 'You have already won' };
  }
  if (!cardIds || cardIds.length === 0) {
    return { error: 'You must play at least one card' };
  }

  const cards = [];
  for (const cid of cardIds) {
    const card = player.hand.find(c => c.id === cid);
    if (!card) return { error: 'Card not in your hand' };
    cards.push(card);
  }

  if (state.phase === PHASES.NEW_ROUND) {
    if (!declaredType || !RANKS.includes(declaredType)) {
      return { error: 'You must declare a valid card type (2-A)' };
    }
    state.declaredType = declaredType;
  } else if (state.phase === PHASES.IN_PLAY || state.phase === PHASES.FULL_CIRCLE) {
    // declared type stays the same in ongoing round
  } else {
    return { error: 'Cannot play cards in current phase' };
  }

  player.hand = player.hand.filter(c => !cardIds.includes(c.id));
  state.board.push(...cards);
  state.lastPlayerIndex = playerIndex;
  state.lastPlayedCards = cards;

  if (player.hand.length === 0) {
    player.hasWon = true;
    state.phase = PHASES.GAME_OVER;
    state.winner = player.name;
    return {
      success: true,
      event: 'cards-played',
      cardsCount: cards.length,
      declaredType: state.declaredType,
      playerName: player.name,
      playerIndex,
      gameOver: true,
      winner: player.name,
    };
  }

  state.phase = PHASES.IN_PLAY;
  const nextIdx = getNextActivePlayer(state.players, state.currentPlayerIndex);
  if (nextIdx === -1 || countActivePlayers(state) <= 1) {
    checkForWinner(state);
    return {
      success: true,
      event: 'cards-played',
      cardsCount: cards.length,
      declaredType: state.declaredType,
      playerName: player.name,
      playerIndex,
      gameOver: state.phase === PHASES.GAME_OVER,
      winner: state.winner,
    };
  }

  state.currentPlayerIndex = nextIdx;

  return {
    success: true,
    event: 'cards-played',
    cardsCount: cards.length,
    declaredType: state.declaredType,
    playerName: player.name,
    playerIndex,
    gameOver: false,
  };
}

function pass(state, playerIndex) {
  if (playerIndex !== state.currentPlayerIndex) {
    return { error: 'Not your turn' };
  }
  if (state.phase !== PHASES.IN_PLAY) {
    return { error: 'Cannot pass in the current phase' };
  }

  const nextIdx = getNextActivePlayer(state.players, state.currentPlayerIndex);

  if (nextIdx === state.lastPlayerIndex) {
    state.phase = PHASES.FULL_CIRCLE;
    state.currentPlayerIndex = nextIdx;
    return {
      success: true,
      event: 'full-circle',
      playerName: state.players[playerIndex].name,
      currentPlayerIndex: nextIdx,
      currentPlayerName: state.players[nextIdx].name,
    };
  }

  state.currentPlayerIndex = nextIdx;

  return {
    success: true,
    event: 'player-passed',
    playerName: state.players[playerIndex].name,
    currentPlayerIndex: nextIdx,
  };
}

function isBluff(cards, declaredType) {
  const jokers = cards.filter(c => c.isJoker);
  const nonJokers = cards.filter(c => !c.isJoker);

  if (nonJokers.length === 0) return true;

  const distinctRanks = new Set(nonJokers.map(c => c.rank));
  if (distinctRanks.size > 1) return true;
  if (!distinctRanks.has(declaredType)) return true;

  return false;
}

function callBluff(state, playerIndex) {
  if (playerIndex !== state.currentPlayerIndex) {
    return { error: 'Not your turn' };
  }
  if (state.phase !== PHASES.IN_PLAY) {
    return { error: 'Cannot call bluff in current phase' };
  }
  if (state.lastPlayerIndex === null || state.lastPlayedCards.length === 0) {
    return { error: 'No cards to challenge' };
  }

  const accusedIndex = state.lastPlayerIndex;
  const caller = state.players[playerIndex];
  const accused = state.players[accusedIndex];
  const bluffDetected = isBluff(state.lastPlayedCards, state.declaredType);
  const revealedCards = [...state.lastPlayedCards];
  const boardCards = [...state.board];

  let loserIndex, winnerIndex;

  if (bluffDetected) {
    loserIndex = accusedIndex;
    winnerIndex = playerIndex;
    accused.hand.push(...state.board);
  } else {
    loserIndex = playerIndex;
    winnerIndex = accusedIndex;
    caller.hand.push(...state.board);
  }

  state.board = [];
  state.lastPlayedCards = [];
  state.lastPlayerIndex = null;
  state.declaredType = null;
  state.phase = PHASES.NEW_ROUND;

  const bluffWinner = state.players[winnerIndex];
  if (bluffWinner.hand.length === 0 && !bluffWinner.hasWon) {
    bluffWinner.hasWon = true;
  }

  if (checkForWinner(state)) {
    return {
    success: true,
    event: 'bluff-result',
    callerName: caller.name,
    callerIndex: playerIndex,
    accusedName: accused.name,
    accusedIndex,
    bluffDetected,
    boardCardCount: boardCards.length,
    pickupCardIds: boardCards.map(c => c.id),
    loserIndex,
    winnerIndex,
    gameOver: true,
    winner: state.winner,
  };
  }

  state.currentPlayerIndex = winnerIndex;
  if (state.players[winnerIndex].hasWon) {
    state.currentPlayerIndex = getNextActivePlayer(state.players, winnerIndex);
  }

  return {
    success: true,
    event: 'bluff-result',
    callerName: caller.name,
    callerIndex: playerIndex,
    accusedName: accused.name,
    accusedIndex,
    bluffDetected,
    boardCardCount: boardCards.length,
    pickupCardIds: boardCards.map(c => c.id),
    loserIndex,
    winnerIndex,
    newCurrentPlayerIndex: state.currentPlayerIndex,
    gameOver: false,
  };
}

function discardBoard(state, playerIndex) {
  if (playerIndex !== state.currentPlayerIndex) {
    return { error: 'Not your turn' };
  }
  if (state.phase !== PHASES.FULL_CIRCLE) {
    return { error: 'Can only discard in full circle phase' };
  }
  if (playerIndex !== state.lastPlayerIndex) {
    return { error: 'Only the last player who played can discard' };
  }

  const discardedCount = state.board.length;
  state.discardedPile.push(...state.board);
  state.board = [];
  state.lastPlayedCards = [];
  state.lastPlayerIndex = null;
  state.declaredType = null;
  state.phase = PHASES.NEW_ROUND;

  if (checkForWinner(state)) {
    return {
      success: true,
      event: 'board-discarded',
      discardedCount,
      playerName: state.players[playerIndex].name,
      gameOver: true,
      winner: state.winner,
    };
  }

  return {
    success: true,
    event: 'board-discarded',
    discardedCount,
    playerName: state.players[playerIndex].name,
    currentPlayerIndex: state.currentPlayerIndex,
    gameOver: false,
  };
}

function getPublicState(state) {
  return {
    phase: state.phase,
    currentPlayerIndex: state.currentPlayerIndex,
    declaredType: state.declaredType,
    boardCount: state.board.length,
    lastPlayerIndex: state.lastPlayerIndex,
    lastPlayedCount: state.lastPlayedCards.length,
    dealerIndex: state.dealerIndex,
    winner: state.winner,
    turnDeadline: state.turnDeadline || null,
    players: state.players.map(p => ({
      name: p.name,
      cardCount: p.hand.length,
      connected: p.connected,
      hasWon: p.hasWon,
    })),
  };
}

module.exports = {
  PHASES,
  createGameState,
  playCards,
  pass,
  callBluff,
  discardBoard,
  getPublicState,
  getNextActivePlayer,
};
