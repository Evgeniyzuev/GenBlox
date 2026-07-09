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
import { WormsGame } from "./games/worms.js";
import { MicroMachinesGame } from "./games/micromachines.js";
import { WaveRunnersGame } from "./games/wave-runners.js";

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
  classicGameView: $("#classic-game-view"),
  wormsGameView: $("#worms-game-view"),
  microGameView: $("#micro-game-view"),
  waveGameView: $("#wave-game-view"),
  wormsStatus: $("#worms-status"),
  microStatus: $("#micro-status"),
  waveStatus: $("#wave-status"),
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
let playerProfile = loadPlayerProfile();
let lastPublishedProfile = "";

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

function isRealtimeGame(gameId) {
  return gameId === "worms" || gameId === "micromachines" || gameId === "wave-runners";
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
  const size = gameId === "checkers" ? 64 : 9;
  for (let index = 0; index < size; index += 1) {
    const cell = document.createElement("button");
    cell.className = gameId === "checkers"
      ? `checkers-cell${(Math.floor(index / 8) + index % 8) % 2 ? " is-dark" : ""}`
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

  if (room?.screen === "game" && GAMES[room.activeGame]) {
    const expectedCells = room.activeGame === "checkers" ? 64 : 9;
    const gameChanged = configuredGameId !== room.activeGame || (!isRealtimeGame(room.activeGame) && elements.board.children.length !== expectedCells);
    activeGameId = room.activeGame;
    mode = "room";
    if (gameChanged) setupGameShell();
    setupRoomLabels();
    openOverlay(elements.gameDialog, "game");
    const game = client.getGameState(activeGameId);
    if (activeGameId === "worms") {
      if (client.playerIndex > 1) {
        destroyRealtimeGames();
        showRealtimeUnavailable(elements.wormsStage, "Spectating", "Worms is a two-player duel. You can watch this match and join the next room game.");
        elements.wormsStatus.textContent = "Spectating this duel";
        return;
      }
      if (!wormsGame) {
        microGame?.destroy();
        microGame = null;
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
        wormsGame = null;
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
      if (client.playerIndex > 1) {
        destroyRealtimeGames();
        showRealtimeUnavailable(elements.waveStage, "Spectating", "Wave Runners supports two active runners in this version.");
        elements.waveStatus.textContent = "Spectating Wave Runners";
        return;
      }
      if (!waveGame) {
        wormsGame?.destroy();
        microGame?.destroy();
        wormsGame = null;
        microGame = null;
        waveGame = new WaveRunnersGame(elements.waveStage, {
          bot: false,
          onStatus: (message) => { elements.waveStatus.textContent = message; },
          network: {
            role: client.isHost ? "host" : "guest",
            playerId: client.playerId,
            getPlayers: () => client.players.slice(0, 2).map((player, index) => ({
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
    if (isValidGameState(game)) renderGame(game, client.playerCount, roomPlayerSide());
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
  const side = roomPlayerSide();
  if (side === null) {
    elements.role.textContent = "Spectating";
    elements.players.textContent = `Players: ${Math.min(client.playerCount, 2)} / 2`;
    elements.nameX.textContent = profileForPlayer(playerByIndex(0), "Room Host");
    elements.nameO.textContent = profileForPlayer(playerByIndex(1), "Second Player");
    elements.newRound.hidden = true;
    elements.hint.textContent = "This game is limited to two active players.";
    return;
  }
  elements.role.textContent = activeGameId === "checkers"
    ? `You play ${side === CHECKER_COLORS.BLACK ? "black" : "white"}`
    : `You play ${side === "X" ? "×" : "○"}`;
  elements.players.textContent = `Players: ${Math.min(client.playerCount, 2)} / 2`;
  elements.nameX.textContent = profileForPlayer(playerByIndex(0), "Room Host");
  elements.nameO.textContent = profileForPlayer(playerByIndex(1), "Second Player");
  elements.newRound.hidden = !client.isHost;
  elements.hint.textContent = "The × button ends the game and returns the whole room to the catalog.";
}

function setupGameShell() {
  const game = GAMES[activeGameId];
  configuredGameId = activeGameId;
  elements.gameKicker.textContent = game.kicker;
  elements.gameTitle.textContent = game.title;
  elements.helpTitle.textContent = `Rules: ${game.title}`;
  elements.helpContent.innerHTML = game.help;
  const isWorms = activeGameId === "worms";
  const isMicro = activeGameId === "micromachines";
  const isWave = activeGameId === "wave-runners";
  elements.classicGameView.hidden = isWorms || isMicro || isWave;
  elements.wormsGameView.hidden = !isWorms;
  elements.microGameView.hidden = !isMicro;
  elements.waveGameView.hidden = !isWave;
  elements.gameDialog.classList.toggle("is-worms", isWorms);
  elements.gameDialog.classList.toggle("is-micro", isMicro);
  elements.gameDialog.classList.toggle("is-wave", isWave);
  elements.board.setAttribute("aria-label", `${game.title} board`);
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
    } else {
      elements.waveStatus.textContent = client.isHost
        ? "Choose a target score for the room run"
        : "The host is choosing a target score...";
    }
  }
  selectedChecker = null;
  lastRevision = -1;
}

function roomPlayerSide() {
  if (activeGameId === "checkers") {
    if (client.playerIndex > 1) return null;
    return client.isHost ? CHECKER_COLORS.BLACK : CHECKER_COLORS.WHITE;
  }
  return client.mark;
}

function isValidGameState(game) {
  return activeGameId === "checkers" ? isCheckersState(game) : isGameState(game);
}

function createGameForActive(previous = null) {
  return activeGameId === "checkers"
    ? createCheckersGame(isCheckersState(previous) ? previous : null)
    : createGame(isGameState(previous) ? previous : null);
}

function openSoloGame(gameId) {
  activeGameId = gameId;
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
  localGame = createGameForActive(null);
  setupGameShell();
  const humanSide = activeGameId === "checkers" ? CHECKER_COLORS.BLACK : "X";
  elements.role.textContent = activeGameId === "checkers" ? "You play black" : "You play ×";
  elements.players.textContent = "Solo game";
  elements.nameX.textContent = `${playerProfile.avatar} ${playerProfile.name}`;
  elements.nameO.textContent = "Computer";
  elements.newRound.hidden = false;
  elements.hint.textContent = "Close the game to return to the catalog.";
  lastRevision = -1;
  openOverlay(elements.gameDialog, "game");
  renderGame(localGame, 2, humanSide);
  queueComputerMove();
}

function launchForRoom(gameId) {
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

  if (mode === "solo") {
    const next = playMove(localGame, index, "X");
    if (next === localGame) return;
    localGame = next;
    renderGame(localGame, 2, "X");
    queueComputerMove();
    return;
  }

  const current = client?.getGameState(activeGameId);
  if (!isGameState(current) || client.playerCount < 2) return;
  const next = playMove(current, index, client.mark);
  if (next !== current) client.setGameState(activeGameId, next);
}

function pieceColor(piece) {
  if (!piece) return null;
  return piece.toLowerCase() === "b" ? CHECKER_COLORS.BLACK : CHECKER_COLORS.WHITE;
}

function makeCheckersMove(index) {
  const game = mode === "solo" ? localGame : client?.getGameState(activeGameId);
  const side = mode === "solo" ? CHECKER_COLORS.BLACK : roomPlayerSide();
  if (!isCheckersState(game) || game.turn !== side || (mode === "room" && client.playerCount < 2)) return;

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

function queueComputerMove() {
  clearTimeout(computerTimer);
  const computerSide = activeGameId === "checkers" ? CHECKER_COLORS.WHITE : "O";
  if (localGame.winner || localGame.turn !== computerSide) return;
  elements.gameStatus.textContent = "Computer is thinking...";
  computerTimer = setTimeout(() => {
    if (activeGameId === "checkers") {
      const move = chooseCheckersMove(localGame, computerSide);
      if (move) localGame = playCheckersMove(localGame, move.from, move.to, computerSide);
      renderGame(localGame, 2, CHECKER_COLORS.BLACK);
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
  }
}

function startNewRound() {
  if (mode === "solo") {
    localGame = createGameForActive(localGame);
    selectedChecker = null;
    lastRevision = -1;
    renderGame(localGame, 2, activeGameId === "checkers" ? CHECKER_COLORS.BLACK : "X");
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

const invitedCode = roomCodeFromUrl();
if (invitedCode) {
  elements.roomCodeInput.value = invitedCode;
  setRoomStatus(`Invitation to room ${invitedCode}. Press Join.`);
  openOverlay(elements.roomDialog, "room");
}
