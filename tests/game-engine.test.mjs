import assert from "node:assert/strict";
import test from "node:test";
import {
  canBeat,
  chooseAiMove,
  classifyHand,
  createDeck,
  createMatch,
  getLegalMoves,
  observeForAi,
  passTurn,
  playCards,
  resolveTribute,
  restoreGame,
  serializeGame,
  shuffleDeck,
  startNextRound,
} from "../app/game-engine.ts";

function find(deck, rank, suit, deckIndex = 0) {
  const card = deck.find((item) => item.rank === rank && item.suit === suit && item.deck === deckIndex);
  assert.ok(card, `missing ${rank}${suit ?? ""}`);
  return card;
}

test("creates two complete decks with 108 unique cards and deals 27 each", () => {
  const deck = createDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map((card) => card.id)).size, 108);
  const match = createMatch(20260715);
  assert.deepEqual(match.players.map((player) => player.hand.length), [27, 27, 27, 27]);
  assert.equal(new Set(match.players.flatMap((player) => player.hand).map((card) => card.id)).size, 108);
  assert.deepEqual(match.players.map((player) => player.team), [0, 1, 0, 1]);
});

test("shuffle is deterministic for a fixed seed", () => {
  const deck = createDeck();
  const first = shuffleDeck(deck, 6288).map((card) => card.id);
  const second = shuffleDeck(deck, 6288).map((card) => card.id);
  const different = shuffleDeck(deck, 6289).map((card) => card.id);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, different);
});

test("recognizes ordinary patterns, wild cards, straight flush and bombs", () => {
  const deck = createDeck();
  const pair = [find(deck, "K", "♠", 0), find(deck, "K", "♥", 1)];
  assert.equal(classifyHand(pair, "2")?.type, "pair");

  const wildPair = [find(deck, "Q", "♠", 0), find(deck, "2", "♥", 0)];
  assert.equal(classifyHand(wildPair, "2")?.type, "pair");
  assert.equal(classifyHand(wildPair, "2")?.mainRank, "Q");

  const fullHouse = [
    find(deck, "9", "♠", 0),
    find(deck, "9", "♥", 0),
    find(deck, "9", "♣", 0),
    find(deck, "7", "♠", 0),
    find(deck, "7", "♥", 0),
  ];
  assert.equal(classifyHand(fullHouse, "2")?.type, "fullHouse");

  const flush = ["10", "J", "Q", "K", "A"].map((rank) => find(deck, rank, "♠", 0));
  assert.equal(classifyHand(flush, "2")?.type, "straightFlush");

  const bomb = ["♠", "♥", "♣", "♦"].map((suit) => find(deck, "8", suit, 0));
  assert.equal(classifyHand(bomb, "2")?.type, "bomb");

  const jokers = deck.filter((card) => card.rank === "SJ" || card.rank === "BJ");
  assert.equal(classifyHand(jokers, "2")?.type, "jokerBomb");
});

test("applies competitive bomb hierarchy", () => {
  const deck = createDeck();
  const fourBomb = classifyHand(["♠", "♥", "♣", "♦"].map((suit) => find(deck, "8", suit, 0)), "2");
  const fiveBomb = classifyHand([
    find(deck, "7", "♠", 0), find(deck, "7", "♥", 0), find(deck, "7", "♣", 0),
    find(deck, "7", "♦", 0), find(deck, "7", "♠", 1),
  ], "2");
  const straightFlush = classifyHand(["10", "J", "Q", "K", "A"].map((rank) => find(deck, rank, "♦", 0)), "2");
  const sixBomb = classifyHand([
    find(deck, "6", "♠", 0), find(deck, "6", "♥", 0), find(deck, "6", "♣", 0),
    find(deck, "6", "♦", 0), find(deck, "6", "♠", 1), find(deck, "6", "♥", 1),
  ], "2");
  assert.ok(fourBomb && fiveBomb && straightFlush && sixBomb);
  assert.equal(canBeat(fiveBomb, fourBomb, "2"), true);
  assert.equal(canBeat(straightFlush, fiveBomb, "2"), true);
  assert.equal(canBeat(sixBomb, straightFlush, "2"), true);
});

test("rejects an invalid response and allows pass only after a lead", () => {
  const match = createMatch(100);
  const lead = playCards(match, 0, [match.players[0].hand.at(-1).id]);
  assert.equal(lead.ok, true);
  assert.equal(passTurn(match, 0).ok, false);
  const wrongTurn = playCards(lead.state, 0, [lead.state.players[0].hand[0].id]);
  assert.equal(wrongTurn.ok, false);
  const passed = passTurn(lead.state, 1);
  assert.equal(passed.ok, true);
});

