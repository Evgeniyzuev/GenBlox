import { PlayroomClient } from "./core/playroom-client.js";
import {
  chooseComputerMove,
  createGame,
  isGameState,
  playMove,
} from "./games/tic-tac-toe.js";
import {
  CHECKER_COLORS,
  chooseCheckersMove,
  countCheckers,
  createCheckersGame,
  getCheckersMoves,
  isCheckersState,
  playCheckersMove,
} from "./games/checkers.js";
import {
  FIVE_MARKS,
  chooseFiveInRowMove,
  createFiveInRowGame,
  isFiveInRowState,
  playFiveInRowMove,
} from "./games/five-in-row.js";
import {
  REVERSI_COLORS,
  chooseReversiMove,
  countReversi,
  createReversiGame,
  getReversiMoves,
  isReversiState,
  playReversiMove,
} from "./games/reversi.js";
import {
  DEFAULT_DURAK_OPTIONS,
  DURAK_PLAYER_RANGE,
  cardText,
  chooseDurakBotAction,
  createDurakGame,
  getDurakActions,
  isDurakState,
  normalizeDurakOptions,
  passDurak,
  playDurakCard,
  takeDurak,
} from "./games/durak.js";
import { WormsGame } from "./games/worms.js";
import { MicroMachinesGame } from "./games/micromachines.js";
import { WaveRunnersGame } from "./games/wave-runners.js";
import { FantasyLanesGame } from "./games/fantasy-lanes.js";
import { initCreator } from "./creator/creator-controller.js";

const GAMES = {
  "tic-tac-toe": {
    title: "Tic-Tac-Toe",
    kicker: "SPACE 001",
    help: `
      <h3>Goal</h3>
      <p>Be the first to make a line of three marks horizontally, vertically, or diagonally.</p>
      <h3>How It Plays</h3>
      <ul>
        <li>Players take turns placing a mark in an empty cell.</li>
        <li>The first move alternates between rounds.</li>
        <li>If the board fills without a three-mark line, the round is a draw.</li>
      </ul>`,
  },
  checkers: {
    title: "Checkers",
    kicker: "SPACE 002",
    help: `
      <h3>Goal</h3>
      <p>Capture all opposing pieces or leave the opponent with no legal moves.</p>
      <h3>Russian Checkers</h3>
      <ul>
        <li>A regular piece moves one square diagonally forward.</li>
        <li>Captures can go forward or backward. If a capture is available, it is mandatory.</li>
        <li>Multi-captures must continue with the same piece.</li>
        <li>A piece becomes a king on the far row.</li>
        <li>Kings move and capture any distance diagonally.</li>
      </ul>`,
  },
  worms: {
    title: "Worms",
    kicker: "SPACE 003 · REALTIME",
    help: `
      <h3>Goal</h3>
      <p>Take 120 HP from the blue worm. Use terrain, limited ammo, and falling supplies.</p>
      <p>Bullets and bat swings can be spotted and dodged. Lava deals 1 HP per second, and Molotovs spill temporary fire downhill.</p>
      <p>All weapons and tools are limited. Only the weak finger poke is always available. While roped, vertical movement on the left stick changes rope length.</p>
      <h3>On Phone</h3>
      <ul>
        <li>The left stick controls movement only, with a separate jump button.</li>
        <li>The right stick aims, and the separate red button fires.</li>
        <li>Switch weapons with the buttons below the arena.</li>
      </ul>
      <h3>Keyboard</h3>
      <p>A/D or arrows - move, W - jump/shorten rope, S - lengthen rope, Space - fire, 1-9 - select tool.</p>`,
  },
  micromachines: {
    title: "Micro Machines",
    kicker: "SPACE 004 · RACING",
    help: `
      <h3>Goal</h3>
      <p>Be the first racer to complete three laps. Empty room slots are filled by bots up to four racers.</p>
      <h3>Driving</h3>
      <ul>
        <li>Use W/A/S/D or arrows to accelerate, brake, and steer. On touch screens, steer and drive on the left and fire on the right.</li>
        <li>Cars keep momentum, drift at speed, slide on oil, slow on sand, and can shove rivals into hazards.</li>
        <li>If you fall from the track or get wrecked, you respawn at your last safe checkpoint after a short delay.</li>
      </ul>
      <h3>Items</h3>
      <p>Pickups can give spikes, oil slicks, rockets, machine guns, shock traps, or boost cans. Each item damages or physically disrupts opponents.</p>`,
  },
  "wave-runners": {
    title: "Wave Runners",
    kicker: "SPACE 005 · THREE.JS",
    help: `
      <h3>Goal</h3>
      <p>Run as far as possible, grab valuable trophies, and hide in trenches when danger waves sweep the road.</p>
      <h3>Controls</h3>
      <ul>
        <li>Use W/A/S/D or arrows to move. Space, W, or Up jumps.</li>
        <li>Hold E beside a trophy on the surface to harvest it. Moving, jumping, or dropping into a trench cancels progress.</li>
        <li>Green waves are slow, yellow waves are faster, and red waves are the most dangerous. Trenches keep you safe.</li>
      </ul>`,
  },
  "fantasy-lanes": {
    title: "Fantasy Lanes",
    kicker: "SPACE 006 - REALTIME RTS",
    help: `
      <h3>Goal</h3>
      <p>Destroy the enemy base across three lanes. In a room, two humans can duel; empty enemy seats are controlled by a bot.</p>
      <h3>Core Rules</h3>
      <ul>
        <li>Train Guards, Rangers, Mages, Scouts, and Rams, then send them to lanes 1-3.</li>
        <li>Guards counter Rangers, Rangers counter Mages, and Mages counter Guards.</li>
        <li>Towers outrange Rangers. Rangers are for troop control and deal poor damage to buildings; Rams are the main siege threat.</li>
        <li>The whole battlefield is visible, so lane pressure and army counters are readable at a glance.</li>
        <li>Gold has a cap, like an elixir bar: spending at the right moment matters more than hoarding forever.</li>
        <li>Center springs on each lane add income while held, creating snowball pressure.</li>
        <li>Behind players receive small income and defensive bonuses, so counterattacks remain realistic.</li>
      </ul>
      <h3>Controls</h3>
      <p>Q/W/E/R/T select unit, 1/2/3 sends it to a lane. A/S/D/F buy upgrades. You can also use the on-screen buttons or click a lane.</p>`,
  },
  "five-in-row": {
    title: "Five in a Row",
    kicker: "SPACE 007",
    help: `
      <h3>Goal</h3>
      <p>Place five stones in one continuous horizontal, vertical, or diagonal line on a 15 x 15 board.</p>
      <h3>How It Plays</h3>
      <ul>
        <li>Black moves first, then players alternate turns.</li>
        <li>Only empty intersections can be claimed.</li>
        <li>The first player to connect five wins the round.</li>
      </ul>`,
  },
  reversi: {
    title: "Reversi",
    kicker: "SPACE 008",
    help: `
      <h3>Goal</h3>
      <p>Finish the game with more discs than your opponent.</p>
      <h3>How It Plays</h3>
      <ul>
        <li>Every move must trap at least one opposing disc between the new disc and one of your discs.</li>
        <li>Trapped discs flip to your color in all eight directions.</li>
        <li>If a player has no legal move, the turn automatically stays with the opponent.</li>
      </ul>`,
  },
  durak: {
    title: "Durak",
    kicker: "SPACE 009 - 4 PLAYERS",
    help: `
      <h3>Goal</h3>
      <p>Get rid of all your cards. The last player holding cards is the durak.</p>
      <h3>How It Plays</h3>
      <ul>
        <li>The game uses a 36-card deck from sixes through aces.</li>
        <li>The attacker plays a card, and the defender must beat it with a higher card of the same suit or a trump.</li>
        <li>After a successful defense, press Bito. If the defender cannot beat the attack, press Take.</li>
        <li>Room games support up to four human players; empty seats are filled by bots.</li>
      </ul>`,
  },
};

const $ = (selector) => document.querySelector(selector);
const PROFILE_STORAGE_KEY = "genblox:player-profile";
const DEFAULT_PROFILE = { name: "Player", avatar: "🙂" };
const AVATARS = ["🙂", "😎", "🤖", "👾", "🔥", "⚡", "🌈", "🎮"];

