import WebSocket from "ws";

const url = process.env.WORKER_WS_URL || "ws://127.0.0.1:8791/ws";

function createClient(nickname) {
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];

  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const waiterIndex = waiters.findIndex((waiter) => waiter.type === message.type);
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      waiter.resolve(message);
    } else {
      queue.push(message);
    }
  });

  function waitFor(type) {
    const queuedIndex = queue.findIndex((message) => message.type === type);
    if (queuedIndex >= 0) {
      return Promise.resolve(queue.splice(queuedIndex, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timeout waiting for ${type}`)),
        5000,
      );
      waiters.push({
        type,
        resolve(message) {
          clearTimeout(timeout);
          resolve(message);
        },
      });
    });
  }

  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.once("open", async () => {
      socket.send(JSON.stringify({ type: "hello", nickname }));
      await waitFor("ready");
      resolve({ socket, waitFor });
    });
  });
}

function send(client, message) {
  client.socket.send(JSON.stringify(message));
}

const host = await createClient("Host");
const guest = await createClient("Guest");
await guest.waitFor("rooms");

send(host, { type: "create_room", visibility: "public" });
const created = await host.waitFor("room_created");

send(guest, { type: "list_rooms" });
let listing = await guest.waitFor("rooms");
if (!listing.rooms.some((room) => room.code === created.code)) {
  listing = await guest.waitFor("rooms");
}
if (!listing.rooms.some((room) => room.code === created.code)) {
  throw new Error("Public room is missing from the listing");
}

send(guest, { type: "request_join", code: created.code });
const request = await host.waitFor("join_request");
await guest.waitFor("join_pending");

send(host, {
  type: "resolve_join",
  requestId: request.requestId,
  approved: true,
});
await host.waitFor("join_approved");
await guest.waitFor("join_approved");
await host.waitFor("state");
await guest.waitFor("state");

send(host, { type: "move", index: 0 });
const hostState = await host.waitFor("state");
const guestState = await guest.waitFor("state");
if (hostState.board[0] !== "X" || guestState.board[0] !== "X") {
  throw new Error("Move was not synchronized");
}

host.socket.close();
guest.socket.close();
console.log("Cloudflare Worker integration test passed");
