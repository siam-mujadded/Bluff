const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: id++, suit, rank, isJoker: false });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: id++, suit: null, rank: 'Joker', isJoker: true });
  }
  return deck;
}

function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deal(deck, numPlayers) {
  const cardsPerPlayer = Math.floor(deck.length / numPlayers);
  const hands = [];
  let index = 0;
  for (let p = 0; p < numPlayers; p++) {
    hands.push(deck.slice(index, index + cardsPerPlayer));
    index += cardsPerPlayer;
  }
  const discarded = deck.slice(index);
  return { hands, discarded };
}

module.exports = { createDeck, shuffle, deal, RANKS };
