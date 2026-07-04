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

const GAMES = {
  "tic-tac-toe": {
    title: "Крестики-нолики",
    kicker: "СПЕЙС 001",
    help: `
      <h3>Цель</h3>
      <p>Первым составить линию из трёх своих знаков по горизонтали, вертикали или диагонали.</p>
      <h3>Ход игры</h3>
      <ul>
        <li>Игроки ходят по очереди в свободную клетку.</li>
        <li>Первый ход чередуется между партиями.</li>
        <li>Если поле заполнено без линии из трёх знаков, объявляется ничья.</li>
      </ul>`,
  },
  checkers: {
    title: "Шашки",
    kicker: "СПЕЙС 002",
    help: `
      <h3>Цель</h3>
      <p>Забрать все шашки соперника или лишить его возможности сделать ход.</p>
      <h3>Русские шашки</h3>
      <ul>
        <li>Простая шашка ходит по диагонали вперёд на одну клетку.</li>
        <li>Бить можно вперёд и назад. Если взятие возможно, оно обязательно.</li>
        <li>За один ход нужно продолжать серию взятий той же шашкой.</li>
        <li>На последней горизонтали шашка становится дамкой.</li>
        <li>Дамка ходит и бьёт на любое расстояние по диагонали.</li>
      </ul>`,
  },
  worms: {
    title: "Червячки",
    kicker: "СПЕЙС 003 · REALTIME",
    help: `
      <h3>Цель</h3>
      <p>Сними 120 HP синего червячка. Используй рельеф, ограниченный боезапас и падающие припасы.</p>
      <h3>На телефоне</h3>
      <ul>
        <li>Левый палец двигает червячка; свайп вверх выполняет прыжок.</li>
        <li>Правый палец задаёт направление. Отпусти его, чтобы применить выбранное оружие.</li>
        <li>Оружие переключается кнопками под ареной.</li>
      </ul>
      <h3>Клавиатура</h3>
      <p>A/D или стрелки — движение, W — прыжок, мышь — прицел, пробел — огонь, 1–7 — выбор инструмента.</p>`,
  },
};

const $ = (selector) => document.querySelector(selector);
const elements = {
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
    cell.setAttribute("aria-label", `Клетка ${index + 1}`);
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
    elements.roomQr.textContent = "QR недоступен";
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
    setRoomStatus("Проверь код комнаты: в нём должно быть не меньше трёх символов.", true);
    elements.roomCodeInput.focus();
    return;
  }

  const originalLabel = trigger.textContent;
  connectionButtons.forEach((button) => { button.disabled = true; });
  trigger.textContent = matchmaking ? "Ищем…" : code ? "Подключаемся…" : "Создаём…";
  setRoomStatus(matchmaking ? "Ищем свободную открытую комнату…" : "Подключаемся к Playroom…");

  try {
    client ??= new PlayroomClient();
    await client.start({ matchmaking, roomCode: code || undefined });
    roomKind = kind;

    client.onDisconnect((event) => {
      clearInterval(syncTimer);
      setRoomStatus(`Соединение потеряно: ${event?.reason || "комната закрыта"}.`, true);
      elements.roomButtonLabel.textContent = "Нет соединения";
      elements.openRoomMenu.classList.remove("is-connected");
      openOverlay(elements.roomDialog, "room");
    });

    if (client.isHost && !client.getRoomState()) {
      client.setRoomState({ screen: "catalog", activeGame: null, revision: 1 });
    }

    mode = "room";
    showConnectedRoom();
    startRoomSync();
    setRoomStatus("Комната подключена.");
  } catch (error) {
    console.error(error);
    const full = error?.message === "ROOM_LIMIT_EXCEEDED";
    setRoomStatus(full ? "Эта комната уже заполнена." : "Не удалось подключиться. Проверь код и попробуй ещё раз.", true);
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
  elements.roomTitle.textContent = "Текущая комната";
  elements.roomCodeDisplay.textContent = code;
  elements.roomKind.textContent = roomKind === "public" ? "Открытая комната" : "Приватная комната";
  elements.inviteLink.value = link;
  elements.partyPanel.hidden = false;
  elements.partyCode.textContent = `Код: ${code}`;
  elements.openRoomMenu.classList.add("is-connected");
  elements.roomButtonLabel.textContent = `Комната ${code}`;
  elements.playSoloButtons.forEach((button) => { button.hidden = true; });
  elements.launchButtons.forEach((button) => { button.hidden = false; });
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
    const gameChanged = configuredGameId !== room.activeGame || elements.board.children.length !== expectedCells;
    activeGameId = room.activeGame;
    mode = "room";
    if (gameChanged) setupGameShell();
    setupRoomLabels();
    openOverlay(elements.gameDialog, "game");
    const game = client.getGameState(activeGameId);
    if (isValidGameState(game)) renderGame(game, client.playerCount, roomPlayerSide());
  } else if (elements.gameDialog.open && mode === "room") {
    closeGameFromSync();
  }
}

function renderParty() {
  if (!client) return;
  const text = `Игроков: ${Math.min(client.playerCount, 2)} / 2`;
  elements.partyPlayers.textContent = text;
  elements.roomPlayerCount.textContent = text;
}

function setupRoomLabels() {
  const side = roomPlayerSide();
  elements.role.textContent = activeGameId === "checkers"
    ? `Ты играешь за ${side === CHECKER_COLORS.BLACK ? "чёрных" : "белых"}`
    : `Ты играешь за ${side === "X" ? "×" : "○"}`;
  elements.players.textContent = `Игроков: ${Math.min(client.playerCount, 2)} / 2`;
  elements.nameX.textContent = "Хозяин комнаты";
  elements.nameO.textContent = "Второй игрок";
  elements.newRound.hidden = !client.isHost;
  elements.hint.textContent = "Кнопка × завершает игру и возвращает всю комнату в каталог.";
}

