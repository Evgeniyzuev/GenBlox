import test from "node:test";
import assert from "node:assert/strict";

import { buildPreviewDocument } from "../js/creator/preview.js";
import {
  CreatorMultiplayerError,
  normalizeCreatorGameId,
  validateCreatorStateWrite,
} from "../js/creator/multiplayer.js";
import { CLICKER_GAME } from "../js/creator/templates.js";
import {
  CreatorRoomDeliveryError,
  assembleCreatorRoomSource,
  createCreatorRoomDelivery,
  createCreatorSessionId,
  publishCreatorRoomDelivery,
} from "../js/creator/room-delivery.js";

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
  const document = buildPreviewDocument(CLICKER_GAME, {
    connected: true,
    isHost: false,
    playerId: "guest",
    players: [{ id: "guest", name: "Guest", avatar: "🎮", isLocal: true }],
    state: { round: 2 },
  });
  assert.match(document, /getPlayers/);
  assert.match(document, /onStateChange/);
  assert.match(document, /isMultiplayer:\(\)=>room\.connected/);
  assert.match(document, /set-state/);
  assert.match(document, /contextmenu/);
  assert.match(document, /-webkit-touch-callout:none/);
  assert.match(document, /"connected":true/);
  assert.match(document, /"playerId":"guest"/);
});

test("creator room delivery splits and reassembles an immutable source", () => {
  const source = "=== GENBLOX GAME 1 ===\n" + "x".repeat(14_000);
  const delivery = createCreatorRoomDelivery(source, CLICKER_GAME.manifest, "room-test");
  const records = delivery.chunks.map((chunk, index) => ({ sessionId: "room-test", index, source: chunk }));
  assert.ok(delivery.chunks.length > 2);
  assert.equal(assembleCreatorRoomSource(delivery.meta, records), source);
});

test("creator room delivery waits for every chunk and detects corruption", () => {
  const delivery = createCreatorRoomDelivery("safe room source", CLICKER_GAME.manifest, "room-test");
  assert.throws(() => assembleCreatorRoomSource(delivery.meta, []), /still downloading/);
  const corrupt = delivery.chunks.map((chunk, index) => ({ sessionId: "room-test", index, source: `${chunk}!` }));
  assert.throws(() => assembleCreatorRoomSource(delivery.meta, corrupt), /integrity check/);
  assert.throws(() => createCreatorRoomDelivery("ю".repeat(130_000), CLICKER_GAME.manifest, "too-large"), CreatorRoomDeliveryError);
});

test("creator room session ids work without randomUUID", () => {
  const id = createCreatorSessionId({
    getRandomValues(values) {
      values.set([1, 2, 3, 4]);
      return values;
    },
  });
  assert.equal(id, "00000001-00000002-00000003-00000004");
  assert.match(createCreatorSessionId({}), /^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
});

test("creator room publish confirms chunks before opening the game", async () => {
  const gameStates = new Map();
  let roomState = { revision: 4 };
  const client = {
    started: true,
    getGameState: (key) => gameStates.get(key),
    setGameState: (key, value) => gameStates.set(key, value),
    getRoomState: () => roomState,
    setRoomState: (value) => { roomState = value; },
  };

  const source = "=== GENBLOX GAME 1 ===\n" + "x".repeat(7_000);
  const meta = await publishCreatorRoomDelivery(client, source, CLICKER_GAME.manifest, { sessionId: "publish-test", timeoutMs: 100 });

  assert.equal(meta.sessionId, "publish-test");
  assert.equal(gameStates.get("creator-room:chunk:0").source, source.slice(0, 6_000));
  assert.deepEqual(gameStates.get("creator-preview:publish-test").values, {});
  assert.equal(roomState.activeGame, "creator-room");
  assert.equal(roomState.creatorGame.sessionId, "publish-test");
  assert.equal(roomState.revision, 5);
});

test("creator room publish reports a Playroom delivery failure", async () => {
  const client = {
    started: true,
    getGameState: () => undefined,
    setGameState: () => {},
    getRoomState: () => ({ revision: 0 }),
    setRoomState: () => {},
  };

  await assert.rejects(
    publishCreatorRoomDelivery(client, "room game", CLICKER_GAME.manifest, { sessionId: "failed-test", timeoutMs: 10 }),
    /did not confirm the room game upload/,
  );
});
