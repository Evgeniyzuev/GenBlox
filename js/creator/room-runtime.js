import { buildPreviewDocument } from "./preview.js";

export class CreatorRoomRuntime {
  constructor(frame, { onStateWrite, onStatus } = {}) {
    this.frame = frame;
    this.onStateWrite = onStateWrite;
    this.onStatus = onStatus;
    this.game = null;
    this.snapshot = null;
    this.onMessage = this.handleMessage.bind(this);
    this.onLoad = () => this.sync(this.snapshot);
    window.addEventListener("message", this.onMessage);
    frame.addEventListener("load", this.onLoad);
  }

  load(game, snapshot = this.snapshot) {
    this.game = game;
    if (snapshot) this.snapshot = snapshot;
    this.frame.srcdoc = buildPreviewDocument(game, this.snapshot);
    this.onStatus?.("Loading the room game…");
  }

  sync(snapshot) {
    if (!snapshot || !this.frame.contentWindow) return;
    this.snapshot = snapshot;
    this.frame.contentWindow.postMessage({ source: "genblox-host", type: "sync", payload: snapshot }, "*");
  }

  sendError(message) {
    this.frame.contentWindow?.postMessage({ source: "genblox-host", type: "multiplayer-error", payload: { message } }, "*");
  }

  handleMessage(event) {
    if (event.source !== this.frame.contentWindow || event.data?.source !== "genblox-game") return;
    const { type, payload } = event.data;
    if (type === "ready") {
      this.sync(this.snapshot);
      this.onStatus?.("Room game connected.");
    }
    if (type === "set-state") {
      try {
        this.onStateWrite?.(payload?.key, payload?.value);
      } catch (error) {
        this.sendError(error.message);
        this.onStatus?.(error.message, true);
      }
    }
    if (type === "finish") {
      const score = Number.isFinite(payload?.score) ? ` Score: ${payload.score}.` : "";
      this.onStatus?.(`Game finished.${score}`);
    }
    if (type === "restart" && this.game) this.load(this.game, this.snapshot);
    if (type === "error") this.onStatus?.(`${payload?.message || "The user game stopped."}${payload?.line ? ` (line ${payload.line})` : ""}`, true);
  }

  destroy() {
    window.removeEventListener("message", this.onMessage);
    this.frame.removeEventListener("load", this.onLoad);
    this.frame.removeAttribute("srcdoc");
    this.game = null;
    this.snapshot = null;
  }
}