function setupGameShell() {
  const game = GAMES[activeGameId];
  configuredGameId = activeGameId;
  elements.gameKicker.textContent = game.kicker;
  elements.gameTitle.textContent = game.title;
  elements.helpTitle.textContent = `Правила: ${game.title}`;
  elements.helpContent.innerHTML = game.help;
  const isWorms = activeGameId === "worms";
  elements.board.hidden = isWorms;
  elements.wormsStage.hidden = !isWorms;
  elements.scoreboard.hidden = isWorms;
  elements.roomInfo.hidden = isWorms;
  elements.gameActions.hidden = isWorms;
  elements.hint.hidden = isWorms;
  elements.gameDialog.classList.toggle("is-worms", isWorms);
  elements.board.setAttribute("aria-label", `Поле игры «${game.title}»`);
  elements.markX.textContent = activeGameId === "checkers" ? "●" : "×";
  elements.markO.textContent = activeGameId === "checkers" ? "○" : "○";
  if (!isWorms) buildBoard(activeGameId);
  selectedChecker = null;
  lastRevision = -1;
}

function roomPlayerSide() {
  if (activeGameId === "checkers") {
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
    elements.gameStatus.textContent = "Выбери одну из трёх карт";
    openOverlay(elements.gameDialog, "game");
    wormsGame?.destroy();
    wormsGame = new WormsGame(elements.wormsStage, {
      onStatus: (message) => { elements.gameStatus.textContent = message; },
    });
    elements.gameDialog.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.("landscape").catch(() => {}))
      .catch(() => {});
    return;
  }
  localGame = createGameForActive(null);
  setupGameShell();
  const humanSide = activeGameId === "checkers" ? CHECKER_COLORS.BLACK : "X";
  elements.role.textContent = activeGameId === "checkers" ? "Ты играешь за чёрных" : "Ты играешь за ×";
  elements.players.textContent = "Одиночная игра";
  elements.nameX.textContent = "Ты";
  elements.nameO.textContent = "Компьютер";
  elements.newRound.hidden = false;
  elements.hint.textContent = "Закрой игру, чтобы вернуться в каталог.";
  lastRevision = -1;
  openOverlay(elements.gameDialog, "game");
  renderGame(localGame, 2, humanSide);
  queueComputerMove();
}

function launchForRoom(gameId) {
  if (gameId === "worms") return;
  activeGameId = gameId;
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
  elements.gameStatus.textContent = "Компьютер думает…";
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

  if (playerCount < 2) elements.gameStatus.textContent = "Ждём второго игрока…";
  else if (game.winner === "draw") elements.gameStatus.textContent = "Ничья!";
  else if (game.winner) elements.gameStatus.textContent = game.winner === myMark ? "Ты победил!" : "Победил соперник";
  else elements.gameStatus.textContent = game.turn === myMark ? "Твой ход" : "Ход соперника";
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

  if (playerCount < 2) elements.gameStatus.textContent = "Ждём второго игрока…";
  else if (game.winner) elements.gameStatus.textContent = game.winner === mySide ? "Ты победил!" : "Победил соперник";
  else if (game.turn !== mySide) elements.gameStatus.textContent = "Ход соперника";
  else if (game.forcedFrom !== null) elements.gameStatus.textContent = "Продолжай взятие";
  else if (legalMoves.some((move) => move.captured !== null)) elements.gameStatus.textContent = "Твой ход — нужно бить";
  else elements.gameStatus.textContent = "Твой ход";
}

function requestCloseGame() {
  clearTimeout(computerTimer);
  if (wormsGame) {
    wormsGame.destroy();
    wormsGame = null;
  }
  if (document.fullscreenElement === elements.gameDialog) document.exitFullscreen?.().catch(() => {});
  if (mode === "room" && client) {
    if (!confirm("Завершить игру и вернуть всю комнату в каталог?")) return;
    const revision = (client.getRoomState()?.revision ?? 0) + 1;
    client.setRoomState({ screen: "catalog", activeGame: null, returnedAt: Date.now(), revision });
    closeGameFromSync();
  } else {
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
  const extra = elements.gameDialog.open ? " Активная игра также будет закрыта." : "";
  if (!confirm(`Выйти из комнаты?${extra}`)) return;
  clearInterval(syncTimer);
  const url = new URL(location.href);
  url.hash = "";
  location.replace(url.toString());
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(elements.inviteLink.value);
    setRoomStatus("Ссылка скопирована.");
  } catch {
    elements.inviteLink.select();
    setRoomStatus("Выделили ссылку — скопируй её вручную.");
  }
}

function handlePopState() {
  if (elements.helpDialog.open) {
    elements.helpDialog.close();
    return;
  }
  if (elements.gameDialog.open) {
    if (wormsGame) {
      wormsGame.destroy();
      wormsGame = null;
    }
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
  button.addEventListener("click", () => closeOverlay(document.getElementById(button.dataset.closeDialog), "room"));
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

buildBoard("tic-tac-toe");

const invitedCode = roomCodeFromUrl();
if (invitedCode) {
  elements.roomCodeInput.value = invitedCode;
  setRoomStatus(`Приглашение в комнату ${invitedCode}. Нажми «Войти».`);
  openOverlay(elements.roomDialog, "room");
}
