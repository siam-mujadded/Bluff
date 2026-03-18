# Bluff - Multiplayer Card Game

A real-time multiplayer card game of deception. Players take turns placing cards face-down, declaring their type -- but they might be bluffing. Call their bluff to catch them, or risk picking up the pile yourself.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser. Share the room code with friends so they can join from their own browsers.

## How to Play

1. **Create or Join a Room** -- One player creates a room and shares the 6-character code. Others join using the code. 2-8 players supported.

2. **Starting a Round** -- The first player places 1 or more cards face-down and declares a card type (e.g., "3 Aces"). They may be telling the truth or bluffing.

3. **Your Turn Options** (anti-clockwise order):
   - **Play Cards** -- Add cards to the pile, claiming they are the same declared type
   - **Call Bluff** -- Challenge the last player who placed cards. If they bluffed, they pick up the entire pile. If they didn't, you pick it up.
   - **Pass** -- Skip your turn

4. **Full Circle** -- If everyone passes and it comes back to the last player who placed cards, they can either discard the entire pile from the game or play more cards.

5. **Joker Rules** -- Jokers mixed with one card type are valid (e.g., 2 Aces + 1 Joker = 3 Aces). All jokers alone is always a bluff. Jokers mixed with multiple types is also a bluff.

6. **Winning** -- First player to empty their hand wins!

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla HTML, CSS, JavaScript
