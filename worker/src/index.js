import { DurableObject } from "cloudflare:workers";

const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

function generateCode(existingCodes) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from(
      { length: 6 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
  } while (existingCodes.has(code));
  return code;
}

export class GameLobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rooms = new Map();
    this.pendingRequests = new Map();
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const storedRooms = await ctx.storage.get("rooms");
      const storedRequests = await ctx.storage.get("pendingRequests");
      this.rooms = new Map(storedRooms || []);
      this.pendingRequests = new Map(storedRequests || []);
      await this.removeOrphanedState();
    });
  }

  async fetch(request) {
    await this.ready;

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({
        name: "GenBlox Realtime",
        status: "online",
        rooms: this.rooms.size,
        clients: this.ctx.getWebSockets().length,
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const clientId = crypto.randomUUID();

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      clientId,
      nickname: "guest",
      roomCode: null,
      role: null,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, rawMessage) {
    await this.ready;
    let message;
    try {
      message = JSON.parse(String(rawMessage));
    } catch {
      this.send(socket, { type: "error", message: "Некорректное сообщение." });
      return;
    }

    try {
      await this.handleMessage(socket, message);
    } catch (error) {
      console.error("WebSocket message failed", error);
      this.send(socket, { type: "error", message: "Ошибка сервера комнаты." });
    }
  }

  async webSocketClose(socket) {
    await this.ready;
    await this.leaveCurrentRoom(socket);
    const attachment = this.attachment(socket);
    for (const [requestId, request] of this.pendingRequests) {
      if (request.clientId === attachment.clientId) {
        this.pendingRequests.delete(requestId);
      }
    }
    await this.persist();
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  attachment(socket) {
    return socket.deserializeAttachment() || {
      clientId: crypto.randomUUID(),
      nickname: "guest",
      roomCode: null,
      role: null,
    };
  }

  setAttachment(socket, patch) {
    const attachment = { ...this.attachment(socket), ...patch };
    socket.serializeAttachment(attachment);
    return attachment;
  }

  socketByClientId(clientId) {
    return this.ctx.getWebSockets().find(
      (socket) => this.attachment(socket).clientId === clientId,
    );
  }

  send(socket, message) {
    try {
      socket?.send(JSON.stringify(message));
    } catch {
      // The close handler performs room cleanup.
    }
  }

  publicRooms() {
    return [...this.rooms.values()]
      .filter((room) => room.visibility === "public" && !room.guestId)
      .map((room) => ({
        code: room.code,
        hostName: room.hostName,
        players: 1,
      }));
  }

  broadcastRooms() {
    const message = { type: "rooms", rooms: this.publicRooms() };
    this.ctx.getWebSockets().forEach((socket) => this.send(socket, message));
  }

  roomState(room) {
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

  broadcastState(room) {
    const state = this.roomState(room);
    this.send(this.socketByClientId(room.hostId), state);
    this.send(this.socketByClientId(room.guestId), state);
  }

  async persist() {
    await this.ctx.storage.put({
      rooms: [...this.rooms.entries()],
      pendingRequests: [...this.pendingRequests.entries()],
    });
  }

  async removeOrphanedState() {
    const connectedIds = new Set(
      this.ctx.getWebSockets().map(
        (socket) => this.attachment(socket).clientId,
      ),
    );

    for (const [code, room] of this.rooms) {
      if (!connectedIds.has(room.hostId)) {
        this.rooms.delete(code);
      } else if (room.guestId && !connectedIds.has(room.guestId)) {
        room.guestId = null;
        room.guestName = "";
      }
    }

    for (const [requestId, request] of this.pendingRequests) {
      if (
        !connectedIds.has(request.clientId) ||
        !this.rooms.has(request.roomCode)
      ) {
        this.pendingRequests.delete(requestId);
      }
    }
    await this.persist();
  }

  async resetRound(room, increment = true) {
    if (increment) room.round += 1;
    room.board = Array(9).fill("");
    room.roundFinished = false;
    room.winningLine = null;
    room.currentPlayer = room.round % 2 === 1 ? "X" : "O";
    await this.persist();
    this.broadcastState(room);
  }

  async removeRoom(code, reason = "Хост закрыл комнату") {
    const room = this.rooms.get(code);
    if (!room) return;

    this.send(this.socketByClientId(room.guestId), {
      type: "room_closed",
      message: reason,
    });

    for (const [requestId, request] of this.pendingRequests) {
      if (request.roomCode === code) {
        this.send(this.socketByClientId(request.clientId), {
          type: "join_denied",
          message: "Комната закрыта.",
        });
        this.pendingRequests.delete(requestId);
      }
    }

    this.rooms.delete(code);
    await this.persist();
    this.broadcastRooms();
  }

  async leaveCurrentRoom(socket) {
    const client = this.attachment(socket);
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);

    this.setAttachment(socket, { roomCode: null, role: null });
    if (!room) return;

    if (client.role === "host") {
      await this.removeRoom(client.roomCode);
    } else if (client.role === "guest") {
      room.guestId = null;
      room.guestName = "";
      this.send(this.socketByClientId(room.hostId), { type: "guest_left" });
      await this.resetRound(room, false);
      this.broadcastRooms();
    }
  }

  async handleMessage(socket, message) {
    let client = this.attachment(socket);

    if (message.type === "hello") {
      client = this.setAttachment(socket, {
        nickname: String(message.nickname || "guest").slice(0, 16),
      });
      this.send(socket, { type: "ready", clientId: client.clientId });
      this.send(socket, { type: "rooms", rooms: this.publicRooms() });
      return;
    }

    if (message.type === "list_rooms") {
      this.send(socket, { type: "rooms", rooms: this.publicRooms() });
      return;
    }

    if (message.type === "create_room") {
      await this.leaveCurrentRoom(socket);
      client = this.attachment(socket);
      const code = generateCode(this.rooms);
      const room = {
        code,
        visibility: message.visibility === "public" ? "public" : "private",
        hostId: client.clientId,
        hostName: client.nickname,
        guestId: null,
        guestName: "",
        board: Array(9).fill(""),
        currentPlayer: "X",
        round: 1,
        scores: { X: 0, O: 0 },
        roundFinished: false,
        winningLine: null,
      };
      this.rooms.set(code, room);
      this.setAttachment(socket, { roomCode: code, role: "host" });
      await this.persist();
      this.send(socket, {
        type: "room_created",
        code,
        visibility: room.visibility,
      });
      this.broadcastRooms();
      return;
    }

    if (message.type === "request_join") {
      const code = String(message.code || "").toUpperCase();
      const room = this.rooms.get(code);
      if (!room) {
        this.send(socket, { type: "error", message: "Комната не найдена." });
        return;
      }
      if (room.guestId) {
        this.send(socket, { type: "error", message: "Комната уже заполнена." });
        return;
      }

      const requestId = crypto.randomUUID();
      this.pendingRequests.set(requestId, {
        roomCode: code,
        clientId: client.clientId,
        nickname: client.nickname,
      });
      await this.persist();
      this.send(this.socketByClientId(room.hostId), {
        type: "join_request",
        requestId,
        nickname: client.nickname,
      });
      this.send(socket, { type: "join_pending", code });
      return;
    }

    if (message.type === "resolve_join") {
      const request = this.pendingRequests.get(message.requestId);
      const room = request && this.rooms.get(request.roomCode);
      if (!request || !room || room.hostId !== client.clientId) return;
      this.pendingRequests.delete(message.requestId);

      const guestSocket = this.socketByClientId(request.clientId);
      if (!message.approved) {
        this.send(guestSocket, {
          type: "join_denied",
          message: "Владелец комнаты отклонил запрос.",
        });
        await this.persist();
        return;
      }
      if (!guestSocket || room.guestId) {
        this.send(guestSocket, {
          type: "join_denied",
          message: "Комната уже заполнена.",
        });
        await this.persist();
        return;
      }

      room.guestId = request.clientId;
      room.guestName = request.nickname;
      this.setAttachment(guestSocket, {
        roomCode: room.code,
        role: "guest",
      });
      await this.persist();
      this.send(socket, {
        type: "join_approved",
        role: "host",
        code: room.code,
      });
      this.send(guestSocket, {
        type: "join_approved",
        role: "guest",
        code: room.code,
      });
      this.broadcastState(room);
      this.broadcastRooms();
      return;
    }

    const room = client.roomCode && this.rooms.get(client.roomCode);
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
      await this.persist();
      this.broadcastState(room);
      return;
    }

    if (message.type === "new_round" && client.role === "host") {
      await this.resetRound(room, true);
      return;
    }

    if (message.type === "reset_score" && client.role === "host") {
      room.scores = { X: 0, O: 0 };
      room.round = 1;
      await this.resetRound(room, false);
      return;
    }

    if (message.type === "leave_room") {
      await this.leaveCurrentRoom(socket);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (url.pathname === "/health") {
      const lobby = env.LOBBY.getByName("global");
      return lobby.fetch(new Request("https://lobby.internal/health"));
    }

    if (url.pathname !== "/ws") {
      return json({
        name: "GenBlox Realtime Worker",
        status: "online",
        websocket: "/ws",
      });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "WebSocket upgrade required" }, 426);
    }

    const lobby = env.LOBBY.getByName("global");
    return lobby.fetch(request);
  },
};
