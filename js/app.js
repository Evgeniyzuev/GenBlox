import { PlayroomClient } from "./core/playroom-client.js";
import {
  chooseComputerMove,
  createGame,
  isGameState,
  playMove,
} from "./games/tic-tac-toe.js";

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
  playSolo: $("#play-solo"),
  launchForRoom: $("#launch-for-room"),
  partyPanel: $("#party-panel"),
  partyCode: $("#party-code"),
  partyPlayers: $("#party-players"),
  gameDialog: $("#game-dialog"),
  closeGame: $("#close-game"),
  board: $("#game-board"),
  gameStatus: $("#game-status"),
  role: $("#role-label"),
  players: $("#players-label"),
  nameX: $("#name-x"),
  nameO: $("#name-o"),
  scoreX: $("#score-x"),
  scoreO: $("#score-o"),
  newRound: $("#new-round"),
  hint: $("#game-hint"),
  cards: [...document.querySelectorAll(".player-card")],
};

const connectionButtons = [elements.findPublic, elements.createPrivate, elements.joinForm.querySelector("button")];
let client = null;
let roomKind = null;
let mode = "catalog";
let localGame = null;
let lastRevision = -1;
let lastPlayerCount = -1;
let syncTimer = null;
let computerTimer = null;
let suppressGameReturn = false;

function buildBoard() {
  elements.board.replaceChildren();
  for (let index = 0; index < 9; index += 1) {
    const cell = document.createElement("button");
    cell.className = "cell";
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
  if (roomCode && code.length < 4) {
    setRoomStatus("Проверь код комнаты: в нём должно быть не меньше четырёх символов.", true);
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
  elements.playSolo.hidden = true;
  elements.launchForRoom.hidden = false;
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

  if (room?.screen === "game" && room.activeGame === "tic-tac-toe") {
    mode = "room";
    setupRoomLabels();
    openOverlay(elements.gameDialog, "game");
    const game = client.getGameState();
    if (isGameState(game)) renderGame(game, client.playerCount, client.mark);
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
  elements.role.textContent = client.isHost ? "Ты играешь за ×" : "Ты играешь за ○";
  elements.players.textContent = `Игроков: ${Math.min(client.playerCount, 2)} / 2`;
  elements.nameX.textContent = "Хозяин комнаты";
  elements.nameO.textContent = "Второй игрок";
  elements.newRound.hidden = !client.isHost;
  elements.hint.textContent = "Кнопка × завершает игру и возвращает всю комнату в каталог.";
}

function openSoloGame() {
  mode = "solo";
  localGame = createGame(localGame);
  elements.role.textContent = "Ты играешь за ×";
  elements.players.textContent = "Одиночная игра";
  elements.nameX.textContent = "Ты";
  elements.nameO.textContent = "Компьютер";
  elements.newRound.hidden = false;
  elements.hint.textContent = "Закрой игру, чтобы вернуться в каталог.";
  lastRevision = -1;
  openOverlay(elements.gameDialog, "game");
  renderGame(localGame, 2, "X");
}

function launchForRoom() {
  const previous = client.getGameState();
  lastRevision = -1;
  client.setGameState(createGame(isGameState(previous) ? previous : null));
  const revision = (client.getRoomState()?.revision ?? 0) + 1;
  client.setRoomState({
    screen: "game",
    activeGame: "tic-tac-toe",
    startedAt: Date.now(),
    revision,
  });
}

function makeMove(index) {
  if (mode === "solo") {
    const next = playMove(localGame, index, "X");
    if (next === localGame) return;
    localGame = next;
    renderGame(localGame, 2, "X");
    queueComputerMove();
    return;
  }

  const current = client?.getGameState();
  if (!isGameState(current) || client.playerCount < 2) return;
  const next = playMove(current, index, client.mark);
  if (next !== current) client.setGameState(next);
}

function queueComputerMove() {
  clearTimeout(computerTimer);
  if (localGame.winner || localGame.turn !== "O") return;
  elements.gameStatus.textContent = "Компьютер думает…";
  computerTimer = setTimeout(() => {
    const index = chooseComputerMove(localGame);
    if (index >= 0) localGame = playMove(localGame, index, "O");
    renderGame(localGame, 2, "X");
  }, 450);
}

function renderGame(game, playerCount, myMark) {
  if (game.revision === lastRevision && playerCount === lastPlayerCount) return;
  lastRevision = game.revision;
  lastPlayerCount = playerCount;

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

function requestCloseGame() {
  clearTimeout(computerTimer);
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
    localGame = createGame(localGame);
    lastRevision = -1;
    renderGame(localGame, 2, "X");
    return;
  }
  const current = client?.getGameState();
  if (client?.isHost && isGameState(current)) client.setGameState(createGame(current));
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
  if (elements.gameDialog.open) {
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
elements.playSolo.addEventListener("click", openSoloGame);
elements.launchForRoom.addEventListener("click", launchForRoom);
elements.closeGame.addEventListener("click", requestCloseGame);
elements.newRound.addEventListener("click", startNewRound);
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
window.addEventListener("popstate", handlePopState);

buildBoard();

const invitedCode = roomCodeFromUrl();
if (invitedCode) {
  elements.roomCodeInput.value = invitedCode;
  setRoomStatus(`Приглашение в комнату ${invitedCode}. Нажми «Войти».`);
  openOverlay(elements.roomDialog, "room");
}