const elements = {
  openPlayerMenu: $("#open-player-menu"),
  playerButtonAvatar: $("#player-button-avatar"),
  playerButtonName: $("#player-button-name"),
  playerDialog: $("#player-dialog"),
  profileForm: $("#player-profile-form"),
  playerNameInput: $("#player-name"),
  avatarGrid: $("#avatar-grid"),
  avatarButtons: [...document.querySelectorAll("[data-avatar]")],
  openRoomMenu: $("#open-room-menu"),
  roomButtonLabel: $("#room-button-label"),
  roomDialog: $("#room-dialog"),
  roomTitle: $("#room-dialog-title"),
  disconnected: $("#room-disconnected"),
  connected: $("#room-connected"),
  findPublic: $("#find-public-room"),
  createPrivate: $("#create-private-room"),
  joinForm: $("#join-room-form"),
  roomCodeInput: $("#room-code"),
  roomCodeDisplay: $("#room-code-display"),
  roomKind: $("#room-kind-label"),
  roomPlayerCount: $("#room-player-count"),
  roomStatus: $("#room-status"),
  roomQr: $("#room-qr"),
  inviteLink: $("#invite-link"),
  copyInvite: $("#copy-invite"),
  leaveRoom: $("#leave-room"),
  playSoloButtons: [...document.querySelectorAll(".play-solo")],
  launchButtons: [...document.querySelectorAll(".launch-for-room")],
  partyPanel: $("#party-panel"),
  partyCode: $("#party-code"),
  partyPlayers: $("#party-players"),
  gameDialog: $("#game-dialog"),
  gameKicker: $("#game-kicker"),
  gameTitle: $("#game-title"),
  openHelp: $("#open-game-help"),
  helpDialog: $("#help-dialog"),
  helpTitle: $("#help-title"),
  helpContent: $("#help-content"),
  closeHelp: $("#close-game-help"),
  closeGame: $("#close-game"),
  board: $("#game-board"),
  wormsStage: $("#worms-stage"),
  microStage: $("#micro-stage"),
  waveStage: $("#wave-stage"),
  fantasyStage: $("#fantasy-stage"),
  classicGameView: $("#classic-game-view"),
  wormsGameView: $("#worms-game-view"),
  microGameView: $("#micro-game-view"),
  waveGameView: $("#wave-game-view"),
  fantasyGameView: $("#fantasy-game-view"),
  wormsStatus: $("#worms-status"),
  microStatus: $("#micro-status"),
  waveStatus: $("#wave-status"),
  fantasyStatus: $("#fantasy-status"),
  gameStatus: $("#game-status"),
  role: $("#role-label"),
  players: $("#players-label"),
  nameX: $("#name-x"),
  nameO: $("#name-o"),
  markX: $("#mark-x"),
  markO: $("#mark-o"),
  scoreX: $("#score-x"),
  scoreO: $("#score-o"),
  newRound: $("#new-round"),
  hint: $("#game-hint"),
  cards: [...document.querySelectorAll(".player-card")],
  scoreboard: $(".scoreboard"),
  roomInfo: $(".room-info"),
  gameActions: $(".game-actions"),
};

const connectionButtons = [elements.findPublic, elements.createPrivate, elements.joinForm.querySelector("button")];
let client = null;
let roomKind = null;
let mode = "catalog";
let activeGameId = "tic-tac-toe";
let configuredGameId = null;
let localGame = null;
let selectedChecker = null;
let lastRevision = -1;
let lastPlayerCount = -1;
let syncTimer = null;
let computerTimer = null;
let suppressGameReturn = false;
let wormsGame = null;
let microGame = null;
let waveGame = null;
let fantasyGame = null;
let playerProfile = loadPlayerProfile();
let lastPublishedProfile = "";
let pendingDurakOptions = null;

function normalizeGameId(gameId) {
  const aliases = {
    five: "five-in-row",
    gomoku: "five-in-row",
    "five-in-a-row": "five-in-row",
    "5-in-row": "five-in-row",
    othello: "reversi",
    fool: "durak",
  };
  return aliases[gameId] ?? gameId;
}

function isRoomLikeMode() {
  return mode === "room" || mode === "room-setup";
}

function cleanPlayerName(name) {
  const text = String(name ?? "").trim().replace(/\s+/g, " ");
  return text.slice(0, 18) || DEFAULT_PROFILE.name;
}

function normalizeProfile(profile) {
  return {
    name: cleanPlayerName(profile?.name),
    avatar: AVATARS.includes(profile?.avatar) ? profile.avatar : DEFAULT_PROFILE.avatar,
  };
}

