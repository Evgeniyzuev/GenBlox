const gameDialog = document.querySelector("#game-dialog");
const sessionDialog = document.querySelector("#session-dialog");
const profileDialog = document.querySelector("#profile-dialog");
const sessionOptions = document.querySelector("#session-options");
const roomWaiting = document.querySelector("#room-waiting");
const sessionError = document.querySelector("#session-error");
const connectionStatus = document.querySelector("#connection-status");
const roomCodeInput = document.querySelector("#room-code");
const createdRoomCode = document.querySelector("#created-room-code");
const profileName = document.querySelector("#profile-name");
const nicknameInput = document.querySelector("#nickname");
const profileForm = document.querySelector("#profile-form");
const gameHint = document.querySelector("#game-hint");
const playerNameX = document.querySelector("#name-x");
const playerNameO = document.querySelector("#name-o");
const statusLabel = document.querySelector("#game-status");
const roundLabel = document.querySelector("#round-number");
const scoreXLabel = document.querySelector("#score-x");
const scoreOLabel = document.querySelector("#score-o");
const boardElement = document.querySelector("#game-board");
const cells = [...document.querySelectorAll("[data-cell]")];
const playerCards = [...document.querySelectorAll("[data-player]")];

const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

let nickname = localStorage.getItem("genblox:nickname") || "guest";
let board = Array(9).fill("");
let currentPlayer = "X";
let round = 1;
let scores = { X: 0, O: 0 };
let roundFinished = false;
let winningLine = null;
let gameMode = "local";
let peer = null;
let hostConnection = null;
let guestConnection = null;
let remoteNickname = "Друг";

profileName.textContent = nickname;

function showDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function setSessionError(message = "") {
  sessionError.textContent = message;
}

function openSessionMenu() {
  setSessionError();
  sessionOptions.hidden = false;
  roomWaiting.hidden = true;
  roomCodeInput.value = "";
  showDialog(sessionDialog);
}

function openGame() {
  closeDialog(sessionDialog);
  showDialog(gameDialog);
}

function destroyPeer() {
  if (peer && !peer.destroyed) peer.destroy();
  peer = null;
  hostConnection = null;
  guestConnection = null;
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => (
    alphabet[Math.floor(Math.random() * alphabet.length)]
  )).join("");
}

function roomPeerId(code) {
  return `genblox-${code.toLowerCase()}`;
}

function gameState() {
  return {
    type: "state",
    board,
    currentPlayer,
    round,
    scores,
    roundFinished,
    winningLine,
    hostName: nickname,
    guestName: remoteNickname,
  };
}

function broadcastState() {
  if (guestConnection?.open) guestConnection.send(gameState());
}

function configureConnection(connection, isHost) {
  connection.on("open", () => {
    if (isHost) {
      guestConnection = connection;
      remoteNickname = connection.metadata?.nickname || "guest";
      connectionStatus.textContent = `${remoteNickname} подключился — начинаем!`;
      playerNameX.textContent = nickname;
      playerNameO.textContent = remoteNickname;
      gameHint.textContent = "Ты играешь крестиками · комната подключена";
      resetScore(false);
      broadcastState();
      setTimeout(openGame, 500);
    } else {
      hostConnection = connection;
      remoteNickname = connection.metadata?.hostName || "Хост";
      connection.send({ type: "hello", nickname });
      gameHint.textContent = "Ты играешь ноликами · ход синхронизирован";
      connectionStatus.textContent = "Подключено!";
    }
  });

  connection.on("data", (data) => {
    if (!data || typeof data !== "object") return;

    if (isHost) {
      if (data.type === "hello") {
        remoteNickname = data.nickname || "guest";
        playerNameO.textContent = remoteNickname;
        broadcastState();
      }
      if (data.type === "move") applyMove(Number(data.index), "O");
      if (data.type === "new-round") startRound(true);
      if (data.type === "reset-score") resetScore();
    } else if (data.type === "state") {
      board = data.board;
      currentPlayer = data.currentPlayer;
      round = data.round;
      scores = data.scores;
      roundFinished = data.roundFinished;
      winningLine = data.winningLine;
      remoteNickname = data.hostName || "Хост";
      playerNameX.textContent = remoteNickname;
      playerNameO.textContent = nickname;
      renderGame();
      openGame();
    }
  });

  connection.on("close", () => {
    statusLabel.textContent = "Друг отключился";
    gameHint.textContent = "Соединение с комнатой потеряно";
  });

  connection.on("error", () => {
    setSessionError("Не удалось установить соединение.");
  });
}

