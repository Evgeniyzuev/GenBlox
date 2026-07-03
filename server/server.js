import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const clients = new Map();
const pendingRequests = new Map();
const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from(
      { length: 6 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
  } while (rooms.has(code));
  return code;
}

function publicRooms() {
  return [...rooms.values()]
    .filter((room) => room.visibility === "public" && !room.guest)
    .map((room) => ({
      code: room.code,
      hostName: room.hostName,
      players: 1,
    }));
}

function broadcastRooms() {
  const message = { type: "rooms", rooms: publicRooms() };
  clients.forEach(({ socket }) => send(socket, message));
}

function roomState(room) {
  return {
    type: "state",
    board: room.board,
    currentPlayer: room.currentPlayer,
    round: room.round,
    scores: room.scores,
    roundFinished: room.roundFinished,
    winningLine: room.winningLine,
    hostName: room.hostName,
    guestName: room.guestName || "Друг",
  };
}

function broadcastState(room) {
  const state = roomState(room);
  send(room.host, state);
  send(room.guest, state);
}

function resetRound(room, increment = true) {
  if (increment) room.round += 1;
  room.board = Array(9).fill("");
  room.roundFinished = false;
  room.winningLine = null;
  room.currentPlayer = room.round % 2 === 1 ? "X" : "O";
  broadcastState(room);
}

function removeRoom(code, reason = "Хост закрыл комнату") {
  const room = rooms.get(code);
  if (!room) return;
  send(room.guest, { type: "room_closed", message: reason });
  pendingRequests.forEach((request, requestId) => {
    if (request.roomCode === code) {
      send(request.socket, { type: "join_denied", message: "Комната закрыта." });
      pendingRequests.delete(requestId);
    }
  });
  rooms.delete(code);
  broadcastRooms();
}

function leaveCurrentRoom(client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;

  if (client.role === "host") {
    removeRoom(client.roomCode);
  } else if (client.role === "guest") {
    room.guest = null;
    room.guestName = "";
    client.roomCode = null;
    client.role = null;
    send(room.host, { type: "guest_left" });
    resetRound(room, false);
    broadcastRooms();
  }
}

function handleMessage(client, message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "hello") {
    client.nickname = String(message.nickname || "guest").slice(0, 16);
    send(client.socket, { type: "ready", clientId: client.id });
    send(client.socket, { type: "rooms", rooms: publicRooms() });
    return;
  }

  if (message.type === "list_rooms") {
    send(client.socket, { type: "rooms", rooms: publicRooms() });
    return;
  }

  if (message.type === "create_room") {
    leaveCurrentRoom(client);
    const code = generateCode();
    const room = {
      code,
      visibility: message.visibility === "public" ? "public" : "private",
      host: client.socket,
      hostId: client.id,
      hostName: client.nickname,
      guest: null,
      guestName: "",
      board: Array(9).fill(""),
      currentPlayer: "X",
      round: 1,
      scores: { X: 0, O: 0 },
      roundFinished: false,
      winningLine: null,
    };
    rooms.set(code, room);
    client.roomCode = code;
    client.role = "host";
    send(client.socket, {
      type: "room_created",
      code,
      visibility: room.visibility,
    });
    broadcastRooms();
    return;
  }

  if (message.type === "request_join") {
    const code = String(message.code || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      send(client.socket, { type: "error", message: "Комната не найдена." });
      return;
    }
    if (room.guest) {
      send(client.socket, { type: "error", message: "Комната уже заполнена." });
      return;
    }
    const requestId = randomUUID();
    pendingRequests.set(requestId, {
      roomCode: code,
      socket: client.socket,
      clientId: client.id,
      nickname: client.nickname,
    });
    send(room.host, {
      type: "join_request",
      requestId,
      nickname: client.nickname,
    });
    send(client.socket, { type: "join_pending", code });
    return;
  }

  if (message.type === "resolve_join") {
    const request = pendingRequests.get(message.requestId);
    const room = request && rooms.get(request.roomCode);
    if (!request || !room || room.hostId !== client.id) return;
    pendingRequests.delete(message.requestId);

    if (!message.approved) {
      send(request.socket, {
        type: "join_denied",
        message: "Владелец комнаты отклонил запрос.",
      });
      return;
    }
    if (room.guest) {
      send(request.socket, { type: "join_denied", message: "Комната уже заполнена." });
      return;
    }

    const guestClient = clients.get(request.clientId);
    if (!guestClient) return;
    room.guest = request.socket;
    room.guestName = request.nickname;
    guestClient.roomCode = room.code;
    guestClient.role = "guest";
    send(room.host, { type: "join_approved", role: "host", code: room.code });
    send(room.guest, { type: "join_approved", role: "guest", code: room.code });
    broadcastState(room);
    broadcastRooms();
    return;
  }

  const room = client.roomCode && rooms.get(client.roomCode);
  if (!room) return;

  if (message.type === "move") {
    const expectedPlayer = client.role === "host" ? "X" : "O";
    const index = Number(message.index);
    if (
      room.roundFinished ||
      room.currentPlayer !== expectedPlayer ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 8 ||
      room.board[index]
    ) return;

    room.board[index] = expectedPlayer;
    room.winningLine = winningLines.find(([a, b, c]) => (
      room.board[a] &&
      room.board[a] === room.board[b] &&
      room.board[a] === room.board[c]
    )) || null;

    if (room.winningLine || room.board.every(Boolean)) {
      room.roundFinished = true;
      if (room.winningLine) room.scores[expectedPlayer] += 1;
    } else {
      room.currentPlayer = expectedPlayer === "X" ? "O" : "X";
    }
    broadcastState(room);
    return;
  }

  if (message.type === "new_round" && client.role === "host") {
    resetRound(room, true);
    return;
  }

  if (message.type === "reset_score" && client.role === "host") {
    room.scores = { X: 0, O: 0 };
    room.round = 1;
    resetRound(room, false);
    return;
  }

  if (message.type === "leave_room") {
    leaveCurrentRoom(client);
  }
}

const httpServer = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.url === "/health") {
    response.writeHead(200);
    response.end(JSON.stringify({
      status: "ok",
      rooms: rooms.size,
      clients: clients.size,
    }));
    return;
  }

  response.writeHead(200);
  response.end(JSON.stringify({
    name: "GenBlox Realtime",
    status: "online",
  }));
});

const websocketServer = new WebSocketServer({
  server: httpServer,
  maxPayload: 16 * 1024,
});

websocketServer.on("connection", (socket) => {
  const client = {
    id: randomUUID(),
    socket,
    nickname: "guest",
    roomCode: null,
    role: null,
  };
  clients.set(client.id, client);

  socket.on("message", (rawMessage) => {
    try {
      handleMessage(client, JSON.parse(rawMessage.toString()));
    } catch {
      send(socket, { type: "error", message: "Некорректное сообщение." });
    }
  });

  socket.on("close", () => {
    leaveCurrentRoom(client);
    clients.delete(client.id);
    pendingRequests.forEach((request, requestId) => {
      if (request.clientId === client.id) pendingRequests.delete(requestId);
    });
  });

  socket.on("error", () => {
    socket.close();
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`GenBlox Realtime listening on port ${port}`);
});
