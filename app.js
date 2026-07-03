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
const sessionGameKicker = document.querySelector("#session-game-kicker");
const gameSpaceNumber = document.querySelector("#game-space-number");
const gameTitle = document.querySelector("#game-title");
let cells = [];
const playerCards = [...document.querySelectorAll("[data-player]")];

const games = {
  classic: {
    id: "classic",
    title: "Крестики-нолики",
    space: "Спейс 001",
    size: 3,
    winLength: 3,
  },
  five: {
    id: "five",
    title: "5 в ряд",
    space: "Спейс 002",
    size: 10,
    winLength: 5,
  },
};

let nickname = localStorage.getItem("genblox:nickname") || "guest";
let clientId = sessionStorage.getItem("genblox:client-id");
if (!clientId) {
  clientId = crypto.randomUUID();
  sessionStorage.setItem("genblox:client-id", clientId);
}

let board = Array(9).fill("");
let currentPlayer = "X";
let round = 1;
let scores = { X: 0, O: 0 };
let roundFinished = false;
let winningLine = null;
let gameMode = "local";
let activeRoomCode = "";
let roomVisibility = "private";
let guestId = "";
let guestName = "";
let hostName = "";
let pendingJoin = null;
let pendingRequestId = "";
let roomStarted = false;
let activeGameId = "classic";
let supabaseClient = null;
let lobbyChannel = null;
let roomChannel = null;
let lobbyPromise = null;

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

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const url = window.GENBLOX_CONFIG?.supabaseUrl;
  const key = window.GENBLOX_CONFIG?.supabaseKey;
  const missingConfig = !url || !key || url.startsWith("YOUR_") || key.startsWith("YOUR_");

  if (missingConfig) {
    throw new Error("SUPABASE_CONFIG_MISSING");
  }
  if (!window.supabase?.createClient) {
    throw new Error("SUPABASE_LIBRARY_MISSING");
  }

  supabaseClient = window.supabase.createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
  return supabaseClient;
}

function lobbyPresence() {
  return {
    clientId,
    nickname,
    kind: gameMode === "host" && activeRoomCode ? "room" : "visitor",
    roomCode: activeRoomCode || null,
    visibility: roomVisibility,
    waiting: gameMode === "host" && !guestId,
    gameId: activeGameId,
    gameTitle: games[activeGameId].title,
    updatedAt: new Date().toISOString(),
  };
}

async function updateLobbyPresence() {
  if (lobbyChannel) {
    await lobbyChannel.track(lobbyPresence());
  }
}

function renderPublicRoomsFromPresence() {
  if (!lobbyChannel) return;
  const rooms = Object.values(lobbyChannel.presenceState())
    .flat()
    .filter((presence) => (
      presence.kind === "room" &&
      presence.visibility === "public" &&
      presence.waiting &&
      presence.clientId !== clientId
    ))
    .filter((room, index, list) => (
      list.findIndex((item) => item.roomCode === room.roomCode) === index
    ));

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
    title.textContent = `${room.gameTitle || "Спейс"} · ${room.nickname || "guest"}`;
    meta.textContent = `${room.roomCode} · 1/2 игроков`;
    info.append(title, meta);

    const joinButton = document.createElement("button");
    joinButton.type = "button";
    joinButton.textContent = "Запрос";
    joinButton.addEventListener(
      "click",
      () => requestJoin(room.roomCode, room.gameId),
    );

    item.append(info, joinButton);
    publicRoomList.append(item);
  });
}

function ensureLobby() {
  if (lobbyChannel) return Promise.resolve();
  if (lobbyPromise) return lobbyPromise;

  lobbyPromise = new Promise((resolve, reject) => {
    let client;
    try {
      client = getSupabaseClient();
    } catch (error) {
      reject(error);
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error("LOBBY_TIMEOUT"));
    }, 15_000);

    lobbyChannel = client.channel("genblox:lobby:v1", {
      config: {
        presence: { key: clientId },
      },
    });

    lobbyChannel
      .on("presence", { event: "sync" }, renderPublicRoomsFromPresence)
      .subscribe(async (status, error) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          await updateLobbyPresence();
          renderPublicRoomsFromPresence();
          connectionStatus.textContent = "Supabase Realtime подключён";
          resolve();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          console.error("Supabase lobby error", status, error);
          lobbyChannel = null;
          lobbyPromise = null;
          reject(error || new Error(status));
        }
      });
  });

  return lobbyPromise;
}