function createRoom() {
  if (typeof Peer === "undefined") {
    setSessionError("Сервис подключения не загрузился. Проверь интернет.");
    return;
  }

  destroyPeer();
  setSessionError();
  const code = generateRoomCode();
  createdRoomCode.textContent = code;
  sessionOptions.hidden = true;
  roomWaiting.hidden = false;
  connectionStatus.textContent = "Создаём комнату…";
  gameMode = "host";

  peer = new Peer(roomPeerId(code));
  peer.on("open", () => {
    connectionStatus.textContent = "Ждём второго игрока…";
  });
  peer.on("connection", (connection) => configureConnection(connection, true));
  peer.on("error", (error) => {
    if (error.type === "unavailable-id") {
      createRoom();
      return;
    }
    setSessionError("Комната не создалась. Попробуй ещё раз.");
    sessionOptions.hidden = false;
    roomWaiting.hidden = true;
  });
}

function connectToRoom() {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length !== 6) {
    setSessionError("Введи шестизначный код комнаты.");
    return;
  }
  if (typeof Peer === "undefined") {
    setSessionError("Сервис подключения не загрузился. Проверь интернет.");
    return;
  }

  destroyPeer();
  setSessionError();
  connectionStatus.textContent = "Подключаемся…";
  sessionOptions.hidden = true;
  roomWaiting.hidden = false;
  createdRoomCode.textContent = code;
  gameMode = "guest";

  peer = new Peer();
  peer.on("open", () => {
    const connection = peer.connect(roomPeerId(code), {
      reliable: true,
      metadata: { nickname },
      serialization: "json",
    });
    configureConnection(connection, false);
  });
  peer.on("error", () => {
    setSessionError("Комната не найдена или уже закрыта.");
    sessionOptions.hidden = false;
    roomWaiting.hidden = true;
  });
}

function startLocalGame() {
  destroyPeer();
  gameMode = "local";
  playerNameX.textContent = nickname;
  playerNameO.textContent = "Игрок 2";
  gameHint.textContent = "Сейчас играют двое за одним устройством";
  resetScore(false);
  openGame();
}

function setTurn(player) {
  currentPlayer = player;
}

function findWinningLine() {
  return winningLines.find(([a, b, c]) => (
    board[a] && board[a] === board[b] && board[a] === board[c]
  )) || null;
}

function applyMove(index, expectedPlayer = currentPlayer) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > 8 ||
    roundFinished ||
    board[index] ||
    currentPlayer !== expectedPlayer
  ) return;

  board[index] = currentPlayer;
  winningLine = findWinningLine();

  if (winningLine || board.every(Boolean)) {
    roundFinished = true;
    if (winningLine) scores[currentPlayer] += 1;
  } else {
    setTurn(currentPlayer === "X" ? "O" : "X");
  }

  renderGame();
  if (gameMode === "host") broadcastState();
}

function playCell(event) {
  const index = Number(event.currentTarget.dataset.cell);

  if (gameMode === "guest") {
    if (currentPlayer === "O" && hostConnection?.open) {
      hostConnection.send({ type: "move", index });
    }
    return;
  }

  if (gameMode === "host" && currentPlayer !== "X") return;
  applyMove(index, currentPlayer);
}