function loadPlayerProfile() {
  try {
    return normalizeProfile(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function savePlayerProfile(profile) {
  playerProfile = normalizeProfile(profile);
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(playerProfile));
  renderPlayerProfile();
  publishPlayerProfile();
}

function renderPlayerProfile() {
  elements.playerButtonAvatar.textContent = playerProfile.avatar;
  elements.playerButtonName.textContent = playerProfile.name;
  elements.playerNameInput.value = playerProfile.name;
  elements.avatarButtons.forEach((button) => {
    const selected = button.dataset.avatar === playerProfile.avatar;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", selected ? "true" : "false");
  });
}

function publishPlayerProfile() {
  if (!client?.started) return;
  const serialized = JSON.stringify(playerProfile);
  if (serialized === lastPublishedProfile) return;
  lastPublishedProfile = serialized;
  client.setLocalPlayerState("profile", playerProfile, true);
}

function profileForPlayer(player, fallbackName) {
  const raw = player?.getState?.("profile");
  if (!raw) return fallbackName;
  const profile = normalizeProfile(raw);
  return `${profile.avatar} ${profile.name}`;
}

function playerByIndex(index) {
  return client?.players[index] ?? null;
}

function playerById(playerId) {
  return client?.players.find((player) => player.id === playerId) ?? null;
}

function seatLimitForGame(gameId = activeGameId) {
  if (gameId !== "durak") return 2;
  const stateOptions = client?.getGameState?.("durak")?.options;
  return normalizeDurakOptions(pendingDurakOptions ?? stateOptions ?? DEFAULT_DURAK_OPTIONS).playerCount;
}

function minDurakPlayers() {
  return isRoomLikeMode() ? Math.min(Math.max(client?.playerCount ?? 1, DURAK_PLAYER_RANGE.MIN), DURAK_PLAYER_RANGE.MAX) : DURAK_PLAYER_RANGE.MIN;
}

function createRoomSeats(limit = seatLimitForGame()) {
  if (!client) return [];
  const host = client.localPlayer;
  const others = client.players
    .filter((player) => player.id !== host?.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return [host, ...others]
    .filter(Boolean)
    .slice(0, limit)
    .map((player, index) => ({
      playerId: player.id,
      name: profileForPlayer(player, index === 0 ? "Room Host" : `Player ${index + 1}`),
    }));
}

function roomGameSeats(game = null, gameId = activeGameId) {
  const state = game ?? (isRoomLikeMode() ? client?.getGameState(gameId) : null);
  return Array.isArray(state?.seats) ? state.seats : [];
}

function roomSeatForLocalPlayer(game = null, gameId = activeGameId) {
  const playerId = client?.playerId;
  if (!playerId) return null;
  const index = roomGameSeats(game, gameId).findIndex((seat) => seat?.playerId === playerId);
  return index >= 0 ? index : null;
}

function roomHumanSeatCount(game = null, gameId = activeGameId) {
  return isRoomLikeMode() ? roomGameSeats(game, gameId).length : 1;
}

function isRoomAutomationController(game = null, gameId = activeGameId) {
  if (!client || !isRoomLikeMode()) return false;
  const connectedSeat = roomGameSeats(game, gameId).find((seat) => seat?.playerId && playerById(seat.playerId));
  return connectedSeat ? connectedSeat.playerId === client.playerId : client.isHost;
}

function attachRoomSeats(game, previous = null, gameId = activeGameId) {
  if (!isRoomLikeMode() || isRealtimeGame(gameId)) return game;
  const seats = Array.isArray(previous?.seats) && previous.seats.length
    ? previous.seats
    : createRoomSeats(seatLimitForGame(gameId));
  return { ...game, seats };
}

function isRealtimeGame(gameId) {
  return gameId === "worms" || gameId === "micromachines" || gameId === "wave-runners" || gameId === "fantasy-lanes";
}

function destroyRealtimeGames() {
  if (wormsGame) {
    wormsGame.destroy();
    wormsGame = null;
  }
  if (microGame) {
    microGame.destroy();
    microGame = null;
  }
  if (waveGame) {
    waveGame.destroy();
    waveGame = null;
  }
  if (fantasyGame) {
    fantasyGame.destroy();
    fantasyGame = null;
  }
}

function showRealtimeUnavailable(stage, title, message) {
  stage.replaceChildren();
  const panel = document.createElement("div");
  panel.className = "worms-room-unavailable";
  panel.innerHTML = `<p><strong>${title}</strong>${message}</p>`;
  stage.append(panel);
}

function buildBoard(gameId) {
  elements.board.replaceChildren();
  elements.board.classList.toggle("is-checkers", gameId === "checkers");
  elements.board.classList.toggle("is-five", gameId === "five-in-row");
  elements.board.classList.toggle("is-reversi", gameId === "reversi");
  elements.board.classList.toggle("is-durak", gameId === "durak");
  if (gameId === "durak") return;
  const size = gameId === "checkers" || gameId === "reversi" ? 64 : gameId === "five-in-row" ? 225 : 9;
  for (let index = 0; index < size; index += 1) {
    const cell = document.createElement("button");
    cell.className = gameId === "checkers"
      ? `checkers-cell${(Math.floor(index / 8) + index % 8) % 2 ? " is-dark" : ""}`
      : gameId === "reversi"
        ? "reversi-cell"
        : gameId === "five-in-row"
          ? "five-cell"
          : "cell";
    cell.type = "button";
    cell.dataset.index = index;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Cell ${index + 1}`);
    cell.addEventListener("click", () => makeMove(index));
    elements.board.append(cell);
  }
}

function openOverlay(dialog, name) {
  if (dialog.open) return;
  history.pushState({ ...(history.state ?? {}), overlay: name }, "");
  dialog.showModal();
}

function closeOverlay(dialog, name) {
  if (!dialog.open) return;
  if (history.state?.overlay === name) history.back();
  else dialog.close();
}

function closeGameFromSync() {
  if (!elements.gameDialog.open) return;
  destroyRealtimeGames();
  if (history.state?.overlay === "game") {
    suppressGameReturn = true;
    history.back();
  } else {
    elements.gameDialog.close();
  }
}

function setRoomStatus(message = "", isError = false) {
  elements.roomStatus.textContent = message;
  elements.roomStatus.classList.toggle("is-error", isError);
}

function normalizeRoomCode(value) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function roomCodeFromUrl() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  return normalizeRoomCode(params.get("r") ?? "");
}

function inviteUrl(code) {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ r: code }).toString();
  return url.toString();
}

function updateUrlRoomCode(code) {
  const url = new URL(location.href);
  url.hash = code ? new URLSearchParams({ r: code }).toString() : "";
  history.replaceState(history.state, "", url);
}

function renderQr(link) {
  elements.roomQr.replaceChildren();
  if (!window.QRCode) {
    elements.roomQr.textContent = "QR unavailable";
    return;
  }
  new window.QRCode(elements.roomQr, {
    text: link,
    width: 120,
    height: 120,
    correctLevel: window.QRCode.CorrectLevel.M,
  });
}

async function connectRoom({ matchmaking = false, roomCode = "", kind }, trigger) {
  if (client?.started) {
    showConnectedRoom();
    return;
  }

  const code = normalizeRoomCode(roomCode);
  if (roomCode && code.length < 3) {
    setRoomStatus("Check the room code: it must contain at least three characters.", true);
    elements.roomCodeInput.focus();
    return;
  }

  const originalLabel = trigger.textContent;
  connectionButtons.forEach((button) => { button.disabled = true; });
  trigger.textContent = matchmaking ? "Searching..." : code ? "Joining..." : "Creating...";
  setRoomStatus(matchmaking ? "Searching for an open room..." : "Connecting to Playroom...");

  try {
    client ??= new PlayroomClient();
    await client.start({ matchmaking, roomCode: code || undefined });
    roomKind = kind;
    publishPlayerProfile();

    client.onDisconnect((event) => {
      clearInterval(syncTimer);
      setRoomStatus(`Connection lost: ${event?.reason || "room closed"}.`, true);
      elements.roomButtonLabel.textContent = "Disconnected";
      elements.openRoomMenu.classList.remove("is-connected");
      openOverlay(elements.roomDialog, "room");
    });

    if (client.isHost && !client.getRoomState()) {
      client.setRoomState({ screen: "catalog", activeGame: null, revision: 1 });
    }

    mode = "room";
    showConnectedRoom();
    startRoomSync();
    setRoomStatus("Room connected.");
  } catch (error) {
    console.error(error);
    const full = error?.message === "ROOM_LIMIT_EXCEEDED";
    setRoomStatus(full ? "This room is already full." : "Could not connect. Check the code and try again.", true);
  } finally {
    connectionButtons.forEach((button) => { button.disabled = false; });
    trigger.textContent = originalLabel;
  }
}

function showConnectedRoom() {
  const code = client.roomCode;
  const link = inviteUrl(code);
  elements.disconnected.hidden = true;
  elements.connected.hidden = false;
  elements.roomTitle.textContent = "Current Room";
  elements.roomCodeDisplay.textContent = code;
  elements.roomKind.textContent = roomKind === "public" ? "Open Room" : "Private Room";
  elements.inviteLink.value = link;
  elements.partyPanel.hidden = false;
  elements.partyCode.textContent = `Code: ${code}`;
  elements.openRoomMenu.classList.add("is-connected");
  elements.roomButtonLabel.textContent = `Room ${code}`;
  elements.playSoloButtons.forEach((button) => { button.hidden = true; });
  elements.launchButtons.forEach((button) => {
    button.hidden = false;
  });
  updateUrlRoomCode(code);
  renderQr(link);
  renderParty();
}

function startRoomSync() {
  clearInterval(syncTimer);
  syncRoom();
  syncTimer = setInterval(syncRoom, 120);
}

function syncRoom() {
  if (!client?.started) return;
  renderParty();
  const room = client.getRoomState();
  if (room?.activeGame) room.activeGame = normalizeGameId(room.activeGame);

  if (room?.screen === "game" && GAMES[room.activeGame]) {
    const expectedCells = room.activeGame === "checkers" || room.activeGame === "reversi"
      ? 64
      : room.activeGame === "five-in-row"
        ? 225
        : room.activeGame === "durak"
          ? 1
          : 9;
    const gameChanged = configuredGameId !== room.activeGame || (!isRealtimeGame(room.activeGame) && elements.board.children.length !== expectedCells);
    activeGameId = room.activeGame;
    mode = "room";
    if (gameChanged) setupGameShell();
    setupRoomLabels();
    openOverlay(elements.gameDialog, "game");
    const game = client.getGameState(activeGameId);
    const needsSeatMigration = !isRealtimeGame(activeGameId) && isValidGameState(game) && !roomGameSeats(game).length;
    const needsDurakMigration = activeGameId === "durak" && isDurakState(game)
      && (!game.options || !Array.isArray(game.scores) || !Array.isArray(game.passedThrowers) || !Object.hasOwn(game, "defenderHandAtStart"));
    if (needsSeatMigration || needsDurakMigration) {
      if (client.isHost || isRoomAutomationController(game)) {
        const options = activeGameId === "durak" ? normalizeDurakOptions(game.options) : null;
        client.setGameState(activeGameId, {
          ...game,
          ...(options ? { options } : {}),
          ...(activeGameId === "durak" && !Array.isArray(game.scores) ? { scores: Array(game.players.length).fill(0) } : {}),
          ...(activeGameId === "durak" && !Array.isArray(game.passedThrowers) ? { passedThrowers: [] } : {}),
          ...(activeGameId === "durak" && !Object.hasOwn(game, "defenderHandAtStart") ? { defenderHandAtStart: null } : {}),
          seats: roomGameSeats(game).length ? roomGameSeats(game) : createRoomSeats(seatLimitForGame(activeGameId)),
          revision: game.revision + 1,
        });
      }
      return;
    }
    if (activeGameId === "worms") {
      if (client.playerIndex > 1) {
        destroyRealtimeGames();
        showRealtimeUnavailable(elements.wormsStage, "Spectating", "Worms is a two-player duel. You can watch this match and join the next room game.");
        elements.wormsStatus.textContent = "Spectating this duel";
        return;
      }
      if (!wormsGame) {
        microGame?.destroy();
        waveGame?.destroy();
        fantasyGame?.destroy();
        microGame = null;
        waveGame = null;
        fantasyGame = null;
        wormsGame = new WormsGame(elements.wormsStage, {
          onStatus: (message) => { elements.wormsStatus.textContent = message; },
          network: {
            role: client.isHost ? "host" : "guest",
            publish: (snapshot) => client.setGameState("worms", snapshot, false),
            sendInput: (input) => client.setLocalPlayerState("worms:input", input, false),
            getRemoteInput: () => client.getRemotePlayerState("worms:input"),
          },
        });
      }
      wormsGame.applyNetworkSnapshot(game);
      return;
    }
    if (activeGameId === "micromachines") {
      if (!microGame) {
        wormsGame?.destroy();
        waveGame?.destroy();
        fantasyGame?.destroy();
        wormsGame = null;
        waveGame = null;
        fantasyGame = null;
        microGame = new MicroMachinesGame(elements.microStage, {
          onStatus: (message) => { elements.microStatus.textContent = message; },
          network: {
            role: client.isHost ? "host" : "guest",
            playerId: client.playerId,
            getPlayers: () => client.players.slice(0, client.maxPlayers).map((player, index) => ({
              id: player.id,
              name: profileForPlayer(player, index === 0 ? "Host" : `Player ${index + 1}`),
            })),
            publish: (snapshot) => client.setGameState("micromachines", snapshot, false),
            sendInput: (input) => client.setLocalPlayerState("micromachines:input", input, false),
            getInputs: () => client.getAllPlayerStates("micromachines:input"),
          },
        });
      }
      microGame.applyNetworkSnapshot(game);
      return;
    }
    if (activeGameId === "wave-runners") {
      if (client.playerIndex > 5) {
        destroyRealtimeGames();
        showRealtimeUnavailable(elements.waveStage, "Spectating", "Wave Runners supports six active runners in this version.");
        elements.waveStatus.textContent = "Spectating Wave Runners";
        return;
      }
      if (!waveGame) {
        wormsGame?.destroy();
        microGame?.destroy();
        fantasyGame?.destroy();
        wormsGame = null;
        microGame = null;
        fantasyGame = null;
        waveGame = new WaveRunnersGame(elements.waveStage, {
          bot: client.isHost,
          onStatus: (message) => { elements.waveStatus.textContent = message; },
          network: {
            role: client.isHost ? "host" : "guest",
            playerId: client.playerId,
            getPlayers: () => client.players.slice(0, 6).map((player, index) => ({
              id: player.id,
              name: index === 0 ? "Host" : `Player ${index + 1}`,
            })),
            publish: (snapshot) => client.setGameState("wave-runners", snapshot, false),
            sendInput: (input) => client.setLocalPlayerState("wave-runners:input", input, false),
            getInputs: () => client.getAllPlayerStates("wave-runners:input"),
          },
        });
      }
      waveGame.applyNetworkSnapshot(game);
      return;
    }
    if (activeGameId === "fantasy-lanes") {
      if (client.playerIndex > 1) {
        destroyRealtimeGames();
        showRealtimeUnavailable(elements.fantasyStage, "Spectating", "Fantasy Lanes is a two-player duel. You can watch this match and join the next room game.");
        elements.fantasyStatus.textContent = "Spectating this duel";
        return;
      }
      if (!fantasyGame) {
        wormsGame?.destroy();
        microGame?.destroy();
        waveGame?.destroy();
        wormsGame = null;
        microGame = null;
        waveGame = null;
        fantasyGame = new FantasyLanesGame(elements.fantasyStage, {
          onStatus: (message) => { elements.fantasyStatus.textContent = message; },
          network: {
            role: client.isHost ? "host" : "guest",
            playerId: client.playerId,
            getPlayers: () => client.players.slice(0, 2).map((player, index) => ({
              id: player.id,
              name: profileForPlayer(player, index === 0 ? "Host" : "Player 2"),
            })),
            publish: (snapshot) => client.setGameState("fantasy-lanes", snapshot, false),
            sendInput: (input) => client.setLocalPlayerState("fantasy-lanes:input", input, false),
            getInputs: () => client.getAllPlayerStates("fantasy-lanes:input"),
          },
        });
      }
      fantasyGame.applyNetworkSnapshot(game);
      return;
    }
    if (isValidGameState(game)) {
      renderGame(game, roomHumanSeatCount(game), roomPlayerSide());
      queueComputerMove();
    }
  } else if (elements.gameDialog.open && mode === "room") {
    closeGameFromSync();
  }
}

function renderParty() {
  if (!client) return;
  const text = `Players: ${Math.min(client.playerCount, client.maxPlayers)} / ${client.maxPlayers}`;
  elements.partyPlayers.textContent = text;
  elements.roomPlayerCount.textContent = text;
  publishPlayerProfile();
}

function setupRoomLabels() {
  if (activeGameId === "micromachines") {
    elements.role.textContent = client.isHost ? "Race host" : "Racer";
    elements.players.textContent = `Players: ${Math.min(client.playerCount, client.maxPlayers)} / ${client.maxPlayers}`;
    elements.nameX.textContent = "Humans";
    elements.nameO.textContent = "Bots fill empty slots";
    elements.newRound.hidden = true;
    elements.hint.textContent = "The race uses up to four human players. Empty slots become bots.";
    return;
  }
  if (activeGameId === "durak") {
    const game = client?.getGameState("durak");
    const side = roomPlayerSide();
    elements.role.textContent = side === null ? "Spectating" : `Seat ${side + 1}`;
    elements.players.textContent = `Players: ${roomHumanSeatCount(game)} / ${game?.options?.playerCount ?? seatLimitForGame("durak")}`;
    elements.nameX.textContent = roomGameSeats()[0]?.name ?? profileForPlayer(playerByIndex(0), "Room Host");
    elements.nameO.textContent = "Card table";
    elements.newRound.hidden = !client.isHost;
    elements.hint.textContent = "Durak uses four seats. Empty seats are controlled by bots.";
    return;
  }
  if (activeGameId === "wave-runners") {
    const activePlayers = Math.min(client.playerCount, 6);
    elements.role.textContent = client.playerIndex > 5 ? "Spectating" : (client.isHost ? "Run host" : `Runner ${client.playerIndex + 1}`);
    elements.players.textContent = `Players: ${activePlayers} / 6`;
    elements.nameX.textContent = "Runners";
    elements.nameO.textContent = "Bots fill empty slots";
    elements.newRound.hidden = true;
    elements.hint.textContent = "Choose 2-6 runners at the start. Connected players take slots first; the host fills the rest with bots.";
    return;
  }
  if (activeGameId === "fantasy-lanes") {
    const activePlayers = Math.min(client.playerCount, 2);
    elements.role.textContent = client.playerIndex > 1 ? "Spectating" : (client.isHost ? "Azure commander" : "Crimson commander");
    elements.players.textContent = `Players: ${activePlayers} / 2`;
    elements.nameX.textContent = profileForPlayer(playerByIndex(0), "Host");
    elements.nameO.textContent = playerByIndex(1) ? profileForPlayer(playerByIndex(1), "Player 2") : "Bot commander";
    elements.newRound.hidden = true;
    elements.hint.textContent = "Room duels use two active commanders; if the second seat is empty, a bot plays the enemy base.";
    return;
  }
  const side = roomPlayerSide();
  if (side === null) {
    elements.role.textContent = "Spectating";
    elements.players.textContent = `Players: ${roomHumanSeatCount()} / 2`;
    elements.nameX.textContent = roomGameSeats()[0]?.name ?? profileForPlayer(playerByIndex(0), "Room Host");
    elements.nameO.textContent = roomGameSeats()[1]?.name ?? profileForPlayer(playerByIndex(1), "Second Player");
    elements.newRound.hidden = true;
    elements.hint.textContent = "This game is limited to two active players.";
    return;
  }
  elements.role.textContent = activeGameId === "checkers"
    ? `You play ${side === CHECKER_COLORS.BLACK ? "black" : "white"}`
    : `You play ${side === "X" ? "×" : "○"}`;
  elements.players.textContent = `Players: ${roomHumanSeatCount()} / 2`;
  elements.nameX.textContent = roomGameSeats()[0]?.name ?? profileForPlayer(playerByIndex(0), "Room Host");
  elements.nameO.textContent = roomGameSeats()[1]?.name ?? profileForPlayer(playerByIndex(1), "Second Player");
  elements.newRound.hidden = !client.isHost;
  elements.hint.textContent = "The × button ends the game and returns the whole room to the catalog.";
}

function setupGameShell() {
  const game = GAMES[activeGameId];
  if (!game) {
    console.error(`Unknown game id: ${activeGameId}`);
    activeGameId = "tic-tac-toe";
    return setupGameShell();
  }
  configuredGameId = activeGameId;
  elements.gameKicker.textContent = game.kicker;
  elements.gameTitle.textContent = game.title;
  elements.helpTitle.textContent = `Rules: ${game.title}`;
  elements.helpContent.innerHTML = game.help;
  const isWorms = activeGameId === "worms";
  const isMicro = activeGameId === "micromachines";
  const isWave = activeGameId === "wave-runners";
  const isFantasy = activeGameId === "fantasy-lanes";
  elements.classicGameView.hidden = isWorms || isMicro || isWave || isFantasy;
  elements.wormsGameView.hidden = !isWorms;
  elements.microGameView.hidden = !isMicro;
  elements.waveGameView.hidden = !isWave;
  elements.fantasyGameView.hidden = !isFantasy;
  elements.gameDialog.classList.toggle("is-worms", isWorms);
  elements.gameDialog.classList.toggle("is-micro", isMicro);
  elements.gameDialog.classList.toggle("is-wave", isWave);
  elements.gameDialog.classList.toggle("is-fantasy", isFantasy);
  elements.board.setAttribute("aria-label", `${game.title} board`);
  elements.scoreboard.hidden = activeGameId === "durak";
  elements.markX.textContent = activeGameId === "checkers" ? "●" : "×";
  elements.markO.textContent = activeGameId === "checkers" ? "○" : "○";
  if (!isRealtimeGame(activeGameId)) {
    destroyRealtimeGames();
    buildBoard(activeGameId);
  } else if (mode === "room") {
    if (isWorms) {
      elements.wormsStatus.textContent = client.isHost
        ? "Choose a map for the network match"
        : "The room host is choosing a map...";
    } else if (isMicro) {
      elements.microStatus.textContent = client.isHost
        ? "Choose a track for the room race"
        : "The race host is choosing a track...";
    } else if (isWave) {
      elements.waveStatus.textContent = client.isHost
        ? "Choose a target score for the room run"
        : "The host is choosing a target score...";
    } else if (isFantasy) {
      elements.fantasyStatus.textContent = client.isHost
        ? "Train troops and hold the center springs"
        : "Send counters and pressure the open lanes";
    }
  }
  selectedChecker = null;
  lastRevision = -1;
}

function roomPlayerSide() {
  const seat = roomSeatForLocalPlayer();
  if (activeGameId === "checkers") {
    if (seat === null || seat > 1) return null;
    return seat === 0 ? CHECKER_COLORS.BLACK : CHECKER_COLORS.WHITE;
  }
  if (activeGameId === "reversi") {
    if (seat === null || seat > 1) return null;
    return seat === 0 ? REVERSI_COLORS.BLACK : REVERSI_COLORS.WHITE;
  }
  if (activeGameId === "durak") {
    return seat;
  }
  if (seat === null || seat > 1) return null;
  return seat === 0 ? "X" : "O";
}

function isValidGameState(game) {
  if (activeGameId === "checkers") return isCheckersState(game);
  if (activeGameId === "five-in-row") return isFiveInRowState(game);
  if (activeGameId === "reversi") return isReversiState(game);
  if (activeGameId === "durak") return isDurakState(game);
  return isGameState(game);
}

function createGameForActive(previous = null) {
  if (activeGameId === "checkers") {
    const validPrevious = isCheckersState(previous) ? previous : null;
    return attachRoomSeats(createCheckersGame(validPrevious), validPrevious);
  }
  if (activeGameId === "five-in-row") {
    const validPrevious = isFiveInRowState(previous) ? previous : null;
    return attachRoomSeats(createFiveInRowGame(validPrevious), validPrevious);
  }
  if (activeGameId === "reversi") {
    const validPrevious = isReversiState(previous) ? previous : null;
    return attachRoomSeats(createReversiGame(validPrevious), validPrevious);
  }
  if (activeGameId === "durak") {
    const game = createDurakGame(isDurakState(previous) ? previous : null, pendingDurakOptions);
    return attachRoomSeats(game, isDurakState(previous) ? previous : null);
  }
  const validPrevious = isGameState(previous) ? previous : null;
  return attachRoomSeats(createGame(validPrevious), validPrevious);
}

function openSoloGame(gameId) {
  activeGameId = normalizeGameId(gameId);
  mode = "solo";
  if (activeGameId === "worms") {
    setupGameShell();
    elements.wormsStatus.textContent = "Choose one of three maps";
    openOverlay(elements.gameDialog, "game");
    wormsGame?.destroy();
    wormsGame = new WormsGame(elements.wormsStage, {
      onStatus: (message) => { elements.wormsStatus.textContent = message; },
    });
    elements.gameDialog.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.("landscape").catch(() => {}))
      .catch(() => {});
    return;
  }
  if (activeGameId === "micromachines") {
    setupGameShell();
    elements.microStatus.textContent = "Choose one of three tracks";
    openOverlay(elements.gameDialog, "game");
    destroyRealtimeGames();
    microGame = new MicroMachinesGame(elements.microStage, {
      onStatus: (message) => { elements.microStatus.textContent = message; },
    });
    elements.gameDialog.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.("landscape").catch(() => {}))
      .catch(() => {});
    return;
  }
  if (activeGameId === "wave-runners") {
    setupGameShell();
    elements.waveStatus.textContent = "Run, loot, and hide from color-coded waves";
    openOverlay(elements.gameDialog, "game");
    destroyRealtimeGames();
    waveGame = new WaveRunnersGame(elements.waveStage, {
      onStatus: (message) => { elements.waveStatus.textContent = message; },
    });
    elements.gameDialog.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.("landscape").catch(() => {}))
      .catch(() => {});
    return;
  }
  if (activeGameId === "fantasy-lanes") {
    setupGameShell();
    elements.fantasyStatus.textContent = "Duel the bot across three open lanes";
    openOverlay(elements.gameDialog, "game");
    destroyRealtimeGames();
    fantasyGame = new FantasyLanesGame(elements.fantasyStage, {
      onStatus: (message) => { elements.fantasyStatus.textContent = message; },
    });
    elements.gameDialog.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.("landscape").catch(() => {}))
      .catch(() => {});
    return;
  }
  if (activeGameId === "durak") {
    pendingDurakOptions = normalizeDurakOptions({
      ...DEFAULT_DURAK_OPTIONS,
      playerCount: Math.max(DEFAULT_DURAK_OPTIONS.playerCount, minDurakPlayers()),
    });
    setupGameShell();
    elements.role.textContent = "Table setup";
    elements.players.textContent = "Solo with bots";
    elements.nameX.textContent = `${playerProfile.avatar} ${playerProfile.name}`;
    elements.nameO.textContent = "Bots fill empty seats";
    elements.newRound.hidden = true;
    elements.hint.textContent = "Choose table settings before dealing.";
    openOverlay(elements.gameDialog, "game");
    renderDurakSetup();
    return;
  }
  localGame = createGameForActive(null);
  setupGameShell();
  const humanSide = activeGameId === "checkers"
    ? CHECKER_COLORS.BLACK
    : activeGameId === "reversi"
      ? REVERSI_COLORS.BLACK
      : activeGameId === "durak"
        ? 0
        : "X";
  elements.role.textContent = activeGameId === "durak"
    ? "Seat 1"
    : activeGameId === "checkers" || activeGameId === "reversi"
      ? "You play black"
      : "You play X";
  elements.players.textContent = activeGameId === "durak" ? "Solo with 3 bots" : "Solo game";
  elements.nameX.textContent = `${playerProfile.avatar} ${playerProfile.name}`;
  elements.nameO.textContent = "Computer";
  elements.newRound.hidden = false;
  elements.hint.textContent = "Close the game to return to the catalog.";
  lastRevision = -1;
  openOverlay(elements.gameDialog, "game");
  renderGame(localGame, activeGameId === "durak" ? 4 : 2, humanSide);
  queueComputerMove();
}

function launchForRoom(gameId) {
  gameId = normalizeGameId(gameId);
  activeGameId = gameId;
  if (gameId === "worms") {
    client.setGameState("worms", {
      kind: "worms",
      phase: "selecting",
      revision: Date.now(),
    });
    const revision = (client.getRoomState()?.revision ?? 0) + 1;
    client.setRoomState({
      screen: "game",
      activeGame: "worms",
      startedAt: Date.now(),
      revision,
    });
    mode = "room";
    setupGameShell();
    openOverlay(elements.gameDialog, "game");
    elements.gameDialog.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.("landscape").catch(() => {}))
      .catch(() => {});
    return;
  }
  if (gameId === "micromachines") {
    client.setGameState("micromachines", {
      kind: "micromachines",
      phase: "selecting",
      revision: Date.now(),
    });
    const revision = (client.getRoomState()?.revision ?? 0) + 1;
    client.setRoomState({
      screen: "game",
      activeGame: "micromachines",
      startedAt: Date.now(),
      revision,
    });
    mode = "room";
    setupGameShell();
    openOverlay(elements.gameDialog, "game");
    elements.gameDialog.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.("landscape").catch(() => {}))
      .catch(() => {});
    return;
  }
  if (gameId === "wave-runners") {
    client.setGameState("wave-runners", {
      kind: "wave-runners",
      phase: "selecting",
      revision: Date.now(),
    });
    const revision = (client.getRoomState()?.revision ?? 0) + 1;
    client.setRoomState({
      screen: "game",
      activeGame: "wave-runners",
      startedAt: Date.now(),
      revision,
    });
    mode = "room";
    setupGameShell();
    openOverlay(elements.gameDialog, "game");
    elements.gameDialog.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.("landscape").catch(() => {}))
      .catch(() => {});
    return;
  }
  if (gameId === "fantasy-lanes") {
    client.setGameState("fantasy-lanes", {
      kind: "fantasy-lanes",
      phase: "playing",
      revision: Date.now(),
    });
    const revision = (client.getRoomState()?.revision ?? 0) + 1;
    client.setRoomState({
      screen: "game",
      activeGame: "fantasy-lanes",
      startedAt: Date.now(),
      revision,
    });
    mode = "room";
    setupGameShell();
    openOverlay(elements.gameDialog, "game");
    elements.gameDialog.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.("landscape").catch(() => {}))
      .catch(() => {});
    return;
  }
  if (gameId === "durak") {
    pendingDurakOptions = normalizeDurakOptions({
      ...DEFAULT_DURAK_OPTIONS,
      playerCount: Math.max(DEFAULT_DURAK_OPTIONS.playerCount, minDurakPlayers()),
    });
    mode = "room-setup";
    setupGameShell();
    setupRoomLabels();
    openOverlay(elements.gameDialog, "game");
    renderDurakSetup();
    return;
  }
  const previous = client.getGameState(activeGameId);
  lastRevision = -1;
  client.setGameState(activeGameId, createGameForActive(previous));
  const revision = (client.getRoomState()?.revision ?? 0) + 1;
  client.setRoomState({
    screen: "game",
    activeGame: activeGameId,
    startedAt: Date.now(),
    revision,
  });
}

function makeMove(index) {
  if (activeGameId === "checkers") {
    makeCheckersMove(index);
    return;
  }
  if (activeGameId === "five-in-row") {
    makeFiveInRowMove(index);
    return;
  }
  if (activeGameId === "reversi") {
    makeReversiMove(index);
    return;
  }

  if (mode === "solo") {
    const next = playMove(localGame, index, "X");
    if (next === localGame) return;
    localGame = next;
    renderGame(localGame, 2, "X");
    queueComputerMove();
    return;
  }

  const current = client?.getGameState(activeGameId);
  const side = roomPlayerSide();
  if (!isGameState(current) || side === null || roomHumanSeatCount(current) < 2) return;
  const next = playMove(current, index, side);
  if (next !== current) client.setGameState(activeGameId, next);
}

function pieceColor(piece) {
  if (!piece) return null;
  return piece.toLowerCase() === "b" ? CHECKER_COLORS.BLACK : CHECKER_COLORS.WHITE;
}

function makeCheckersMove(index) {
  const game = mode === "solo" ? localGame : client?.getGameState(activeGameId);
  const side = mode === "solo" ? CHECKER_COLORS.BLACK : roomPlayerSide();
  if (!isCheckersState(game) || game.turn !== side || (mode === "room" && roomHumanSeatCount(game) < 2)) return;

  const legalMoves = getCheckersMoves(game, side);
  const chosenMove = selectedChecker === null
    ? null
    : legalMoves.find((move) => move.from === selectedChecker && move.to === index);

  if (chosenMove) {
    const next = playCheckersMove(game, selectedChecker, index, side);
    selectedChecker = next.forcedFrom;
    if (mode === "solo") {
      localGame = next;
      renderGame(localGame, 2, side);
      queueComputerMove();
    } else {
      client.setGameState(activeGameId, next);
    }
    return;
  }

  const canSelect = pieceColor(game.board[index]) === side
    && legalMoves.some((move) => move.from === index);
  selectedChecker = canSelect ? index : null;
  lastRevision = -1;
  renderGame(game, mode === "solo" ? 2 : client.playerCount, side);
}

function makeFiveInRowMove(index) {
  if (mode === "solo") {
    const next = playFiveInRowMove(localGame, index, FIVE_MARKS.BLACK);
    if (next === localGame) return;
    localGame = next;
    renderGame(localGame, 2, FIVE_MARKS.BLACK);
    queueComputerMove();
    return;
  }

  const current = client?.getGameState(activeGameId);
  const side = roomPlayerSide();
  if (!isFiveInRowState(current) || side === null || roomHumanSeatCount(current) < 2) return;
  const next = playFiveInRowMove(current, index, side);
  if (next !== current) client.setGameState(activeGameId, next);
}

function makeReversiMove(index) {
  const side = mode === "solo" ? REVERSI_COLORS.BLACK : roomPlayerSide();
  const game = mode === "solo" ? localGame : client?.getGameState(activeGameId);
  if (!isReversiState(game) || game.turn !== side || (mode === "room" && roomHumanSeatCount(game) < 2)) return;
  const next = playReversiMove(game, index, side);
  if (next === game) return;
  if (mode === "solo") {
    localGame = next;
    renderGame(localGame, 2, side);
    queueComputerMove();
  } else {
    client.setGameState(activeGameId, next);
  }
}

function playDurakAction(action, cardId = null, intent = null) {
  const game = mode === "solo" ? localGame : client?.getGameState(activeGameId);
  const side = mode === "solo" ? 0 : roomPlayerSide();
  if (!isDurakState(game) || side === null) return;
  let next = game;
  if (action === "card") next = playDurakCard(game, cardId, side, intent);
  if (action === "pass") next = passDurak(game, side);
  if (action === "take") next = takeDurak(game, side);
  if (next === game) return;
  if (mode === "solo") {
    localGame = next;
    renderGame(localGame, 4, side);
    queueComputerMove();
  } else {
    client.setGameState(activeGameId, next);
    setTimeout(queueComputerMove, 0);
  }
}

function queueComputerMove() {
  const game = mode === "room" ? client?.getGameState(activeGameId) : localGame;

  if (activeGameId === "durak") {
    if (!isDurakState(game) || game.winner !== null) return;
    const humanSeats = roomHumanSeatCount(game);
    const actions = getDurakActions(game, game.turn);
    const emptyTurnCanOnlyPass = actions.canPass && (game.players[game.turn]?.hand.length ?? 0) === 0;
    if (emptyTurnCanOnlyPass) {
      if (mode === "room" && !isRoomAutomationController(game)) return;
      const next = passDurak(game, game.turn);
      if (next === game) return;
      if (mode === "room") client.setGameState(activeGameId, next);
      else {
        localGame = next;
        renderGame(localGame, localGame.options.playerCount, 0);
        queueComputerMove();
      }
      return;
    }
    const botTurn = game.turn >= humanSeats;
    if (!botTurn || (mode === "room" && !isRoomAutomationController(game))) return;
    if (computerTimer) return;
    elements.gameStatus.textContent = `Seat ${game.turn + 1} bot is thinking...`;
    computerTimer = setTimeout(() => {
      computerTimer = null;
      const current = mode === "room" ? client?.getGameState(activeGameId) : localGame;
      if (!isDurakState(current)) return;
      const action = chooseDurakBotAction(current, current.turn);
      if (!action) return;
      let next = current;
      if (action.type === "card") next = playDurakCard(current, action.cardId, current.turn, action.intent);
      if (action.type === "pass") next = passDurak(current, current.turn);
      if (action.type === "take") next = takeDurak(current, current.turn);
      if (next === current) return;
      if (mode === "room") client.setGameState(activeGameId, next);
      else {
        localGame = next;
        renderGame(localGame, 4, 0);
        queueComputerMove();
      }
    }, 500);
    return;
  }

  clearTimeout(computerTimer);
  computerTimer = null;
  if (mode !== "solo" || !game) return;
  const computerSide = activeGameId === "checkers"
    ? CHECKER_COLORS.WHITE
    : activeGameId === "reversi"
      ? REVERSI_COLORS.WHITE
      : "O";
  if (game.winner || game.turn !== computerSide) return;
  elements.gameStatus.textContent = "Computer is thinking...";
  computerTimer = setTimeout(() => {
    computerTimer = null;
    if (activeGameId === "checkers") {
      const move = chooseCheckersMove(localGame, computerSide);
      if (move) localGame = playCheckersMove(localGame, move.from, move.to, computerSide);
      renderGame(localGame, 2, CHECKER_COLORS.BLACK);
      if (localGame.turn === computerSide && !localGame.winner) queueComputerMove();
    } else if (activeGameId === "five-in-row") {
      const index = chooseFiveInRowMove(localGame, computerSide);
      if (index >= 0) localGame = playFiveInRowMove(localGame, index, computerSide);
      renderGame(localGame, 2, FIVE_MARKS.BLACK);
    } else if (activeGameId === "reversi") {
      const index = chooseReversiMove(localGame, computerSide);
      if (index >= 0) localGame = playReversiMove(localGame, index, computerSide);
      renderGame(localGame, 2, REVERSI_COLORS.BLACK);
      if (localGame.turn === computerSide && !localGame.winner) queueComputerMove();
    } else {
      const index = chooseComputerMove(localGame);
      if (index >= 0) localGame = playMove(localGame, index, computerSide);
      renderGame(localGame, 2, "X");
    }
  }, 450);
}

function renderGame(game, playerCount, myMark) {
  if (game.revision === lastRevision && playerCount === lastPlayerCount) return;
  lastRevision = game.revision;
  lastPlayerCount = playerCount;

  if (activeGameId === "checkers") {
    renderCheckers(game, playerCount, myMark);
    return;
  }
  if (activeGameId === "five-in-row") {
    renderFiveInRow(game, playerCount, myMark);
    return;
  }
  if (activeGameId === "reversi") {
    renderReversi(game, playerCount, myMark);
    return;
  }
  if (activeGameId === "durak") {
    renderDurak(game, myMark);
    return;
  }

  [...elements.board.children].forEach((cell, index) => {
    const mark = game.board[index];
    cell.textContent = mark === "X" ? "×" : mark === "O" ? "○" : "";
    cell.className = `cell${mark ? ` mark-${mark.toLowerCase()}` : ""}${game.winningLine.includes(index) ? " is-win" : ""}`;
    cell.disabled = Boolean(mark || game.winner || playerCount < 2 || game.turn !== myMark);
  });
  elements.scoreX.textContent = game.scores.X;
  elements.scoreO.textContent = game.scores.O;
  elements.cards.forEach((card) => card.classList.toggle("is-turn", !game.winner && card.dataset.player === game.turn));

  if (playerCount < 2) elements.gameStatus.textContent = "Waiting for the second player...";
  else if (game.winner === "draw") elements.gameStatus.textContent = "Draw!";
  else if (game.winner) elements.gameStatus.textContent = game.winner === myMark ? "You won!" : "Opponent won";
  else elements.gameStatus.textContent = game.turn === myMark ? "Your turn" : "Opponent's turn";
}

function renderFiveInRow(game, playerCount, myMark) {
  [...elements.board.children].forEach((cell, index) => {
    const mark = game.board[index];
    cell.replaceChildren();
    if (mark) {
      const stone = document.createElement("span");
      stone.className = `five-stone ${mark === FIVE_MARKS.BLACK ? "black" : "white"}`;
      cell.append(stone);
    }
    cell.className = `five-cell${game.winningLine.includes(index) ? " is-win" : ""}`;
    cell.disabled = Boolean(mark || game.winner || playerCount < 2 || game.turn !== myMark);
  });

  elements.scoreX.textContent = game.scores.X;
  elements.scoreO.textContent = game.scores.O;
  elements.cards.forEach((card) => card.classList.toggle("is-turn", !game.winner && card.dataset.player === game.turn));

  if (playerCount < 2) elements.gameStatus.textContent = "Waiting for the second player...";
  else if (game.winner === "draw") elements.gameStatus.textContent = "Draw!";
  else if (game.winner) elements.gameStatus.textContent = game.winner === myMark ? "You won!" : "Opponent won";
  else elements.gameStatus.textContent = game.turn === myMark ? "Your turn" : "Opponent's turn";
}

function renderReversi(game, playerCount, myColor) {
  const legalMoves = getReversiMoves(game, myColor).map((move) => move.index);
  [...elements.board.children].forEach((cell, index) => {
    const color = game.board[index];
    cell.replaceChildren();
    cell.className = `reversi-cell${legalMoves.includes(index) ? " is-target" : ""}`;
    if (color) {
      const disc = document.createElement("span");
      disc.className = `reversi-disc ${color === REVERSI_COLORS.BLACK ? "black" : "white"}`;
      cell.append(disc);
    }
    cell.disabled = Boolean(color || game.winner || playerCount < 2 || game.turn !== myColor || !legalMoves.includes(index));
  });

  elements.scoreX.textContent = countReversi(game.board, REVERSI_COLORS.BLACK);
  elements.scoreO.textContent = countReversi(game.board, REVERSI_COLORS.WHITE);
  elements.cards.forEach((card) => {
    const color = card.dataset.player === "X" ? REVERSI_COLORS.BLACK : REVERSI_COLORS.WHITE;
    card.classList.toggle("is-turn", !game.winner && color === game.turn);
  });

  if (playerCount < 2) elements.gameStatus.textContent = "Waiting for the second player...";
  else if (game.winner === "draw") elements.gameStatus.textContent = "Draw!";
  else if (game.winner) elements.gameStatus.textContent = game.winner === myColor ? "You won!" : "Opponent won";
  else if (game.turn === myColor) elements.gameStatus.textContent = legalMoves.length ? "Your turn" : "No legal moves";
  else elements.gameStatus.textContent = "Opponent's turn";
}

function renderDurakSetup() {
  const minPlayers = minDurakPlayers();
  const options = normalizeDurakOptions({
    ...pendingDurakOptions,
    playerCount: Math.max(pendingDurakOptions?.playerCount ?? DEFAULT_DURAK_OPTIONS.playerCount, minPlayers),
  });
  pendingDurakOptions = options;
  elements.scoreboard.hidden = true;
  elements.board.replaceChildren();

  const panel = document.createElement("form");
  panel.className = "durak-setup";
  panel.innerHTML = `
    <div class="durak-setup-title">
      <strong>Durak table</strong>
      <span>${isRoomLikeMode() ? `${minPlayers} humans in room` : "Solo table"}</span>
    </div>
    <label>
      Players
      <input name="playerCount" type="range" min="${minPlayers}" max="${DURAK_PLAYER_RANGE.MAX}" value="${options.playerCount}" />
      <output>${options.playerCount}</output>
    </label>
    <label class="durak-check">
      <input name="throwIn" type="checkbox" ${options.throwIn ? "checked" : ""} />
      <span>Podkidnoy: after the attacker stops, other players may throw in</span>
    </label>
    <label class="durak-check">
      <input name="transferable" type="checkbox" ${options.transferable ? "checked" : ""} />
      <span>Transferable: pass the attack with a card of the same rank</span>
    </label>
    <label>
      Tournament target
      <select name="matchTarget">
        ${[1, 2, 3, 5, 7].map((target) => `<option value="${target}" ${target === options.matchTarget ? "selected" : ""}>${target === 1 ? "One game" : `${target} wins`}</option>`).join("")}
      </select>
    </label>
    <button class="primary-button" type="submit">Start table</button>
  `;

  const range = panel.elements.playerCount;
  const output = panel.querySelector("output");
  range.addEventListener("input", () => { output.textContent = range.value; });
  panel.addEventListener("submit", (event) => {
    event.preventDefault();
    pendingDurakOptions = normalizeDurakOptions({
      playerCount: Math.max(Number(panel.elements.playerCount.value), minPlayers),
      throwIn: panel.elements.throwIn.checked,
      transferable: panel.elements.transferable.checked,
      matchTarget: Number(panel.elements.matchTarget.value),
    });
    startConfiguredDurakGame();
  });

  elements.board.append(panel);
  elements.gameStatus.textContent = isRoomLikeMode() && !client?.isHost
    ? "Waiting for host to start the table..."
    : "Choose table settings";
}

function startConfiguredDurakGame() {
  if (mode === "solo") {
    localGame = createGameForActive(null);
    lastRevision = -1;
    elements.newRound.hidden = false;
    renderGame(localGame, localGame.options.playerCount, 0);
    queueComputerMove();
    return;
  }
  const previous = client.getGameState(activeGameId);
  lastRevision = -1;
  mode = "room";
  client.setGameState(activeGameId, createGameForActive(previous));
  const revision = (client.getRoomState()?.revision ?? 0) + 1;
  client.setRoomState({
    screen: "game",
    activeGame: activeGameId,
    startedAt: Date.now(),
    revision,
  });
}

function renderDurak(game, mySeat) {
  elements.board.replaceChildren();
  const table = document.createElement("div");
  table.className = "durak-table";

  const header = document.createElement("div");
  header.className = "durak-header";
  header.innerHTML = `
    <span>Trump: <strong>${cardText(game.trump)}</strong></span>
    <span>Deck: <strong>${game.deck.length}</strong></span>
    <span>Discard: <strong>${game.discard.length}</strong></span>
    <span>${game.options.throwIn ? "Podkidnoy" : "Classic"}${game.options.transferable ? " + Transferable" : ""}</span>
    <span>Target: <strong>${game.options.matchTarget}</strong></span>
  `;
  table.append(header);

  const players = document.createElement("div");
  players.className = "durak-players";
  game.players.forEach((player, index) => {
    const seat = document.createElement("div");
    seat.className = `durak-player${index === mySeat ? " is-you" : ""}${index === game.turn ? " is-turn" : ""}`;
    const assignedSeat = roomGameSeats(game)[index];
    const assignedPlayer = assignedSeat ? playerById(assignedSeat.playerId) : null;
    const label = mode === "room" && assignedSeat
      ? (assignedPlayer ? profileForPlayer(assignedPlayer, assignedSeat.name) : assignedSeat.name)
      : index === 0 && mode === "solo"
        ? `${playerProfile.avatar} ${playerProfile.name}`
        : `Bot ${index + 1}`;
    seat.innerHTML = `<strong>${label}</strong><span>${player.hand.length} cards · ${game.scores?.[index] ?? 0} pts</span>`;
    if (index === game.attacker) seat.insertAdjacentHTML("beforeend", "<small>Attacker</small>");
    if (index === game.defender) seat.insertAdjacentHTML("beforeend", "<small>Defender</small>");
    if (game.passedThrowers?.includes(index)) seat.insertAdjacentHTML("beforeend", "<small>Pass</small>");
    players.append(seat);
  });
  table.append(players);

  const pairs = document.createElement("div");
  pairs.className = "durak-pairs";
  if (!game.table.length) {
    pairs.innerHTML = `<span class="durak-empty">Table is clear</span>`;
  } else {
    game.table.forEach((pair) => {
      const slot = document.createElement("div");
      slot.className = "durak-pair";
      slot.innerHTML = `<span>${cardText(pair.attack)}</span><span>${pair.defense ? cardText(pair.defense) : "..."}</span>`;
      pairs.append(slot);
    });
  }
  table.append(pairs);

  const hand = document.createElement("div");
  hand.className = "durak-hand";
  const actions = getDurakActions(game, mySeat);
  const legalIds = new Set(actions.cards.map((card) => card.id));
  const cards = mySeat === null ? [] : game.players[mySeat]?.hand ?? [];
  cards.forEach((card) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `durak-card ${card.suit === game.trump.suit ? "is-trump" : ""}`;
    button.textContent = cardText(card);
    button.disabled = !legalIds.has(card.id);
    button.addEventListener("click", () => {
      const canDefend = actions.defenseCardIds?.includes(card.id);
      const canTransfer = actions.transferCardIds?.includes(card.id);
      const intent = canDefend && canTransfer
        ? (window.confirm("Beat with this card? Press Cancel to transfer the attack.") ? "defend" : "transfer")
        : canDefend ? "defend" : canTransfer ? "transfer" : null;
      playDurakAction("card", card.id, intent);
    });
    hand.append(button);
  });
  table.append(hand);

  const actionBar = document.createElement("div");
  actionBar.className = "durak-actions";
  const pass = document.createElement("button");
  pass.className = "secondary-button";
  pass.type = "button";
  pass.textContent = "Bito";
  pass.disabled = !actions.canPass;
  pass.addEventListener("click", () => playDurakAction("pass"));
  const take = document.createElement("button");
  take.className = "secondary-button";
  take.type = "button";
  take.textContent = "Take";
  take.disabled = !actions.canTake;
  take.addEventListener("click", () => playDurakAction("take"));
  actionBar.append(pass, take);
  table.append(actionBar);

  elements.board.append(table);
  if (game.winner === "draw") elements.gameStatus.textContent = "Draw.";
  else if (game.matchWinner !== null) elements.gameStatus.textContent = `Seat ${game.matchWinner + 1} wins the tournament.`;
  else if (game.winner !== null) elements.gameStatus.textContent = game.winner === mySeat ? "You are the durak." : `Seat ${game.winner + 1} is the durak.`;
  else if (game.turn === mySeat) {
    elements.gameStatus.textContent = mySeat === game.defender
      ? "Your defense"
      : mySeat === game.attacker
        ? "Your attack"
        : "Your throw-in";
  }
  else elements.gameStatus.textContent = `Seat ${game.turn + 1} is thinking...`;
}

function renderCheckers(game, playerCount, mySide) {
  const legalMoves = getCheckersMoves(game, mySide);
  const targets = selectedChecker === null
    ? []
    : legalMoves.filter((move) => move.from === selectedChecker).map((move) => move.to);

  [...elements.board.children].forEach((cell, index) => {
    const piece = game.board[index];
    const dark = (Math.floor(index / 8) + index % 8) % 2 === 1;
    cell.className = `checkers-cell${dark ? " is-dark" : ""}${index === selectedChecker ? " is-selected" : ""}${targets.includes(index) ? " is-target" : ""}`;
    cell.replaceChildren();
    if (piece) {
      const checker = document.createElement("span");
      checker.className = `checker-piece ${pieceColor(piece)}${piece === piece.toUpperCase() ? " king" : ""}`;
      cell.append(checker);
    }
    cell.disabled = !dark || Boolean(game.winner) || playerCount < 2 || game.turn !== mySide;
  });

  elements.scoreX.textContent = countCheckers(game.board, CHECKER_COLORS.BLACK);
  elements.scoreO.textContent = countCheckers(game.board, CHECKER_COLORS.WHITE);
  elements.cards.forEach((card) => {
    const cardSide = card.dataset.player === "X" ? CHECKER_COLORS.BLACK : CHECKER_COLORS.WHITE;
    card.classList.toggle("is-turn", !game.winner && cardSide === game.turn);
  });

  if (playerCount < 2) elements.gameStatus.textContent = "Waiting for the second player...";
  else if (game.winner) elements.gameStatus.textContent = game.winner === mySide ? "You won!" : "Opponent won";
  else if (game.turn !== mySide) elements.gameStatus.textContent = "Opponent's turn";
  else if (game.forcedFrom !== null) elements.gameStatus.textContent = "Continue the capture";
  else if (legalMoves.some((move) => move.captured !== null)) elements.gameStatus.textContent = "Your turn - capture is mandatory";
  else elements.gameStatus.textContent = "Your turn";
}

function requestCloseGame() {
  clearTimeout(computerTimer);
  computerTimer = null;
  if (document.fullscreenElement === elements.gameDialog) document.exitFullscreen?.().catch(() => {});
  if (mode === "room" && client) {
    if (!confirm("End the game and return the whole room to the catalog?")) return;
    destroyRealtimeGames();
    const revision = (client.getRoomState()?.revision ?? 0) + 1;
    client.setRoomState({ screen: "catalog", activeGame: null, returnedAt: Date.now(), revision });
    closeGameFromSync();
  } else {
    destroyRealtimeGames();
    closeOverlay(elements.gameDialog, "game");
    if (mode === "room-setup") mode = "room";
  }
}

function startNewRound() {
  if (mode === "solo") {
    localGame = createGameForActive(localGame);
    selectedChecker = null;
    lastRevision = -1;
    renderGame(localGame, activeGameId === "durak" ? 4 : 2, activeGameId === "checkers"
      ? CHECKER_COLORS.BLACK
      : activeGameId === "reversi"
        ? REVERSI_COLORS.BLACK
        : activeGameId === "durak"
          ? 0
          : "X");
    queueComputerMove();
    return;
  }
  const current = client?.getGameState(activeGameId);
  if (client?.isHost && isValidGameState(current)) {
    client.setGameState(activeGameId, createGameForActive(current));
  }
}

function leaveRoom() {
  const extra = elements.gameDialog.open ? " The active game will also close." : "";
  if (!confirm(`Leave the room?${extra}`)) return;
  clearInterval(syncTimer);
  const url = new URL(location.href);
  url.hash = "";
  location.replace(url.toString());
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(elements.inviteLink.value);
    setRoomStatus("Link copied.");
  } catch {
    elements.inviteLink.select();
    setRoomStatus("The link is selected. Copy it manually.");
  }
}

function chooseAvatar(avatar) {
  savePlayerProfile({ ...playerProfile, name: elements.playerNameInput.value, avatar });
}

function submitPlayerProfile(event) {
  event.preventDefault();
  savePlayerProfile({ ...playerProfile, name: elements.playerNameInput.value });
  closeOverlay(elements.playerDialog, "player");
}

function handlePopState() {
  if (elements.helpDialog.open) {
    elements.helpDialog.close();
    return;
  }
  if (elements.playerDialog.open) {
    elements.playerDialog.close();
    return;
  }
  if (elements.gameDialog.open) {
    destroyRealtimeGames();
    if (document.fullscreenElement === elements.gameDialog) document.exitFullscreen?.().catch(() => {});
    elements.gameDialog.close();
    if (mode === "room" && client && !suppressGameReturn) {
      const revision = (client.getRoomState()?.revision ?? 0) + 1;
      client.setRoomState({ screen: "catalog", activeGame: null, returnedAt: Date.now(), revision });
    }
    suppressGameReturn = false;
    if (mode === "solo") mode = "catalog";
    if (mode === "room-setup") mode = "room";
    return;
  }
  if (elements.roomDialog.open) elements.roomDialog.close();
}

elements.openPlayerMenu.addEventListener("click", () => openOverlay(elements.playerDialog, "player"));
elements.profileForm.addEventListener("submit", submitPlayerProfile);
elements.avatarButtons.forEach((button) => {
  button.addEventListener("click", () => chooseAvatar(button.dataset.avatar));
});
elements.openRoomMenu.addEventListener("click", () => openOverlay(elements.roomDialog, "room"));
elements.findPublic.addEventListener("click", () => connectRoom({ matchmaking: true, kind: "public" }, elements.findPublic));
elements.createPrivate.addEventListener("click", () => connectRoom({ kind: "private" }, elements.createPrivate));
elements.joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  connectRoom({ roomCode: elements.roomCodeInput.value, kind: "private" }, elements.joinForm.querySelector("button"));
});
elements.copyInvite.addEventListener("click", copyInvite);
elements.leaveRoom.addEventListener("click", leaveRoom);
elements.playSoloButtons.forEach((button) => {
  button.addEventListener("click", () => openSoloGame(button.dataset.game));
});
elements.launchButtons.forEach((button) => {
  button.addEventListener("click", () => launchForRoom(button.dataset.game));
});
elements.closeGame.addEventListener("click", requestCloseGame);
elements.newRound.addEventListener("click", startNewRound);
elements.openHelp.addEventListener("click", () => openOverlay(elements.helpDialog, "help"));
elements.closeHelp.addEventListener("click", () => closeOverlay(elements.helpDialog, "help"));
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    const dialogId = button.dataset.closeDialog;
    closeOverlay(document.getElementById(dialogId), dialogId.replace("-dialog", ""));
  });
});
elements.playerDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeOverlay(elements.playerDialog, "player");
});
elements.roomDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeOverlay(elements.roomDialog, "room");
});
elements.gameDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestCloseGame();
});
elements.helpDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeOverlay(elements.helpDialog, "help");
});
window.addEventListener("popstate", handlePopState);

renderPlayerProfile();
buildBoard("tic-tac-toe");
initCreator({ profile: () => ({ ...playerProfile }) });

const invitedCode = roomCodeFromUrl();
if (invitedCode) {
  elements.roomCodeInput.value = invitedCode;
  setRoomStatus(`Invitation to room ${invitedCode}. Press Join.`);
  openOverlay(elements.roomDialog, "room");
}
