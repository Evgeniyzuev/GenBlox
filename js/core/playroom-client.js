const ROOM_KEY = "genblox:room";
const GAME_KEY = "genblox:game:tic-tac-toe";

export class PlayroomClient {
  #api;
  #players = new Map();
  #started = false;

  constructor(api = window.Playroom) {
    if (!api) throw new Error("PlayroomKit не загрузился. Проверьте подключение к интернету.");
    this.#api = api;
  }

  async start({ matchmaking = false } = {}) {
    if (this.#started) return;

    await this.#api.insertCoin({
      gameId: "genblox-tic-tac-toe",
      maxPlayersPerRoom: 2,
      matchmaking,
    });

    this.#api.onPlayerJoin((player) => {
      const id = player.id ?? player.getProfile?.().id ?? crypto.randomUUID();
      this.#players.set(id, player);
      player.onQuit?.(() => this.#players.delete(id));
    });

    this.#started = true;
  }

  get isHost() { return this.#api.isHost(); }
  get mark() { return this.isHost ? "X" : "O"; }
  get playerCount() { return Math.max(1, this.#players.size); }
  get roomCode() { return this.#api.getRoomCode?.() ?? "—"; }
  getRoomState() { return this.#api.getState(ROOM_KEY); }
  setRoomState(state) { this.#api.setState(ROOM_KEY, state, true); }
  getGameState() { return this.#api.getState(GAME_KEY); }
  setGameState(state) { this.#api.setState(GAME_KEY, state, true); }
}
