import test from "node:test";
import assert from "node:assert/strict";
import { getDurakActions, playDurakCard } from "../js/games/durak.js";

function transferredGame(hand) {
  return {
    kind: "durak",
    options: { playerCount: 3, throwIn: false, transferable: true, matchTarget: 1 },
    players: [
      { hand: [{ id: "9C", rank: "9", suit: "C" }, { id: "10C", rank: "10", suit: "C" }] },
      { hand: [{ id: "QC", rank: "Q", suit: "C" }] },
      { hand },
    ],
    deck: [{ id: "AS", rank: "A", suit: "S" }],
    trump: { id: "6H", rank: "6", suit: "H" },
    discard: [],
    table: [
      { attack: { id: "7C", rank: "7", suit: "C" }, defense: null },
      { attack: { id: "7D", rank: "7", suit: "D" }, defense: null },
    ],
    attacker: 1, defender: 2, turn: 2, selectedAttack: null,
    defenderHandAtStart: 3, passedThrowers: [], taking: false, out: [],
    scores: [0, 0, 0], winner: null, matchWinner: null, round: 1, revision: 1,
  };
}

test("defender keeps the turn while transferred attacks remain unbeaten", () => {
  const game = transferredGame([
    { id: "8C", rank: "8", suit: "C" },
    { id: "8D", rank: "8", suit: "D" },
    { id: "9S", rank: "9", suit: "S" },
  ]);
  const next = playDurakCard(game, "8C", 2, "defend");
  assert.equal(next.turn, 2);
  assert.equal(next.table[0].defense.id, "8C");
  assert.ok(getDurakActions(next, 2).cards.some((card) => card.id === "8D"));
});

test("same-rank trump can explicitly defend or transfer", () => {
  const game = transferredGame([
    { id: "7H", rank: "7", suit: "H" },
    { id: "8D", rank: "8", suit: "D" },
  ]);
  game.table = [{ attack: { id: "7C", rank: "7", suit: "C" }, defense: null }];
  const actions = getDurakActions(game, 2);
  assert.ok(actions.defenseCardIds.includes("7H"));
  assert.ok(actions.transferCardIds.includes("7H"));
  assert.equal(playDurakCard(game, "7H", 2, "defend").table[0].defense.id, "7H");
  assert.equal(playDurakCard(game, "7H", 2, "transfer").defender, 0);
});
