import { PlayroomClient } from "./core/playroom-client.js";
import {
  chooseComputerMove,
  createGame,
  isGameState,
  playMove,
} from "./games/tic-tac-toe.js";

const elements = {
  playSolo: document.querySelector("#play-solo"),
  findPublic: document.querySelector("#find-public-room"),
  createPrivate: document.querySelector("#create-private-room"),
  launchForRoom: document.querySelector("#launch-for-room"),
  partyPanel: document.querySelector("#party-panel"),
  partyCode: document.querySelector("#party-code"),
  partyPlayers: document.querySelector("#party-players"),
  dialog: document.querySelector("#game-dialog"),
  close: document.querySelector("#close-game"),
  board: document.querySelector("#game-board"),
  status: document.querySelector("#game-status"),
  role: document.querySelector("#role-label"),
  players: document.querySelector("#players-label"),
  nameX: document.querySelector("#name-x"),
  nameO: document.querySelector("#name-o"),
  scoreX: document.querySelector("#score-x"),
  scoreO: document.querySelector("#score-o"),
  newRound: document.querySelector("#new-round"),
  hint: document.querySelector("#game-hint"),
  cards: [...document.querySelectorAll(".player-card")],
};

const roomButtons = [elements.findPublic, elements.createPrivate];
let client = null;
let mode = "catalog";
let localGame = null;
let lastRevision = -1;
let lastPlayerCount = -1;
let syncTimer = null;
let computerTimer = null;

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

function openDialog() {
  if (!elements.dialog.open) elements.dialog.showModal();
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
  openDialog();
  renderGame(localGame, 2, "X");
}

async function connectRoom(matchmaking, trigger) {
  const originalLabel = trigger.textContent;
  roomButtons.forEach((button) => { button.disabled = true; });
  trigger.textContent = matchmaking ? "Ищем комнату…" : "Создаём комнату…";

  try {
    client ??= new PlayroomClient();
    await client.start({ matchmaking });
    mode = "room";
    showConnectedRoom();
    startRoomSync();
  } catch (error) {
    console.error(error);
    alert(error instanceof Error ? error.message : "Не удалось открыть Playroom.");
  } finally {
    roomButtons.forEach((button) => { button.disabled = false; });
    trigger.textContent = originalLabel;
  }
}

function showConnectedRoom() {
  elements.partyPanel.hidden = false;
  elements.partyCode.textContent = `Код: ${client.roomCode}`;
  elements.findPublic.hidden = true;
  elements.createPrivate.hidden = true;
  elements.launchForRoom.hidden = false;
  renderParty();
}

function startRoomSync() {
  clearInterval(syncTimer);
  syncRoom();
  syncTimer = setInterval(syncRoom, 120);
}

function syncRoom() {
  if (!client) return;
  renderParty();
  const room = client.getRoomState();

  if (room?.screen === "game" && room.activeGame === "tic-tac-toe") {
    mode = "room";
    setupRoomLabels();
    openDialog();
    const game = client.getGameState();
    if (isGameState(game)) renderGame(game, client.playerCount, client.mark);
  } else if (elements.dialog.open && mode === "room") {
    elements.dialog.close();
  }
}

function renderParty() {
  if (!client) return;
  elements.partyPlayers.textContent = `Игроков: ${Math.min(client.playerCount, 2)} / 2`;
}

function setupRoomLabels() {
  elements.role.textContent = client.isHost ? "Ты играешь за ×" : "Ты играешь за ○";
  elements.players.textContent = `Игроков: ${Math.min(client.playerCount, 2)} / 2`;
  elements.nameX.textContent = "Хозяин комнаты";
  elements.nameO.textContent = "Второй игрок";
  elements.newRound.hidden = !client.isHost;
  elements.hint.textContent = "Закрытие игры вернёт всю комнату в каталог.";
}

function launchForRoom() {
  const previous = client.getGameState();
  lastRevision = -1;
  client.setGameState(createGame(isGameState(previous) ? previous : null));
  client.setRoomState({
    screen: "game",
    activeGame: "tic-tac-toe",
    startedAt: Date.now(),
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
  elements.status.textContent = "Компьютер думает…";

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
  elements.cards.forEach((card) => {
    card.classList.toggle("is-turn", !game.winner && card.dataset.player === game.turn);
  });

  if (playerCount < 2) elements.status.textContent = "Ждём второго игрока…";
  else if (game.winner === "draw") elements.status.textContent = "Ничья!";
  else if (game.winner) elements.status.textContent = game.winner === myMark ? "Ты победил!" : "Победил соперник";
  else elements.status.textContent = game.turn === myMark ? "Твой ход" : "Ход соперника";
}

function closeGame() {
  clearTimeout(computerTimer);
  if (mode === "room" && client) {
    client.setRoomState({ screen: "catalog", activeGame: null, returnedAt: Date.now() });
  } else {
    elements.dialog.close();
    mode = "catalog";
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

elements.playSolo.addEventListener("click", openSoloGame);
elements.findPublic.addEventListener("click", () => connectRoom(true, elements.findPublic));
elements.createPrivate.addEventListener("click", () => connectRoom(false, elements.createPrivate));
elements.launchForRoom.addEventListener("click", launchForRoom);
elements.close.addEventListener("click", closeGame);
elements.newRound.addEventListener("click", startNewRound);

buildBoard();
