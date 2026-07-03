window.GENBLOX_CONFIG = {
  websocketUrl:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "ws://localhost:8787/ws"
      : "wss://genblox-realtime.YOUR-SUBDOMAIN.workers.dev/ws",
};
