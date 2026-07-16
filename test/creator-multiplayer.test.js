import test from "node:test";
import assert from "node:assert/strict";

import { buildPreviewDocument } from "../js/creator/preview.js";
import {
  CreatorMultiplayerError,
  normalizeCreatorGameId,
  validateCreatorStateWrite,
} from "../js/creator/multiplayer.js";
import { CLICKER_GAME } from "../js/creator/templates.js";

test("creator multiplayer namespaces user-controlled template ids", () => {
  assert.equal(normalizeCreatorGameId(" My Game / One "), "creator-preview:my-game-one");
  assert.equal(normalizeCreatorGameId(""), "creator-preview:custom");
});

test("creator multiplayer accepts small JSON state", () => {
  const result = validateCreatorStateWrite("round:board", ["X", null, "O"], { turn: "X" });
  assert.deepEqual(result.state, { turn: "X", "round:board": ["X", null, "O"] });
});

test("creator multiplayer blocks unsafe keys and oversized values", () => {
  assert.throws(() => validateCreatorStateWrite("__proto__", true), CreatorMultiplayerError);
  assert.throws(() => validateCreatorStateWrite("bad key", true), CreatorMultiplayerError);
  assert.throws(() => validateCreatorStateWrite("large", "x".repeat(8_100)), /smaller than 8 KB/);
});

test("creator preview exposes the limited SDK and blocks long-press menus", () => {
  const document = buildPreviewDocument(CLICKER_GAME);
  assert.match(document, /getPlayers/);
  assert.match(document, /onStateChange/);
  assert.match(document, /set-state/);
  assert.match(document, /contextmenu/);
  assert.match(document, /-webkit-touch-callout:none/);
});
