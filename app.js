const gameDialog = document.querySelector("#game-dialog");
const sessionDialog = document.querySelector("#session-dialog");
const profileDialog = document.querySelector("#profile-dialog");
const sessionOptions = document.querySelector("#session-options");
const roomWaiting = document.querySelector("#room-waiting");
const sessionError = document.querySelector("#session-error");
const connectionStatus = document.querySelector("#connection-status");
const roomCodeInput = document.querySelector("#room-code");
const createdRoomCode = document.querySelector("#created-room-code");
const publicRoomList = document.querySelector("#public-room-list");
const joinRequest = document.querySelector("#join-request");
const requesterName = document.querySelector("#requester-name");
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
const nextRoundButton = document.querySelector("#next-round");
const resetScoreButton = document.querySelector("#reset-score");
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
let socket = null;
let socketPromise = null;
let activeRoomCode = "";
let pendingRequestId = "";

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

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function ensureSocket() {
  if (socket?.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }
  if (socketPromise) return socketPromise;

  connectionStatus.textContent = "Подключаемся к серверу Render…";
  const url = window.GENBLOX_CONFIG?.websocketUrl;

  socketPromise = new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error("WebSocket URL is not configured"));
      return;
    }

    socket = new WebSocket(url);

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Connection timeout"));
    }, 75_000);

    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      send({ type: "hello", nickname });
      connectionStatus.textContent = "Сервер подключён";
      resolve();
    }, { once: true });

    socket.addEventListener("message", handleServerMessage);

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Connection failed"));
    }, { once: true });

    socket.addEventListener("close", () => {
      socket = null;
      socketPromise = null;
      if (gameMode !== "local") {
        statusLabel.textContent = "Связь с сервером потеряна";
        gameHint.textContent = "Обнови страницу или попробуй подключиться снова";
      }
    });
  }).catch((error) => {
    socketPromise = null;
    setSessionError(
      "Сервер не ответил. На бесплатном Render первый запуск может занять около минуты.",
    );
    throw error;
  });

  return socketPromise;
}

function renderPublicRooms(rooms) {
  publicRoomList.replaceChildren();

  if (!rooms.length) {
    const empty = document.createElement("p");
    empty.textContent = "Открытых комнат пока нет";
    publicRoomList.append(empty);
    return;
  }

  rooms.forEach((room) => {
    const item = document.createElement("div");
    item.className = "public-room";

    const info = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    title.textContent = `${room.hostName || "guest"} · ${room.code}`;
    meta.textContent = "1/2 игроков · ожидает";
    info.append(title, meta);

    const joinButton = document.createElement("button");
    joinButton.type = "button";
    joinButton.textContent = "Запрос";
    joinButton.addEventListener("click", () => requestJoin(room.code));

    item.append(info, joinButton);
    publicRoomList.append(item);
  });
}

function handleServerMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  if (message.type === "rooms") {
    renderPublicRooms(message.rooms || []);
    return;
  }

  if (message.type === "room_created") {
    activeRoomCode = message.code;
    gameMode = "host";
    createdRoomCode.textContent = message.code;
    sessionOptions.hidden = true;
    roomWaiting.hidden = false;
    joinRequest.hidden = true;
    connectionStatus.textContent = message.visibility === "public"
      ? "Комната опубликована. Ждём запрос игрока…"
      : "Приватная комната готова. Передай код другу.";
    return;
  }

  if (message.type === "join_pending") {
    activeRoomCode = message.code;
    createdRoomCode.textContent = message.code;
    sessionOptions.hidden = true;
    roomWaiting.hidden = false;
    connectionStatus.textContent = "Запрос отправлен. Ждём ответа владельца…";
    return;
  }

  if (message.type === "join_request") {
    pendingRequestId = message.requestId;
    requesterName.textContent = message.nickname || "guest";
    joinRequest.hidden = false;
    connectionStatus.textContent = "Получен запрос на вход";
    showDialog(sessionDialog);
    return;
  }

  if (message.type === "join_approved") {
    gameMode = message.role;
    activeRoomCode = message.code;
    joinRequest.hidden = true;
    nextRoundButton.disabled = gameMode === "guest";
    resetScoreButton.disabled = gameMode === "guest";
    connectionStatus.textContent = "Игрок подключён";
    return;
  }

  if (message.type === "join_denied") {
    setSessionError(message.message || "Запрос отклонён.");
    sessionOptions.hidden = false;
    roomWaiting.hidden = true;
    return;
  }

  if (message.type === "state") {
    board = message.board;
    currentPlayer = message.currentPlayer;
    round = message.round;
    scores = message.scores;
    roundFinished = message.roundFinished;
    winningLine = message.winningLine;
    playerNameX.textContent = message.hostName || "Хост";
    playerNameO.textContent = message.guestName || "Гость";
    gameHint.textContent = gameMode === "host"
      ? `Ты играешь крестиками · комната ${activeRoomCode}`
      : `Ты играешь ноликами · комната ${activeRoomCode}`;
    renderGame();
    closeDialog(sessionDialog);
    showDialog(gameDialog);
    return;
  }

  if (message.type === "guest_left") {
    gameHint.textContent = "Второй игрок вышел. Комната снова ожидает.";
    statusLabel.textContent = "Игрок отключился";
    return;
  }

  if (message.type === "room_closed") {
    closeDialog(gameDialog);
    setSessionError(message.message || "Комната закрыта.");
    sessionOptions.hidden = false;
    roomWaiting.hidden = true;
    showDialog(sessionDialog);
    return;
  }

  if (message.type === "error") {
    setSessionError(message.message || "Ошибка сервера.");
    sessionOptions.hidden = false;
    roomWaiting.hidden = true;
  }
}