function renderGame() {
  roundLabel.textContent = round;
  scoreXLabel.textContent = scores.X;
  scoreOLabel.textContent = scores.O;

  cells.forEach((cell, index) => {
    const mark = board[index];
    cell.textContent = mark === "X" ? "×" : mark === "O" ? "○" : "";
    cell.className = mark ? `mark-${mark.toLowerCase()}` : "";
    cell.classList.toggle("win", Boolean(winningLine?.includes(index)));
    cell.setAttribute("aria-label", `Клетка ${index + 1}${mark ? `: ${mark}` : ""}`);
  });

  playerCards.forEach((card) => {
    card.classList.toggle(
      "is-turn",
      !roundFinished && card.dataset.player === currentPlayer,
    );
  });

  if (roundFinished) {
    statusLabel.textContent = winningLine
      ? currentPlayer === "X" ? "Крестики победили!" : "Нолики победили!"
      : "Ничья — отличный раунд!";
  } else {
    statusLabel.textContent = currentPlayer === "X" ? "Ход крестиков" : "Ход ноликов";
  }
}

function startRound(incrementRound = true, sync = true) {
  if (gameMode === "guest") {
    if (sync && hostConnection?.open) hostConnection.send({ type: "new-round" });
    return;
  }
  if (incrementRound) round += 1;
  board = Array(9).fill("");
  roundFinished = false;
  winningLine = null;
  setTurn(round % 2 === 1 ? "X" : "O");
  renderGame();
  if (gameMode === "host" && sync) broadcastState();
}

function resetScore(sync = true) {
  if (gameMode === "guest") {
    if (sync && hostConnection?.open) hostConnection.send({ type: "reset-score" });
    return;
  }
  scores = { X: 0, O: 0 };
  round = 1;
  startRound(false, sync);
}

document.querySelectorAll("#open-space, #join-space").forEach((button) => {
  button.addEventListener("click", openSessionMenu);
});

document.querySelector("#create-room").addEventListener("click", createRoom);
document.querySelector("#connect-room").addEventListener("click", connectToRoom);
document.querySelector("#local-game").addEventListener("click", startLocalGame);
document.querySelector("#cancel-room").addEventListener("click", () => {
  destroyPeer();
  sessionOptions.hidden = false;
  roomWaiting.hidden = true;
  setSessionError();
});

document.querySelector("#copy-room-code").addEventListener("click", async () => {
  await navigator.clipboard.writeText(createdRoomCode.textContent);
  connectionStatus.textContent = "Код скопирован — отправь его другу";
});

document.querySelector("#profile-button").addEventListener("click", () => {
  nicknameInput.value = nickname;
  showDialog(profileDialog);
  nicknameInput.focus();
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextName = nicknameInput.value.trim().slice(0, 16);
  if (nextName.length < 2) return;
  nickname = nextName;
  localStorage.setItem("genblox:nickname", nickname);
  profileName.textContent = nickname;
  closeDialog(profileDialog);
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    closeDialog(document.querySelector(`#${button.dataset.close}`));
  });
});

document.querySelector("#close-game").addEventListener("click", () => closeDialog(gameDialog));
document.querySelector("#next-round").addEventListener("click", () => startRound(true));
document.querySelector("#reset-score").addEventListener("click", () => resetScore());
cells.forEach((cell) => cell.addEventListener("click", playCell));

[sessionDialog, profileDialog, gameDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });
});

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, 6);
});
roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connectToRoom();
});

boardElement.addEventListener("keydown", (event) => {
  const activeIndex = cells.indexOf(document.activeElement);
  if (activeIndex === -1) return;
  let nextIndex = activeIndex;
  if (event.key === "ArrowRight") nextIndex = Math.min(activeIndex + 1, 8);
  if (event.key === "ArrowLeft") nextIndex = Math.max(activeIndex - 1, 0);
  if (event.key === "ArrowDown") nextIndex = Math.min(activeIndex + 3, 8);
  if (event.key === "ArrowUp") nextIndex = Math.max(activeIndex - 3, 0);
  if (nextIndex !== activeIndex) {
    event.preventDefault();
    cells[nextIndex].focus();
  }
});

window.addEventListener("beforeunload", destroyPeer);
renderGame();
