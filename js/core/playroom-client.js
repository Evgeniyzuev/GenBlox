const ROOM_KEY = "genblox:room";
const GAME_KEY_PREFIX = "genblox:game:";

function createPlayerFallbackId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch { /* use a broadly supported fallback below */ }
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export class PlayroomClient {
  #api;
  #players = new Map();
  #started = false;
  #disconnectListeners = new Set();

  constructor(api = window.Playroom) {
    if (!api) throw new Error("PlayroomKit did not load. Check your internet connection.");
    this.#api = api;
  }

  async start({ matchmaking = false, roomCode = undefined } = {}) {
    if (this.#started) return;

    await this.#api.insertCoin({
      gameId: "genblox-tic-tac-toe",
      maxPlayersPerRoom: 4,
      matchmaking,
      roomCode,
      skipLobby: true,
    });

    this.#api.onPlayerJoin((player) => {
      const id = player.id ?? createPlayerFallbackId();
      this.#players.set(id, player);
      player.onQuit?.(() => this.#players.delete(id));
    });

    this.#api.onDisconnect?.((event) => {
      this.#disconnectListeners.forEach((listener) => listener(event));
    });

    this.#started = true;
  }

  get isHost() { return this.#api.isHost(); }
  get mark() { return this.playerIndex === 0 ? "X" : this.playerIndex === 1 ? "O" : null; }
  get maxPlayers() { return 4; }
  get playerCount() { return Math.max(1, this.#players.size); }
  get roomCode() { return this.#api.getRoomCode?.() ?? "—"; }
  get started() { return this.#started; }
  get localPlayer() { return this.#api.myPlayer?.() ?? null; }
  get playerId() { return this.localPlayer?.id ?? null; }
  get players() { return [...this.#players.values()]; }
  get playerIndex() {
    const localId = this.playerId;
    return this.players.findIndex((player) => player.id === localId);
  }
  get remotePlayers() {
    const localId = this.localPlayer?.id;
    return this.players.filter((player) => player.id !== localId);
  }
  onDisconnect(listener) {
    this.#disconnectListeners.add(listener);
    return () => this.#disconnectListeners.delete(listener);
  }
  getRoomState() { return this.#api.getState(ROOM_KEY); }
  setRoomState(state) { this.#api.setState(ROOM_KEY, state, true); }
  getGameState(gameId = "tic-tac-toe") { return this.#api.getState(`${GAME_KEY_PREFIX}${gameId}`); }
  setGameState(gameId, state, reliable = true) {
    this.#api.setState(`${GAME_KEY_PREFIX}${gameId}`, state, reliable);
  }
  setLocalPlayerState(key, value, reliable = false) {
    this.localPlayer?.setState?.(key, value, reliable);
  }
  getRemotePlayerState(key) {
    return this.remotePlayers[0]?.getState?.(key) ?? null;
  }
  getAllPlayerStates(key) {
    return this.players.map((player) => ({
      playerId: player.id,
      value: player.getState?.(key) ?? null,
    }));
  }
}