async function openSessionMenu() {
  setSessionError();
  sessionOptions.hidden = false;
  roomWaiting.hidden = true;
  joinRequest.hidden = true;
  roomCodeInput.value = "";
  showDialog(sessionDialog);

  try {
    await ensureSocket();
    send({ type: "list_rooms" });
  } catch {
    renderPublicRooms([]);
  }
}

async function createRoom(visibility) {
  setSessionError();
  sessionOptions.hidden = true;
  roomWaiting.hidden = false;
  createdRoomCode.textContent = "------";

  try {
    await ensureSocket();
    send({ type: "create_room", visibility });
  } catch {
    sessionOptions.hidden = false;
    roomWaiting.hidden = true;
  }
}

async function requestJoin(roomCode) {
  const code = String(roomCode || "").trim().toUpperCase();
  if (code.length !== 6) {
    setSessionError("Введи шестизначный код комнаты.");
    return;
  }

  setSessionError();
  sessionOptions.hidden = true;
  roomWaiting.hidden = false;
  createdRoomCode.textContent = code;

  try {
    await ensureSocket();
    send({ type: "request_join", code });
  } catch {
    sessionOptions.hidden = false;
    roomWaiting.hidden = true;
  }
}

function startLocalGame() {
  if (gameMode !== "local" && activeRoomCode) {
    send({ type: "leave_room" });
  }
  gameMode = "local";
  activeRoomCode = "";
  nextRoundButton.disabled = false;
  resetScoreButton.disabled = false;
  playerNameX.textContent = nickname;
  playerNameO.textContent = "Игрок 2";
  gameHint.textContent = "Сейчас играют двое за одним устройством";
  resetScore(false);
  closeDialog(sessionDialog);
  showDialog(gameDialog);
}

function findWinningLine() {
  return winningLines.find(([a, b, c]) => (
    board[a] && board[a] === board[b] && board[a] === board[c]
  )) || null;
}

function applyLocalMove(index) {
  if (roundFinished || board[index]) return;
  board[index] = currentPlayer;
  winningLine = findWinningLine();

  if (winningLine || board.every(Boolean)) {
    roundFinished = true;
    if (winningLine) scores[currentPlayer] += 1;
  } else {
    currentPlayer = currentPlayer === "X" ? "O" : "X";
  }
  renderGame();
}

function playCell(event) {
  const index = Number(event.currentTarget.dataset.cell);
  if (gameMode === "local") {
    applyLocalMove(index);
  } else {
    send({ type: "move", index });
  }
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

function startRound(incrementRound = true) {
  if (gameMode !== "local") {
    if (gameMode === "host") send({ type: "new_round" });
    return;
  }
  if (incrementRound) round += 1;
  board = Array(9).fill("");
  roundFinished = false;
  winningLine = null;
  currentPlayer = round % 2 === 1 ? "X" : "O";
  renderGame();
}

function resetScore(render = true) {
  if (gameMode !== "local") {
    if (gameMode === "host") send({ type: "reset_score" });
    return;
  }
  scores = { X: 0, O: 0 };
  round = 1;
  startRound(false);
  if (render) renderGame();
}

document.querySelectorAll("#open-space, #join-space").forEach((button) => {
  button.addEventListener("click", openSessionMenu);
});

document.querySelector("#create-public-room").addEventListener(
  "click",
  () => createRoom("public"),
);
document.querySelector("#create-room").addEventListener(
  "click",
  () => createRoom("private"),
);
document.querySelector("#connect-room").addEventListener(
  "click",
  () => requestJoin(roomCodeInput.value),
);
document.querySelector("#refresh-rooms").addEventListener("click", async () => {
  try {
    await ensureSocket();
    send({ type: "list_rooms" });
  } catch {
    renderPublicRooms([]);
  }
});
document.querySelector("#local-game").addEventListener("click", startLocalGame);

document.querySelector("#approve-join").addEventListener("click", () => {
  send({ type: "resolve_join", requestId: pendingRequestId, approved: true });
  joinRequest.hidden = true;
});
document.querySelector("#deny-join").addEventListener("click", () => {
  send({ type: "resolve_join", requestId: pendingRequestId, approved: false });
  joinRequest.hidden = true;
  connectionStatus.textContent = "Запрос отклонён. Ждём другого игрока…";
});

document.querySelector("#cancel-room").addEventListener("click", () => {
  send({ type: "leave_room" });
  activeRoomCode = "";
  gameMode = "local";
  sessionOptions.hidden = false;
  roomWaiting.hidden = true;
  joinRequest.hidden = true;
  setSessionError();
  send({ type: "list_rooms" });
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
  send({ type: "hello", nickname });
  closeDialog(profileDialog);
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    closeDialog(document.querySelector(`#${button.dataset.close}`));
  });
});

document.querySelector("#close-game").addEventListener(
  "click",
  () => closeDialog(gameDialog),
);
nextRoundButton.addEventListener("click", () => startRound(true));
resetScoreButton.addEventListener("click", () => resetScore());
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
  if (event.key === "Enter") requestJoin(roomCodeInput.value);
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

window.addEventListener("beforeunload", () => {
  send({ type: "leave_room" });
});

renderGame();
