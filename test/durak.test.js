import test from "node:test";
import assert from "node:assert/strict";

import { getDurakActions, playDurakCard } from "../js/games/durak.js";

function transferredGame(defenderHand) {
  return {
    kind: "durak",
    options: { playerCount: 3, throwIn: false, transferable: true, matchTarget: 1 },
    players: [
      { name: "You", hand: [{ id: "9C", rank: "9", suit: "C" }] },
      { name: "Bot 1", hand: [{ id: "10D", rank: "10", suit: "D" }] },
      { name: "Bot 2", hand: defenderHand },
    ],
    deck: [{ id: "AS", rank: "A", suit: "S" }],
    trump: { id: "AS", rank: "A", suit: "S" },
    discard: [],
    table: [
      { attack: { id: "6H", rank: "6", suit: "H" }, defense: null },
      { attack: { id: "6D", rank: "6", suit: "D" }, defense: null },
    ],
    attacker: 1,
    defender: 2,
    turn: 2,
    selectedAttack: "6D",
    defenderHandAtStart: defenderHand.length,
    passedThrowers: [],
    taking: false,
    out: [],
    scores: [0, 0, 0],
    winner: null,
    matchWinner: null,
    round: 1,
    revision: 1,
  };
}

test("transferred defender keeps turn while another attack is unbeaten", () => {
  const game = transferredGame([
    { id: "7H", rank: "7", suit: "H" },
    { id: "8D", rank: "8", suit: "D" },
  ]);

  const next = playDurakCard(game, "7H", 2);

  assert.equal(next.turn, 2);
  assert.equal(next.defender, 2);
  assert.deepEqual(getDurakActions(next, 2).cards.map((card) => card.id), ["8D"]);
});

test("defender with no card left must take the remaining transferred attack", () => {
  const game = transferredGame([{ id: "7H", rank: "7", suit: "H" }]);

  const next = playDurakCard(game, "7H", 2);

  assert.equal(next.turn, 2);
  assert.equal(next.table.length, 2);
  assert.equal(getDurakActions(next, 2).canTake, true);
});