test("advances turns clockwise around the visible table", () => {
  const match = createMatch(314);
  assert.deepEqual(match.players.map((player) => player.seat), ["bottom", "right", "top", "left"]);

  const lead = playCards(match, 0, [match.players[0].hand.at(-1).id]);
  assert.equal(lead.ok, true);
  assert.equal(lead.state.round.currentPlayer, 1);
  assert.equal(lead.state.players[lead.state.round.currentPlayer].seat, "right");

  const rightPass = passTurn(lead.state, 1);
  assert.equal(rightPass.ok, true);
  assert.equal(rightPass.state.players[rightPass.state.round.currentPlayer].seat, "top");
});

test("borrows the wind to the finished player's opposite-seat teammate", () => {
  const state = createMatch(41);
  state.players[0].finished = true;
  state.players[0].hand = [];
  state.round.finishOrder = [0];
  const card = state.players[1].hand[0];
  state.round.lastPlay = {
    playerId: 0,
    pattern: classifyHand([card], state.currentLevel),
    cards: [card],
    turn: 1,
  };
  state.round.currentPlayer = 1;
  const firstPass = passTurn(state, 1);
  const secondPass = passTurn(firstPass.state, 2);
  assert.equal(secondPass.ok, true);
  assert.equal(secondPass.state.round.currentPlayer, 2);
  assert.match(secondPass.state.round.statusMessage, /借风/);
});

test("double-down finish advances the winning team three levels", () => {
  const state = createMatch(99);
  state.round.finishOrder = [0, 2];
  state.players[0].finished = true;
  state.players[2].finished = true;
  state.players[0].hand = [];
  state.players[2].hand = [];
  state.players[1].hand = [state.players[1].hand[0]];
  state.players[3].hand = [state.players[3].hand[0]];
  state.round.currentPlayer = 1;
  state.round.lastPlay = null;
  const result = playCards(state, 1, [state.players[1].hand[0].id]);
  assert.equal(result.ok, true);
  assert.equal(result.state.round.phase, "roundEnd");
  assert.equal(result.state.teamLevels[0], "5");
  assert.deepEqual(result.state.round.finishOrder, [0, 2, 1, 3]);
});

test("starts the next deal in a tribute phase and resolves anti-tribute", () => {
  const state = createMatch(101);
  state.round.phase = "roundEnd";
  state.previousFinishOrder = [0, 2, 1, 3];
  state.lastWinnerTeam = 0;
  const next = startNextRound(state, 202);
  assert.equal(next.ok, true);
  assert.equal(next.state.round.phase, "tribute");
  assert.deepEqual(next.state.round.tribute?.donors, [1, 3]);

  next.state.round.tribute.anti = true;
  const resolved = resolveTribute(next.state);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.state.round.phase, "playing");
  assert.equal(resolved.state.round.currentPlayer, 0);
});

test("all three AI levels return only legal public-information moves", () => {
  for (const difficulty of ["casual", "standard", "expert"]) {
    let state = createMatch(7800, difficulty);
    state.round.currentPlayer = 1;
    for (let step = 0; step < 30 && state.round.phase === "playing"; step += 1) {
      const playerId = state.round.currentPlayer;
      const observation = observeForAi(state, playerId);
      assert.deepEqual(observation.ownHand, state.players[playerId].hand);
      assert.equal(Object.hasOwn(observation, "opponentHands"), false);
      const move = chooseAiMove(observation);
      if (move) {
        const legalIds = new Set(
          getLegalMoves(state.players[playerId].hand, state.round.lastPlay?.pattern ?? null, state.currentLevel)
            .map((cards) => cards.map((card) => card.id).sort().join("|")),
        );
        assert.equal(legalIds.has(move.map((card) => card.id).sort().join("|")), true);
        const result = playCards(state, playerId, move.map((card) => card.id));
        assert.equal(result.ok, true);
        state = result.state;
      } else {
        const result = passTurn(state, playerId);
        assert.equal(result.ok, true);
        state = result.state;
      }
    }
  }
});

test("versioned saves restore safely and reject corrupt data", () => {
  const state = createMatch(6288, "expert");
  const restored = restoreGame(serializeGame(state));
  assert.equal(restored?.seed, 6288);
  assert.equal(restored?.difficulty, "expert");
  assert.equal(restoreGame("not-json"), null);
  assert.equal(restoreGame(JSON.stringify({ schemaVersion: 99, match: state })), null);
  const corrupt = structuredClone(state);
  corrupt.players[1].hand[0] = corrupt.players[0].hand[0];
  assert.equal(restoreGame(JSON.stringify({ schemaVersion: 1, savedAt: "now", match: corrupt })), null);
});
