export class RealtimeSnapshotChannel {
  constructor({ network = null, kind, playerId = "solo" } = {}) {
    this.network = network;
    this.kind = kind;
    this.playerId = network?.playerId ?? playerId;
    this.role = network?.role ?? "solo";
  }

  get isHost() {
    return this.role === "host";
  }

  get isGuest() {
    return this.role === "guest";
  }

  publish(snapshot, reliable = false) {
    if (!this.network || !this.isHost) return;
    this.network.publish?.({ kind: this.kind, ...snapshot }, reliable);
  }

  sendInput(input) {
    if (!this.network) return;
    this.network.sendInput?.({ ...input, t: Date.now() });
  }

  getInputs() {
    return this.network?.getInputs?.() ?? [];
  }
}

export class TimedEventQueue {
  constructor({ horizon = 30, disconnectGrace = 30 } = {}) {
    this.horizon = horizon;
    this.disconnectGrace = disconnectGrace;
    this.events = [];
    this.consumed = new Set();
    this.hostTime = 0;
    this.syncedAt = performance.now();
    this.lastSyncAt = performance.now();
  }

  estimateHostTime() {
    return this.hostTime + (performance.now() - this.syncedAt) / 1000;
  }

  sync(events = [], hostTime = 0) {
    const hasNewEvent = events.some((event) => event?.id && !this.consumed.has(event.id) && !this.events.some((item) => item.id === event.id));
    const hasAdvancedClock = hostTime > this.hostTime + 0.001;
    if (!hasNewEvent && !hasAdvancedClock) return;
    this.hostTime = hostTime;
    this.syncedAt = performance.now();
    this.lastSyncAt = this.syncedAt;
    const seen = new Set();
    this.events = events
      .filter((event) => event && !this.consumed.has(event.id))
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((a, b) => a.at - b.at);
  }

  fill(now, createEvent, nextDelay) {
    const latest = this.events.reduce((max, event) => Math.max(max, event.at), now);
    let at = latest;
    while (at < now + this.horizon) {
      const delay = Math.max(0.1, nextDelay(at));
      at += delay;
      this.events.push(createEvent(at));
    }
    this.events.sort((a, b) => a.at - b.at);
  }

  takeDue(now) {
    const due = [];
    this.events = this.events.filter((event) => {
      if (event.at > now || this.consumed.has(event.id)) return true;
      due.push(event);
      this.consumed.add(event.id);
      return false;
    });
    return due;
  }

  snapshot(now) {
    return this.events.filter((event) => event.at >= now && event.at <= now + this.horizon);
  }

  isExpired(now = performance.now()) {
    const estimate = this.estimateHostTime();
    const hasFuture = this.events.some((event) => event.at >= estimate && !this.consumed.has(event.id));
    return !hasFuture && (now - this.lastSyncAt) / 1000 >= this.disconnectGrace;
  }
}
