const GAME_KEY = "genblox:tic-tac-toe";

export class PlayroomClient {
  #api;
  #players = new Map();
  #started = false;

  constructor(api = window.Playroom) {
    if (!api) throw new Error("PlayroomKit не загрузился. Проверьте подключение к интернету.");
    this.#api = api;
  }

  async start() {
    if (this.#started) return;

    await this.#api.insertCoin({
      gameId: "genblox-tic-tac-toe",
      maxPlayersPerRoom: 2,
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
  getState() { return this.#api.getState(GAME_KEY); }
  setState(state) { this.#api.setState(GAME_KEY, state, true); }
}