function sendRoomEvent(event, payload) {
  if (!roomChannel) return Promise.resolve("no-channel");
  return roomChannel.send({
    type: "broadcast",
    event,
    payload,
  });
}

async function leaveRoom({ notify = true } = {}) {
  if (!roomChannel) return;

  if (notify && gameMode === "host") {
    await sendRoomEvent("host_closed", { hostId: clientId });
  } else if (notify && gameMode === "guest") {
    await sendRoomEvent("guest_left", { guestId: clientId });
  }

  const channel = roomChannel;
  roomChannel = null;
  await channel.untrack();
  await getSupabaseClient().removeChannel(channel);

  activeRoomCode = "";
  guestId = "";
  guestName = "";
  hostName = "";
  roomStarted = false;
  pendingJoin = null;
  pendingRequestId = "";
}

async function subscribeToRoom(code, role) {
  await leaveRoom();
  const client = getSupabaseClient();
  activeRoomCode = code;
  roomStarted = false;

  roomChannel = client.channel(`genblox:room:${code}`, {
    config: {
      broadcast: { ack: true, self: false },
      presence: { key: clientId },
    },
  });

  roomChannel
    .on("broadcast", { event: "join_request" }, ({ payload }) => {
      if (
        gameMode !== "host" ||
        guestId ||
        !payload?.requestId ||
        payload.clientId === clientId
      ) return;
      pendingJoin = payload;
      pendingRequestId = payload.requestId;
      requesterName.textContent = payload.nickname || "guest";
      joinRequest.hidden = false;
      connectionStatus.textContent = "Получен запрос на вход";
      showDialog(sessionDialog);
    })
    .on("broadcast", { event: "join_response" }, ({ payload }) => {
      if (
        role !== "guest" ||
        payload?.targetClientId !== clientId ||
        payload?.requestId !== pendingRequestId
      ) return;

      if (!payload.approved) {
        setSessionError("Владелец комнаты отклонил запрос.");
        sessionOptions.hidden = false;
        roomWaiting.hidden = true;
        void leaveRoom({ notify: false });
        return;
      }

      gameMode = "guest";
      configureGame(payload.gameId || activeGameId);
      hostName = payload.hostName || "Хост";
      roomStarted = true;
      nextRoundButton.disabled = true;
      resetScoreButton.disabled = true;
      connectionStatus.textContent = "Подключено. Загружаем матч…";
    })
    .on("broadcast", { event: "move" }, ({ payload }) => {
      if (
        gameMode === "host" &&
        payload?.clientId === guestId &&
        currentPlayer === "O"
      ) {
        applyHostMove(Number(payload.index), "O");
      }
    })
    .on("broadcast", { event: "command" }, ({ payload }) => {
      if (gameMode !== "host" || payload?.clientId !== guestId) return;
      if (payload.command === "leave") handleGuestLeft();
    })
    .on("broadcast", { event: "state" }, ({ payload }) => {
      if (gameMode !== "guest" || payload?.guestId !== clientId) return;
      hydrateState(payload);
      closeDialog(sessionDialog);
      showDialog(gameDialog);
    })
    .on("broadcast", { event: "host_closed" }, ({ payload }) => {
      if (gameMode === "guest" && payload?.hostId !== clientId) {
        handleHostClosed();
      }
    })
    .on("broadcast", { event: "guest_left" }, ({ payload }) => {
      if (gameMode === "host" && payload?.guestId === guestId) {
        handleGuestLeft();
      }
    })
    .subscribe(async (status, error) => {
      if (status === "SUBSCRIBED") {
        await roomChannel.track({
          clientId,
          nickname,
          role,
          joinedAt: new Date().toISOString(),
        });

        if (role === "guest") {
          await sendRoomEvent("join_request", {
            requestId: pendingRequestId,
            clientId,
            nickname,
          });
        }
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Supabase room error", status, error);
        setSessionError("Не удалось подключиться к каналу комнаты.");
        sessionOptions.hidden = false;
        roomWaiting.hidden = true;
      }
    });
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

function configureGame(gameId) {
  activeGameId = games[gameId] ? gameId : "classic";
  const game = games[activeGameId];
  sessionGameKicker.textContent = game.title;
  gameSpaceNumber.textContent = game.space;
  gameTitle.textContent = game.title;
  boardElement.setAttribute("aria-label", `Поле игры ${game.title}`);
  boardElement.style.setProperty("--board-size", game.size);
  boardElement.classList.toggle("is-large", game.size > 3);
  boardElement.replaceChildren();

  for (let index = 0; index < game.size * game.size; index += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.dataset.cell = String(index);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Клетка ${index + 1}`);
    cell.addEventListener("click", playCell);
    boardElement.append(cell);
  }
  cells = [...boardElement.querySelectorAll("[data-cell]")];
  board = Array(game.size * game.size).fill("");
  winningLine = null;
}

async function openSessionMenu(gameId = "classic") {
  configureGame(gameId);
  setSessionError();
  sessionOptions.hidden = false;
  roomWaiting.hidden = true;
  joinRequest.hidden = true;
  roomCodeInput.value = "";
  showDialog(sessionDialog);

  try {
    await ensureLobby();
    renderPublicRoomsFromPresence();
  } catch (error) {
    publicRoomList.replaceChildren();
    const empty = document.createElement("p");
    empty.textContent = "Realtime недоступен";
    publicRoomList.append(empty);
    setSessionError(
      error.message === "SUPABASE_CONFIG_MISSING"
        ? "Заполни supabaseUrl и supabaseKey в config.js."
        : "Не удалось подключиться к Supabase Realtime.",
    );
  }
}

async function createRoom(visibility) {
  setSessionError();
  try {
    await ensureLobby();
    gameMode = "host";
    roomVisibility = visibility;
    activeRoomCode = generateRoomCode();
    guestId = "";
    guestName = "";
    createdRoomCode.textContent = activeRoomCode;
    sessionOptions.hidden = true;
    roomWaiting.hidden = false;
    joinRequest.hidden = true;
    await subscribeToRoom(activeRoomCode, "host");
    await updateLobbyPresence();
    connectionStatus.textContent = visibility === "public"
      ? "Комната опубликована. Ждём запрос игрока…"
      : "Приватная комната готова. Передай код другу.";
  } catch (error) {
    console.error(error);
    gameMode = "local";
    sessionOptions.hidden = false;
    roomWaiting.hidden = true;
    setSessionError("Не удалось создать комнату.");
  }
}

async function requestJoin(roomCode, gameId = null) {
  const code = String(roomCode || "").trim().toUpperCase();
  if (code.length !== 6) {
    setSessionError("Введи шестизначный код комнаты.");
    return;
  }

  setSessionError();
  sessionOptions.hidden = true;
  roomWaiting.hidden = false;
  createdRoomCode.textContent = code;
  connectionStatus.textContent = "Отправляем запрос владельцу…";

  try {
    await ensureLobby();
    if (gameId && games[gameId]) configureGame(gameId);
    gameMode = "guest";
    activeRoomCode = code;
    pendingRequestId = crypto.randomUUID();
    await subscribeToRoom(code, "guest");

    setTimeout(() => {
      if (gameMode === "guest" && !roomStarted && activeRoomCode === code) {
        setSessionError("Комната не ответила. Проверь код или попроси хоста пересоздать её.");
        sessionOptions.hidden = false;
        roomWaiting.hidden = true;
        void leaveRoom({ notify: false });
      }
    }, 12_000);
  } catch (error) {
    console.error(error);
    sessionOptions.hidden = false;
    roomWaiting.hidden = true;
    setSessionError("Не удалось подключиться к комнате.");
  }
}

async function approveJoin() {
  if (!pendingJoin || gameMode !== "host") return;
  guestId = pendingJoin.clientId;
  guestName = pendingJoin.nickname || "guest";
  roomStarted = true;
  joinRequest.hidden = true;
  playerNameX.textContent = nickname;
  playerNameO.textContent = guestName;
  gameHint.textContent = `Ты играешь крестиками · комната ${activeRoomCode}`;
  nextRoundButton.disabled = false;
  resetScoreButton.disabled = false;
  resetHostGame();
  await updateLobbyPresence();
  await sendRoomEvent("join_response", {
    approved: true,
    requestId: pendingJoin.requestId,
    targetClientId: guestId,
    hostName: nickname,
    gameId: activeGameId,
  });
  await broadcastState();
  pendingJoin = null;
  closeDialog(sessionDialog);
  showDialog(gameDialog);
}

async function denyJoin() {
  if (!pendingJoin) return;
  await sendRoomEvent("join_response", {
    approved: false,
    requestId: pendingJoin.requestId,
    targetClientId: pendingJoin.clientId,
  });
  pendingJoin = null;
  joinRequest.hidden = true;
  connectionStatus.textContent = "Запрос отклонён. Ждём другого игрока…";
}

function statePayload() {
  return {
    gameId: activeGameId,
    board,
    currentPlayer,
    round,
    scores,
    roundFinished,
    winningLine,
    hostName: nickname,
    guestName,
    guestId,
  };
}

function broadcastState() {
  return sendRoomEvent("state", statePayload());
}

function hydrateState(state) {
  if (state.gameId && state.gameId !== activeGameId) {
    configureGame(state.gameId);
  }
  board = state.board;
  currentPlayer = state.currentPlayer;
  round = state.round;
  scores = state.scores;
  roundFinished = state.roundFinished;
  winningLine = state.winningLine;
  hostName = state.hostName || "Хост";
  guestName = state.guestName || nickname;
  playerNameX.textContent = hostName;
  playerNameO.textContent = nickname;
  gameHint.textContent = `Ты играешь ноликами · комната ${activeRoomCode}`;
  renderGame();
}

function findWinningLine() {
  const { size, winLength } = games[activeGameId];
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const mark = board[row * size + column];
      if (!mark) continue;

      for (const [deltaRow, deltaColumn] of directions) {
        const line = [];
        for (let step = 0; step < winLength; step += 1) {
          const nextRow = row + deltaRow * step;
          const nextColumn = column + deltaColumn * step;
          if (
            nextRow < 0 ||
            nextRow >= size ||
            nextColumn < 0 ||
            nextColumn >= size
          ) break;
          const index = nextRow * size + nextColumn;
          if (board[index] !== mark) break;
          line.push(index);
        }
        if (line.length === winLength) return line;
      }
    }
  }
  return null;
}

function finishMove(player) {
  winningLine = findWinningLine();
  if (winningLine || board.every(Boolean)) {
    roundFinished = true;
    if (winningLine) scores[player] += 1;
  } else {
    currentPlayer = player === "X" ? "O" : "X";
  }
  renderGame();
}

function applyHostMove(index, expectedPlayer) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= board.length ||
    roundFinished ||
    board[index] ||
    currentPlayer !== expectedPlayer
  ) return;

  board[index] = expectedPlayer;
  finishMove(expectedPlayer);
  void broadcastState();
}

function applyLocalMove(index) {
  if (roundFinished || board[index]) return;
  board[index] = currentPlayer;
  finishMove(currentPlayer);
}

function playCell(event) {
  const index = Number(event.currentTarget.dataset.cell);
  if (gameMode === "local") {
    applyLocalMove(index);
  } else if (gameMode === "host" && currentPlayer === "X") {
    applyHostMove(index, "X");
  } else if (gameMode === "guest" && currentPlayer === "O") {
    void sendRoomEvent("move", { clientId, index });
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
  if (gameMode === "guest") return;
  if (incrementRound) round += 1;
  board = Array(games[activeGameId].size ** 2).fill("");
  roundFinished = false;
  winningLine = null;
  currentPlayer = round % 2 === 1 ? "X" : "O";
  renderGame();
  if (gameMode === "host") void broadcastState();
}

function resetScore() {
  if (gameMode === "guest") return;
  scores = { X: 0, O: 0 };
  round = 1;
  startRound(false);
}

function resetHostGame() {
  scores = { X: 0, O: 0 };
  round = 1;
  board = Array(games[activeGameId].size ** 2).fill("");
  currentPlayer = "X";
  roundFinished = false;
  winningLine = null;
  renderGame();
}

function handleGuestLeft() {
  if (gameMode !== "host") return;
  guestId = "";
  guestName = "";
  roomStarted = false;
  statusLabel.textContent = "Игрок отключился";
  gameHint.textContent = "Комната снова ожидает второго игрока";
  void updateLobbyPresence();
}

function handleHostClosed() {
  if (gameMode !== "guest") return;
  closeDialog(gameDialog);
  setSessionError("Владелец закрыл комнату.");
  sessionOptions.hidden = false;
  roomWaiting.hidden = true;
  showDialog(sessionDialog);
  void leaveRoom({ notify: false });
  gameMode = "local";
}

async function startLocalGame() {
  if (gameMode !== "local") {
    await leaveRoom();
    gameMode = "local";
    await updateLobbyPresence();
  }
  nextRoundButton.disabled = false;
  resetScoreButton.disabled = false;
  playerNameX.textContent = nickname;
  playerNameO.textContent = "Игрок 2";
  gameHint.textContent = "Сейчас играют двое за одним устройством";
  resetScore();
  closeDialog(sessionDialog);
  showDialog(gameDialog);
}

document.querySelectorAll("[data-open-game]").forEach((button) => {
  button.addEventListener("click", () => openSessionMenu(button.dataset.openGame));
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
    await ensureLobby();
    renderPublicRoomsFromPresence();
  } catch {
    setSessionError("Realtime недоступен.");
  }
});
document.querySelector("#local-game").addEventListener("click", startLocalGame);
document.querySelector("#approve-join").addEventListener("click", approveJoin);
document.querySelector("#deny-join").addEventListener("click", denyJoin);

document.querySelector("#cancel-room").addEventListener("click", async () => {
  await leaveRoom();
  gameMode = "local";
  await updateLobbyPresence();
  sessionOptions.hidden = false;
  roomWaiting.hidden = true;
  joinRequest.hidden = true;
  setSessionError();
  renderPublicRoomsFromPresence();
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

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nextName = nicknameInput.value.trim().slice(0, 16);
  if (nextName.length < 2) return;
  nickname = nextName;
  localStorage.setItem("genblox:nickname", nickname);
  profileName.textContent = nickname;
  await updateLobbyPresence();
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
resetScoreButton.addEventListener("click", resetScore);

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
  const boardSize = games[activeGameId].size;
  let nextIndex = activeIndex;
  if (event.key === "ArrowRight") nextIndex = Math.min(activeIndex + 1, cells.length - 1);
  if (event.key === "ArrowLeft") nextIndex = Math.max(activeIndex - 1, 0);
  if (event.key === "ArrowDown") {
    nextIndex = Math.min(activeIndex + boardSize, cells.length - 1);
  }
  if (event.key === "ArrowUp") nextIndex = Math.max(activeIndex - boardSize, 0);
  if (nextIndex !== activeIndex) {
    event.preventDefault();
    cells[nextIndex].focus();
  }
});

window.addEventListener("beforeunload", () => {
  if (roomChannel) {
    if (gameMode === "host") {
      void sendRoomEvent("host_closed", { hostId: clientId });
    } else if (gameMode === "guest") {
      void sendRoomEvent("guest_left", { guestId: clientId });
    }
  }
});

configureGame("classic");
renderGame();
