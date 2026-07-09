import { RealtimeSnapshotChannel } from "../core/realtime-netcode.js";

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const COLORS = ["#ff668c", "#63dcff", "#b7f34a", "#ffd36a"];
const ITEMS = ["spikes", "oil", "rocket", "machinegun", "shock", "boost"];
const ITEM_LABELS = {
  spikes: "Spikes",
  oil: "Oil Slick",
  rocket: "Rocket",
  machinegun: "Machine Gun",
  shock: "Shock Trap",
  boost: "Boost Can",
};
const ITEM_ICONS = {
  spikes: "▲",
  oil: "●",
  rocket: "➤",
  machinegun: "✦",
  shock: "⚡",
  boost: "»",
};

const TRACKS = [
  {
    id: "kitchen",
    title: "Billiard Break",
    subtitle: "Green felt, rails, balls, oil, and tabletop jumps",
    world: { width: 1900, height: 1300 },
    width: 150,
    points: [
      { x: 270, y: 990 }, { x: 250, y: 650 }, { x: 420, y: 360 },
      { x: 780, y: 220 }, { x: 1130, y: 235 }, { x: 1490, y: 360 },
      { x: 1640, y: 650 }, { x: 1490, y: 915 }, { x: 1150, y: 990 },
      { x: 910, y: 820 }, { x: 650, y: 1055 },
    ],
    zones: [
      { type: "oil", x: 665, y: 1015, r: 74 },
      { type: "fire", x: 1435, y: 455, r: 92 },
      { type: "boost", x: 980, y: 245, r: 78, angle: 0 },
      { type: "ramp", x: 1510, y: 780, r: 86, angle: 1.8 },
      { type: "sand", x: 470, y: 640, r: 118 },
      { type: "cliff", x: 980, y: 650, r: 105 },
    ],
    pickups: [
      { x: 535, y: 350 }, { x: 1180, y: 300 }, { x: 1580, y: 670 },
      { x: 1220, y: 1010 }, { x: 690, y: 1040 },
    ],
    props: [
      { x: 235, y: 330, label: "8" }, { x: 1680, y: 300, label: "3" },
      { x: 970, y: 1120, label: "CUE" },
    ],
  },
  {
    id: "workshop",
    title: "Workshop Loop",
    subtitle: "Glue patches, flame jets, and narrow bridges",
    world: { width: 1900, height: 1300 },
    width: 135,
    points: [
      { x: 270, y: 1030 }, { x: 300, y: 720 }, { x: 245, y: 390 },
      { x: 570, y: 260 }, { x: 860, y: 430 }, { x: 1050, y: 235 },
      { x: 1440, y: 285 }, { x: 1650, y: 560 }, { x: 1475, y: 820 },
      { x: 1660, y: 1040 }, { x: 1220, y: 1090 }, { x: 960, y: 875 },
      { x: 700, y: 1110 },
    ],
    zones: [
      { type: "sand", x: 730, y: 520, r: 125 },
      { type: "oil", x: 1240, y: 965, r: 78 },
      { type: "fire", x: 1540, y: 655, r: 96 },
      { type: "boost", x: 410, y: 460, r: 72, angle: -1.4 },
      { type: "ramp", x: 1030, y: 400, r: 84, angle: -0.7 },
      { type: "cliff", x: 1010, y: 665, r: 76 },
    ],
    pickups: [
      { x: 360, y: 700 }, { x: 825, y: 340 }, { x: 1320, y: 330 },
      { x: 1530, y: 900 }, { x: 760, y: 1010 },
    ],
    props: [
      { x: 475, y: 230, label: "NUT" }, { x: 1690, y: 620, label: "BOLT" },
      { x: 1080, y: 1120, label: "TAPE" },
    ],
  },
  {
    id: "garden",
    title: "Garden Circuit",
    subtitle: "Mud shoulders, puddles, leaves, and cliffs",
    world: { width: 1900, height: 1300 },
    width: 165,
    points: [
      { x: 280, y: 915 }, { x: 350, y: 470 }, { x: 670, y: 250 },
      { x: 1080, y: 330 }, { x: 1395, y: 210 }, { x: 1650, y: 520 },
      { x: 1575, y: 870 }, { x: 1260, y: 1035 }, { x: 930, y: 910 },
      { x: 730, y: 1110 }, { x: 525, y: 820 },
    ],
    zones: [
      { type: "sand", x: 560, y: 665, r: 135 },
      { type: "oil", x: 1280, y: 420, r: 90 },
      { type: "fire", x: 1430, y: 915, r: 82 },
      { type: "boost", x: 855, y: 250, r: 76, angle: 0 },
      { type: "ramp", x: 1550, y: 650, r: 84, angle: 1.1 },
      { type: "cliff", x: 970, y: 690, r: 110 },
    ],
    pickups: [
      { x: 390, y: 530 }, { x: 720, y: 280 }, { x: 1435, y: 500 },
      { x: 1320, y: 990 }, { x: 770, y: 925 },
    ],
    props: [
      { x: 235, y: 285, label: "SEED" }, { x: 1680, y: 1010, label: "LEAF" },
      { x: 1030, y: 1125, label: "POT" },
    ],
  },
];

function nearestTrackInfo(track, point) {
  let best = { distance: Infinity, progress: 0, targetIndex: 1, point: track.points[0] };
  let traveled = 0;
  for (let index = 0; index < track.points.length; index += 1) {
    const a = track.points[index];
    const b = track.points[(index + 1) % track.points.length];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const length = Math.hypot(vx, vy) || 1;
    const t = clamp(((point.x - a.x) * vx + (point.y - a.y) * vy) / (length * length), 0, 1);
    const px = a.x + vx * t;
    const py = a.y + vy * t;
    const d = Math.hypot(point.x - px, point.y - py);
    if (d < best.distance) {
      best = { distance: d, progress: traveled + length * t, targetIndex: (index + 1) % track.points.length, point: { x: px, y: py } };
    }
    traveled += length;
  }
  best.totalLength = traveled;
  return best;
}

function zoneAt(track, point, type = null) {
  return track.zones.find((zone) => (!type || zone.type === type) && Math.hypot(point.x - zone.x, point.y - zone.y) <= zone.r) ?? null;
}

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

export class MicroMachinesGame {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.network = callbacks.network ?? null;
    this.netcode = new RealtimeSnapshotChannel({ network: this.network, kind: "micromachines", playerId: "solo" });
    this.networkRole = this.netcode.role;
    this.playerId = this.netcode.playerId;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "micro-canvas";
    this.canvas.width = 960;
    this.canvas.height = 540;
    this.canvas.setAttribute("role", "application");
    this.canvas.setAttribute("aria-label", "Micro Machines race track");
    this.context = this.canvas.getContext("2d");
    this.mapChoice = document.createElement("div");
    this.mapChoice.className = "micro-map-choice";
    this.root.replaceChildren(this.canvas, this.mapChoice);
    this.root.classList.add("is-active");
    this.keys = new Set();
    this.pointers = new Map();
    this.localInput = { throttle: 0, steer: 0, brake: 0, reverse: 0, fireSeq: 0 };
    this.remoteInputs = new Map();
    this.remoteRacerStates = new Map();
    this.running = true;
    this.state = "maps";
    this.fixedStep = 1 / 60;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.revision = 1;
    this.camera = { x: 0, y: 0, zoom: 1, angle: 0 };
    this.feedback = "";
    this.feedbackTime = 0;
    this.networkClock = 0;
    this.inputClock = 0;
    this.buildMapChoice();
    this.bindEvents();
    this.frame = requestAnimationFrame((time) => this.loop(time));
  }

  buildMapChoice() {
    const heading = document.createElement("div");
    heading.className = "micro-map-heading";
    heading.innerHTML = "<small>CHOOSE TRACK</small><strong>Three cups. Three laps.</strong>";
    this.mapChoice.append(heading);
    TRACKS.forEach((track) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "micro-map-button";
      const preview = document.createElement("canvas");
      preview.width = 260;
      preview.height = 120;
      preview.className = "micro-map-preview";
      this.drawTrackPreview(preview, track);
      const title = document.createElement("strong");
      title.textContent = track.title;
      const subtitle = document.createElement("small");
      subtitle.textContent = track.subtitle;
      button.append(preview, title, subtitle);
      button.disabled = this.networkRole === "guest";
      button.addEventListener("click", () => this.start(track.id));
      this.mapChoice.append(button);
    });
    if (this.networkRole === "guest") {
      heading.innerHTML = "<small>NETWORK RACE</small><strong>The host is choosing a track...</strong>";
    }
  }

  drawTrackPreview(canvas, track) {
    const context = canvas.getContext("2d");
    context.fillStyle = track.id === "kitchen" ? "#24743a" : track.id === "garden" ? "#2f6245" : "#4b4a55";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min((canvas.width - 28) / track.world.width, (canvas.height - 22) / track.world.height);
    const offsetX = (canvas.width - track.world.width * scale) / 2;
    const offsetY = (canvas.height - track.world.height * scale) / 2;
    const points = track.points.map((point) => ({ x: offsetX + point.x * scale, y: offsetY + point.y * scale }));
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "rgba(255,102,140,.45)";
    context.lineWidth = Math.max(12, track.width * scale * 4.3);
    this.strokePreviewLoop(context, points);
    context.strokeStyle = track.id === "garden" ? "#a88f57" : track.id === "kitchen" ? "#c9b56e" : "#9c9175";
    context.lineWidth = Math.max(9, track.width * scale * 2.9);
    this.strokePreviewLoop(context, points);
    context.strokeStyle = track.id === "garden" ? "#6d7460" : track.id === "workshop" ? "#817a77" : "#2f9d56";
    context.lineWidth = Math.max(5, track.width * scale);
    this.strokePreviewLoop(context, points);
    context.fillStyle = "#f8f7ff";
    context.beginPath();
    context.arc(points[0].x, points[0].y, 5, 0, TAU);
    context.fill();
  }

  strokePreviewLoop(context, points) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.closePath();
    context.stroke();
  }

  bindEvents() {
    this.onKeyDown = (event) => {
      this.keys.add(event.key.toLowerCase());
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(event.key.toLowerCase())) event.preventDefault();
    };
    this.onKeyUp = (event) => {
      this.keys.delete(event.key.toLowerCase());
      if (event.code === "Space") this.fire();
    };
    this.onPointerDown = (event) => this.pointerDown(event);
    this.onPointerMove = (event) => this.pointerMove(event);
    this.onPointerUp = (event) => this.pointerUp(event);
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  start(trackId, publish = true) {
    this.track = TRACKS.find((track) => track.id === trackId) ?? TRACKS[0];
    this.state = "racing";
    this.mapChoice.hidden = true;
    this.tick = 0;
    this.winner = null;
    this.finishOrder = [];
    this.projectiles = [];
    this.hazards = this.track.zones
      .filter((zone) => ["oil", "fire"].includes(zone.type))
      .map((zone, index) => ({ id: `map-${index}`, type: zone.type, x: zone.x, y: zone.y, r: zone.r, life: Infinity }));
    this.pickups = this.track.pickups.map((point, index) => ({
      id: `pickup-${index}`,
      x: point.x,
      y: point.y,
      item: ITEMS[(index + trackId.length) % ITEMS.length],
      respawn: 0,
    }));
    this.props = this.track.props.map((prop, index) => ({ ...prop, id: index, alive: true }));
    this.humanSlots = this.resolveHumanSlots();
    this.localSlot = this.findLocalSlot();
    this.racers = this.createRacers();
    this.callbacks.onStatus?.("Race to 3 laps. Pick up weapons and stay on the track.");
    if (publish && this.networkRole === "host") this.publishSnapshot(true);
  }

  resolveHumanSlots() {
    if (!this.network) return [{ playerId: "solo", slot: 0, name: "You" }];
    const players = this.network.getPlayers?.() ?? [];
    return players.slice(0, 4).map((player, slot) => ({
      playerId: player.id,
      slot,
      name: player.name ?? (slot === 0 ? "Host" : `Player ${slot + 1}`),
    }));
  }

  findLocalSlot() {
    const match = this.humanSlots.find((entry) => entry.playerId === this.playerId);
    if (match) return match.slot;
    return this.networkRole === "guest" ? -1 : 0;
  }

  createRacers() {
    const start = this.track.points[0];
    const next = this.track.points[1];
    const angle = Math.atan2(next.y - start.y, next.x - start.x);
    const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
    return [0, 1, 2, 3].map((slot) => {
      const human = this.humanSlots.find((entry) => entry.slot === slot);
      const offset = (slot - 1.5) * 38;
      return {
        slot,
        id: human?.playerId ?? `bot-${slot}`,
        name: human?.name ?? `Bot ${slot + 1}`,
        bot: !human,
        color: COLORS[slot],
        x: start.x + normal.x * offset - Math.cos(angle) * slot * 26,
        y: start.y + normal.y * offset - Math.sin(angle) * slot * 26,
        prevX: start.x + normal.x * offset - Math.cos(angle) * slot * 26,
        prevY: start.y + normal.y * offset - Math.sin(angle) * slot * 26,
        vx: 0,
        vy: 0,
        angle,
        hp: 100,
        lap: 0,
        checkpoint: 1,
        gateProgress: Array(this.track.points.length).fill(false),
        checkpointSafe: { x: start.x + normal.x * offset, y: start.y + normal.y * offset, angle },
        lastSafe: { x: start.x + normal.x * offset, y: start.y + normal.y * offset, angle },
        item: ITEMS[slot % ITEMS.length],
        cooldown: 1.5,
        burstTime: 0,
        burstClock: 0,
        respawn: 0,
        invulnerable: 2.4,
        airborne: 0,
        drift: 0,
        miniBoost: 0,
        wobble: 0,
        shock: 0,
        stun: 0,
        scramble: 0,
        slowTime: 0,
        lastProgress: 0,
        finished: false,
        finishPosition: null,
        spectator: false,
      };
    });
  }

  pointerPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * 960 / rect.width,
      y: (event.clientY - rect.top) * 540 / rect.height,
    };
  }

  pointerDown(event) {
    if (this.state !== "racing") return;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.pointerPosition(event);
    let side = "drive";
    if (point.x >= 720) side = point.y > 430 ? "brake" : "fire";
    this.pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y, side });
    if (side === "fire") this.fire();
  }

  pointerMove(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    const point = this.pointerPosition(event);
    pointer.x = point.x;
    pointer.y = point.y;
  }

  pointerUp(event) {
    this.pointers.delete(event.pointerId);
  }

  readLocalInput() {
    let throttle = 0;
    let steer = 0;
    let brake = 0;
    let reverse = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) throttle += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) {
      brake = 1;
      reverse = 1;
    }
    if (this.keys.has("a") || this.keys.has("arrowleft")) steer -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) steer += 1;
    for (const pointer of this.pointers.values()) {
      if (pointer.side === "brake") {
        brake = 1;
        reverse = 1;
        continue;
      }
      if (pointer.side !== "drive") continue;
      const dx = pointer.x - pointer.startX;
      const dy = pointer.y - pointer.startY;
      const pull = Math.hypot(dx, dy);
      if (pull < 14) continue;
      const local = this.racers?.[this.localSlot];
      const desired = Math.atan2(dy, dx);
      const strength = clamp((pull - 14) / 86, 0, 1);
      if (!local) {
        steer += clamp(dx / 72, -1, 1);
        throttle = Math.max(throttle, 1);
        continue;
      }
      const turn = angleDiff(local.angle, desired);
      steer += clamp(turn * 1.65, -1, 1) * strength;
      throttle = Math.max(throttle, 1);
    }
    this.localInput.throttle = clamp(throttle, 0, 1);
    this.localInput.steer = clamp(steer, -1, 1);
    this.localInput.brake = clamp(brake, 0, 1);
    this.localInput.reverse = clamp(reverse, 0, 1);
    if (this.network) this.sendNetworkInput();
  }

  fire() {
    if (this.state !== "racing") return;
    this.localInput.fireSeq += 1;
    const racer = this.racers?.[this.localSlot];
    if (racer) this.useItem(racer);
    if (this.network) this.sendNetworkInput(true);
  }

  sendNetworkInput(force = false) {
    if (!this.network) return;
    const now = performance.now();
    if (!force && now - (this.lastInputSent ?? 0) < 50) return;
    this.lastInputSent = now;
    this.netcode.sendInput({
      ...this.localInput,
      phase: this.state,
      mapId: this.track?.id ?? null,
      tick: this.tick ?? 0,
      racer: this.compactRacerState(this.racers?.[this.localSlot]),
    });
  }

  updateRemoteInputs() {
    this.remoteInputs.clear();
    this.remoteRacerStates.clear();
    const states = this.netcode.getInputs();
    states.forEach(({ playerId, value }) => {
      if (!value) return;
      this.remoteInputs.set(playerId, value);
      if (value.racer) this.remoteRacerStates.set(playerId, value.racer);
    });
  }

  inputFor(racer) {
    if (racer.respawn > 0 || racer.finished) return { throttle: 0, steer: 0, brake: 0, reverse: 0, fireSeq: 0 };
    if (racer.slot === this.localSlot) return this.localInput;
    if (!racer.bot) return this.remoteInputs.get(racer.id) ?? { throttle: 0, steer: 0, brake: 0, reverse: 0, fireSeq: 0 };
    return this.botInput(racer);
  }

  botInput(racer) {
    const target = this.track.points[racer.checkpoint % this.track.points.length];
    const desired = Math.atan2(target.y - racer.y, target.x - racer.x);
    const turn = clamp(angleDiff(racer.angle, desired) * 1.8, -1, 1);
    const speed = Math.hypot(racer.vx, racer.vy);
    const hazard = this.track.zones.find((zone) => ["fire", "cliff"].includes(zone.type) && distance(racer, zone) < zone.r + 120);
    const avoid = hazard ? clamp(angleDiff(racer.angle, Math.atan2(racer.y - hazard.y, racer.x - hazard.x)) * 0.7, -0.8, 0.8) : 0;
    const input = {
      throttle: Math.abs(turn) > 0.72 && speed > 230 ? 0.35 : 1,
      steer: clamp(turn + avoid, -1, 1),
      brake: Math.abs(turn) > 0.88 && speed > 300 ? 0.45 : 0,
      reverse: 0,
      fireSeq: racer._botFireSeq ?? 0,
    };
    const ahead = this.racers.find((other) => other !== racer && !other.finished && distance(racer, other) < 260);
    if (ahead && racer.cooldown <= 0 && Math.random() < 0.018) {
      input.fireSeq += 1;
      racer._botFireSeq = input.fireSeq;
    }
    return input;
  }

  step(dt) {
    if (this.state !== "racing") return;
    this.tick += 1;
    this.updateRemoteInputs();
    this.pickups.forEach((pickup) => {
      if (pickup.respawn > 0) pickup.respawn -= dt;
    });
    this.hazards = this.hazards.filter((hazard) => {
      if (hazard.life === Infinity) return true;
      hazard.life -= dt;
      return hazard.life > 0;
    });
    this.racers.forEach((racer) => this.updateRacer(racer, dt));
    this.updateCollisions(dt);
    this.updateProjectiles(dt);
    this.updateProps();
    this.applyRemoteRacerStates();
    const finishers = this.racers.filter((racer) => racer.lap >= 3 && !racer.finished);
    for (const finisher of finishers) {
      finisher.finished = true;
      finisher.finishPosition = this.finishOrder.length + 1;
      this.finishOrder.push({ slot: finisher.slot, name: finisher.name });
      if (!this.winner) {
        this.winner = { slot: finisher.slot, name: finisher.name };
        this.callbacks.onStatus?.(`${finisher.name} wins the race!`);
      } else if (finisher.slot === this.localSlot) {
        this.callbacks.onStatus?.(`Finished ${finisher.finishPosition}${this.ordinalSuffix(finisher.finishPosition)}.`);
      }
    }
    this.networkClock += dt;
    if (this.networkRole === "host" && this.networkClock >= 1 / 15) {
      this.networkClock = 0;
      this.publishSnapshot();
    }
  }

  updateRacer(racer, dt) {
    if (racer.respawn > 0) {
      racer.respawn -= dt;
      if (racer.respawn <= 0) this.placeAtSafePoint(racer);
      return;
    }
    racer.cooldown = Math.max(0, racer.cooldown - dt);
    racer.invulnerable = Math.max(0, racer.invulnerable - dt);
    racer.shock = Math.max(0, racer.shock - dt);
    racer.stun = Math.max(0, racer.stun - dt);
    racer.scramble = Math.max(0, racer.scramble - dt);
    racer.slowTime = Math.max(0, racer.slowTime - dt);
    racer.wobble = Math.max(0, racer.wobble - dt);
    racer.miniBoost = Math.max(0, racer.miniBoost - dt);
    racer.airborne = Math.max(0, racer.airborne - dt);
    racer.burstTime = Math.max(0, racer.burstTime - dt);
    if (racer.burstTime > 0) this.fireMachineGunRound(racer, dt);
    const rawInput = this.inputFor(racer);
    const input = racer.stun > 0
      ? { throttle: 0, steer: 0, brake: 1, fireSeq: rawInput.fireSeq ?? 0 }
      : racer.scramble > 0
        ? { throttle: 0.25, steer: Math.sin(this.tick * 0.2 + racer.slot) * 0.9, brake: 0, fireSeq: rawInput.fireSeq ?? 0 }
        : rawInput;
    if ((input.fireSeq ?? 0) > (racer.lastFireSeq ?? 0)) {
      racer.lastFireSeq = input.fireSeq;
      this.useItem(racer);
    }

    const speed = Math.hypot(racer.vx, racer.vy);
    const info = nearestTrackInfo(this.track, racer);
    racer.prevX = racer.x;
    racer.prevY = racer.y;
    const offRoad = info.distance > this.track.width * 0.52;
    const sand = offRoad || zoneAt(this.track, racer, "sand");
    const oil = this.hazards.find((hazard) => hazard.type === "oil" && distance(racer, hazard) < hazard.r);
    const fire = this.hazards.find((hazard) => hazard.type === "fire" && distance(racer, hazard) < hazard.r);
    const cliffZone = zoneAt(this.track, racer, "cliff");
    const deepOffRoad = info.distance > this.track.width * 2.25;
    const cliff = deepOffRoad || (cliffZone && info.distance > this.track.width * 0.62 && distance(racer, cliffZone) < cliffZone.r * 0.72);
    const surfaceGrip = oil ? 0.42 : sand ? 0.62 : 1;
    const steerStrength = (2.55 - clamp(speed / 500, 0, 1) * 1.55) * surfaceGrip;
    const wobble = racer.wobble > 0 ? Math.sin(this.tick * 0.45 + racer.slot) * 0.45 : 0;
    racer.angle += (input.steer + wobble) * steerStrength * dt;
    if (racer.shock > 0) racer.angle += Math.sin(this.tick * 0.32) * 1.7 * dt;
    const forward = { x: Math.cos(racer.angle), y: Math.sin(racer.angle) };
    const forwardSpeed = racer.vx * forward.x + racer.vy * forward.y;
    const reverseIntent = input.reverse ?? input.brake ?? 0;
    const reversing = reverseIntent > 0.1 && forwardSpeed < 34;
    const steerDirection = reversing ? -1 : 1;
    const appliedSteer = input.steer * steerDirection;
    const accel = racer.shock > 0 ? 180 : 360;
    racer.angle += (appliedSteer - input.steer) * steerStrength * dt;
    racer.vx += forward.x * input.throttle * accel * dt;
    racer.vy += forward.y * input.throttle * accel * dt;
    if (reversing) {
      const reversePower = sand ? 128 : oil ? 92 : 160;
      racer.vx -= forward.x * reverseIntent * reversePower * dt;
      racer.vy -= forward.y * reverseIntent * reversePower * dt;
    }
    if (input.brake) {
      const brakeFactor = reversing ? 0.32 : 1.9;
      racer.vx *= 1 - brakeFactor * input.brake * dt;
      racer.vy *= 1 - brakeFactor * input.brake * dt;
    }
    if (racer.miniBoost > 0) {
      racer.vx += forward.x * 520 * dt;
      racer.vy += forward.y * 520 * dt;
    }
    const lateral = -Math.sin(racer.angle) * racer.vx + Math.cos(racer.angle) * racer.vy;
    const driftAmount = Math.abs(lateral);
    const lateralDamp = oil ? 0.25 : sand ? 1.25 : 2.15;
    racer.vx += Math.sin(racer.angle) * lateral * lateralDamp * dt;
    racer.vy -= Math.cos(racer.angle) * lateral * lateralDamp * dt;
    const drag = sand ? 1.55 : oil ? 0.34 : 0.48;
    racer.vx *= Math.max(0, 1 - drag * dt);
    racer.vy *= Math.max(0, 1 - drag * dt);
    const maxSpeedBase = reversing ? (sand ? 100 : oil ? 82 : 145) : racer.miniBoost > 0 ? 650 : sand ? 285 : 520;
    const maxSpeed = racer.slowTime > 0 ? maxSpeedBase * 0.5 : maxSpeedBase;
    const newSpeed = Math.hypot(racer.vx, racer.vy);
    if (newSpeed > maxSpeed) {
      racer.vx = racer.vx / newSpeed * maxSpeed;
      racer.vy = racer.vy / newSpeed * maxSpeed;
    }
    racer.x += racer.vx * dt;
    racer.y += racer.vy * dt;

    if (driftAmount > 120 && speed > 240 && Math.abs(input.steer) > 0.45 && !oil) {
      racer.drift += dt;
      if (racer.drift > 1.1) {
        racer.miniBoost = 0.55;
        racer.drift = 0;
        this.feedback = "DRIFT BOOST";
        this.feedbackTime = 1;
      }
    } else {
      racer.drift = Math.max(0, racer.drift - dt * 1.6);
    }

    if (fire && racer.invulnerable <= 0) this.damage(racer, 22 * dt, { x: 0, y: 0 });
    const boost = zoneAt(this.track, racer, "boost");
    if (boost) {
      const angle = Number.isFinite(boost.angle) ? boost.angle : racer.angle;
      racer.vx += Math.cos(angle) * 760 * dt;
      racer.vy += Math.sin(angle) * 760 * dt;
    }
    if (zoneAt(this.track, racer, "ramp") && speed > 180) racer.airborne = Math.max(racer.airborne, 0.45);
    if (cliff && racer.airborne <= 0 && racer.invulnerable <= 0) this.killRacer(racer, "Fell off track");
    if (!offRoad && !cliff && !fire) {
      racer.lastSafe = { x: racer.x, y: racer.y, angle: racer.angle };
      this.updateLap(racer);
    }
    this.pickupItems(racer);
  }

  updateLap(racer) {
    const info = nearestTrackInfo(this.track, racer);
    racer.lastProgress = info.progress;
    const gateIndex = racer.checkpoint % this.track.points.length;
    if (!this.touchedCheckpointSector(racer, gateIndex, info)) return;
    racer.gateProgress[gateIndex] = true;
    const gate = this.track.points[gateIndex];
    const next = this.track.points[(gateIndex + 1) % this.track.points.length];
    racer.checkpointSafe = { x: gate.x, y: gate.y, angle: Math.atan2(next.y - gate.y, next.x - gate.x) };
    racer.lastSafe = racer.checkpointSafe;
    racer.checkpoint = (racer.checkpoint + 1) % this.track.points.length;
    if (racer.checkpoint === 1) {
      racer.lap += 1;
      racer.gateProgress = Array(this.track.points.length).fill(false);
      if (racer.lap === 2 && racer.slot === this.localSlot) this.callbacks.onStatus?.("Final lap!");
    }
  }

  trackCenter() {
    return {
      x: this.track.world.width / 2,
      y: this.track.world.height / 2,
    };
  }

  gateMultiplier(index) {
    return index === 0 ? 1.05 : 0.82;
  }

  gateHitRadius() {
    return 50;
  }

  pointSectorAngle(point) {
    const center = this.trackCenter();
    return Math.atan2(point.y - center.y, point.x - center.x);
  }

  checkpointSector(index) {
    const pointCount = this.track.points.length;
    const point = this.track.points[index % pointCount];
    const center = this.trackCenter();
    const current = this.pointSectorAngle(point);
    const previous = this.pointSectorAngle(this.track.points[(index - 1 + pointCount) % pointCount]);
    const next = this.pointSectorAngle(this.track.points[(index + 1) % pointCount]);
    const previousGap = Math.abs(angleDiff(current, previous));
    const nextGap = Math.abs(angleDiff(current, next));
    return {
      angle: current,
      halfAngle: clamp((previousGap + nextGap) * 0.3, 0.26, 0.58),
      radius: Math.hypot(point.x - center.x, point.y - center.y),
      halfRadius: this.track.width * (index === 0 ? 2.1 : 1.75),
    };
  }

  gateSegment(index, multiplier = this.gateMultiplier(index)) {
    const point = this.track.points[index % this.track.points.length];
    const center = this.trackCenter();
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const radialLength = Math.hypot(dx, dy) || 1;
    const ux = dx / radialLength;
    const uy = dy / radialLength;
    const outer = this.track.width * multiplier;
    const inner = this.track.width * multiplier;
    return {
      a: { x: point.x - ux * inner, y: point.y - uy * inner },
      b: { x: point.x + ux * outer, y: point.y + uy * outer },
      angle: Math.atan2(uy, ux),
    };
  }

  touchedCheckpointSector(racer, index, info) {
    const trackInfo = info ?? nearestTrackInfo(this.track, racer);
    if (trackInfo.distance > this.track.width * 0.62) return false;
    const center = this.trackCenter();
    const sector = this.checkpointSector(index);
    const racerAngle = this.pointSectorAngle(racer);
    const racerRadius = Math.hypot(racer.x - center.x, racer.y - center.y);
    return Math.abs(angleDiff(sector.angle, racerAngle)) <= sector.halfAngle
      && Math.abs(racerRadius - sector.radius) <= sector.halfRadius;
  }

  ordinalSuffix(value) {
    if (value === 1) return "st";
    if (value === 2) return "nd";
    if (value === 3) return "rd";
    return "th";
  }

  pickupItems(racer) {
    for (const pickup of this.pickups) {
      if (pickup.respawn > 0 || distance(racer, pickup) > 42) continue;
      racer.item = pickup.item;
      pickup.respawn = 9;
      pickup.item = ITEMS[(ITEMS.indexOf(pickup.item) + 2 + racer.slot) % ITEMS.length];
      if (racer.slot === this.localSlot) this.callbacks.onStatus?.(`Picked up ${ITEM_LABELS[racer.item]}`);
    }
  }

  useItem(racer) {
    if (!racer.item || racer.cooldown > 0 || racer.respawn > 0 || racer.finished) return;
    const back = { x: racer.x - Math.cos(racer.angle) * 42, y: racer.y - Math.sin(racer.angle) * 42 };
    const forward = { x: Math.cos(racer.angle), y: Math.sin(racer.angle) };
    if (racer.item === "spikes") {
      this.hazards.push({ id: `spikes-${this.tick}-${racer.slot}`, owner: racer.slot, ownerArmed: false, type: "spikes", x: back.x, y: back.y, r: 62, life: 18 });
    } else if (racer.item === "oil") {
      this.hazards.push({ id: `oil-${this.tick}-${racer.slot}`, owner: racer.slot, ownerArmed: false, type: "oil", x: back.x, y: back.y, r: 84, life: 16 });
    } else if (racer.item === "shock") {
      this.hazards.push({ id: `shock-${this.tick}-${racer.slot}`, owner: racer.slot, ownerArmed: false, type: "shock", x: back.x, y: back.y, r: 72, life: 16 });
    } else if (racer.item === "rocket") {
      this.projectiles.push({ type: "rocket", owner: racer.slot, x: racer.x + forward.x * 42, y: racer.y + forward.y * 42, vx: forward.x * 620, vy: forward.y * 620, angle: racer.angle, life: 2.2, r: 11, homing: true });
    } else if (racer.item === "machinegun") {
      racer.burstTime = 1.05;
      racer.burstClock = 0;
    } else if (racer.item === "boost") {
      racer.miniBoost = 1.25;
    }
    racer.cooldown = racer.item === "machinegun" ? 1.45 : 1.15;
    racer.item = null;
  }

  fireMachineGunRound(racer, dt) {
    racer.burstClock -= dt;
    if (racer.burstClock > 0) return;
    racer.burstClock = 0.08;
    const jitter = (Math.random() - 0.5) * 0.12;
    const angle = racer.angle + jitter;
    const forward = { x: Math.cos(angle), y: Math.sin(angle) };
    this.projectiles.push({
      type: "bullet",
      owner: racer.slot,
      x: racer.x + forward.x * 32,
      y: racer.y + forward.y * 32,
      vx: forward.x * 860 + racer.vx * 0.25,
      vy: forward.y * 860 + racer.vy * 0.25,
      life: 0.48,
      r: 4,
    });
  }

  updateCollisions(dt) {
    for (let a = 0; a < this.racers.length; a += 1) {
      for (let b = a + 1; b < this.racers.length; b += 1) {
        const one = this.racers[a];
        const two = this.racers[b];
        if (one.respawn > 0 || two.respawn > 0) continue;
        const dx = two.x - one.x;
        const dy = two.y - one.y;
        const d = Math.hypot(dx, dy);
        if (d <= 0 || d > 42) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = 42 - d;
        one.x -= nx * overlap * 0.5;
        one.y -= ny * overlap * 0.5;
        two.x += nx * overlap * 0.5;
        two.y += ny * overlap * 0.5;
        const relative = (two.vx - one.vx) * nx + (two.vy - one.vy) * ny;
        const impact = Math.abs(relative);
        const impulse = relative * 0.72;
        one.vx += nx * impulse - nx * 95;
        one.vy += ny * impulse - ny * 95;
        two.vx -= nx * impulse - nx * 95;
        two.vy -= ny * impulse - ny * 95;
        one.angle -= impulse * 0.004 * dt;
        two.angle += impulse * 0.004 * dt;
        if (impact > 90) {
          const damage = clamp((impact - 80) / 24, 3, 18);
          this.damage(one, damage, { x: -nx * impact * 0.35, y: -ny * impact * 0.35 });
          this.damage(two, damage, { x: nx * impact * 0.35, y: ny * impact * 0.35 });
          one.scramble = Math.max(one.scramble, 0.55);
          two.scramble = Math.max(two.scramble, 0.55);
        }
        if (zoneAt(this.track, two, "cliff") || zoneAt(this.track, one, "fire")) {
          this.feedback = "RIVAL SHOVE";
          this.feedbackTime = 1.2;
        }
      }
    }
    for (const hazard of this.hazards) {
      const owner = this.racers.find((racer) => racer.slot === hazard.owner);
      if (owner && hazard.ownerArmed === false && distance(owner, hazard) > hazard.r + 28) hazard.ownerArmed = true;
      for (const racer of this.racers) {
        if (racer.respawn > 0 || racer.invulnerable > 0 || distance(racer, hazard) > hazard.r) continue;
        if (hazard.owner === racer.slot && hazard.ownerArmed === false) continue;
        if (hazard.type === "spikes") {
          racer.wobble = 2.2;
          racer.slowTime = 3;
          this.damage(racer, 14, { x: racer.vx * 0.5, y: racer.vy * 0.5 });
          hazard.life = 0;
        } else if (hazard.type === "oil") {
          racer.scramble = 2;
          racer.wobble = 2.8;
          this.damage(racer, 4, { x: racer.vx * 0.35, y: racer.vy * 0.35 });
        } else if (hazard.type === "shock") {
          racer.shock = 1.2;
          racer.stun = 1;
          this.damage(racer, 12, { x: 0, y: 0 });
          hazard.life = 0;
        }
      }
    }
  }

  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.life -= dt;
      if (projectile.homing) this.updateHomingProjectile(projectile, dt);
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      for (const racer of this.racers) {
        if (racer.slot === projectile.owner || racer.respawn > 0 || racer.invulnerable > 0) continue;
        if (distance(projectile, racer) > projectile.r + 21) continue;
        const force = projectile.type === "rocket" ? 360 : 115;
        const damage = projectile.type === "rocket" ? 24 : 4;
        this.damage(racer, damage, { x: projectile.vx / Math.max(1, Math.hypot(projectile.vx, projectile.vy)) * force, y: projectile.vy / Math.max(1, Math.hypot(projectile.vx, projectile.vy)) * force });
        return false;
      }
      return projectile.life > 0;
    });
  }

  updateHomingProjectile(projectile, dt) {
    const owner = this.racers.find((racer) => racer.slot === projectile.owner);
    const target = this.findRocketTarget(projectile, owner);
    if (!target) return;
    const desired = Math.atan2(target.y - projectile.y, target.x - projectile.x);
    projectile.angle += clamp(angleDiff(projectile.angle, desired), -2.8 * dt, 2.8 * dt);
    const speed = Math.hypot(projectile.vx, projectile.vy) || 620;
    projectile.vx = Math.cos(projectile.angle) * speed;
    projectile.vy = Math.sin(projectile.angle) * speed;
  }

  findRocketTarget(source, owner) {
    if (!owner) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const racer of this.racers) {
      if (racer.slot === owner.slot || racer.respawn > 0 || racer.finished) continue;
      const d = distance(source, racer);
      if (d > 540 || d >= bestDistance) continue;
      const angleToTarget = Math.atan2(racer.y - source.y, racer.x - source.x);
      if (Math.abs(angleDiff(owner.angle, angleToTarget)) > 0.62) continue;
      best = racer;
      bestDistance = d;
    }
    return best;
  }

  updateProps() {
    for (const prop of this.props) {
      if (!prop.alive) continue;
      const hit = this.racers.some((racer) => racer.respawn <= 0 && distance(racer, prop) < 44 && Math.hypot(racer.vx, racer.vy) > 180);
      if (hit) prop.alive = false;
    }
  }

  damage(racer, amount, impulse) {
    if (racer.invulnerable > 0 || racer.respawn > 0 || racer.finished) return;
    racer.hp = Math.max(0, racer.hp - amount);
    racer.vx += impulse.x;
    racer.vy += impulse.y;
    if (amount > 6) racer.wobble = Math.max(racer.wobble, 0.8);
    if (racer.hp <= 0) this.killRacer(racer, "Wrecked");
  }

  killRacer(racer, reason) {
    racer.respawn = 1.5;
    racer.hp = 0;
    racer.vx = 0;
    racer.vy = 0;
    if (racer.slot === this.localSlot) this.callbacks.onStatus?.(`${reason}. Respawning...`);
  }

  placeAtSafePoint(racer) {
    const safe = this.findRespawnPoint(racer);
    racer.x = safe.x;
    racer.y = safe.y;
    racer.angle = safe.angle;
    racer.vx = 0;
    racer.vy = 0;
    racer.hp = 100;
    racer.invulnerable = 2.8;
    racer.wobble = 0;
    racer.shock = 0;
    racer.stun = 0;
    racer.scramble = 0;
    racer.slowTime = 0;
    racer.burstTime = 0;
    racer.burstClock = 0;
  }

  findRespawnPoint(racer) {
    const candidates = [racer.checkpointSafe, racer.lastSafe];
    for (let offset = 1; offset <= this.track.points.length; offset += 1) {
      const index = (racer.checkpoint - offset + this.track.points.length) % this.track.points.length;
      const point = this.track.points[index];
      const next = this.track.points[(index + 1) % this.track.points.length];
      candidates.push({
        x: point.x,
        y: point.y,
        angle: Math.atan2(next.y - point.y, next.x - point.x),
      });
    }
    return candidates.find((candidate) => this.isSafeRespawn(candidate)) ?? candidates[0];
  }

  isSafeRespawn(point) {
    const info = nearestTrackInfo(this.track, point);
    if (info.distance > this.track.width * 0.45) return false;
    return !this.track.zones.some((zone) => {
      if (!["cliff", "fire"].includes(zone.type)) return false;
      return distance(point, zone) < zone.r + 56;
    });
  }

  compactRacerState(racer) {
    if (!racer) return null;
    return {
      slot: racer.slot,
      id: racer.id,
      x: Number(racer.x.toFixed(2)),
      y: Number(racer.y.toFixed(2)),
      vx: Number(racer.vx.toFixed(2)),
      vy: Number(racer.vy.toFixed(2)),
      angle: Number(racer.angle.toFixed(4)),
      hp: Number(racer.hp.toFixed(1)),
      lap: racer.lap,
      checkpoint: racer.checkpoint,
      lastProgress: Number((racer.lastProgress ?? 0).toFixed(2)),
      item: racer.item,
      cooldown: Number((racer.cooldown ?? 0).toFixed(2)),
      respawn: Number((racer.respawn ?? 0).toFixed(2)),
      invulnerable: Number((racer.invulnerable ?? 0).toFixed(2)),
      finished: Boolean(racer.finished),
      finishPosition: racer.finishPosition,
      miniBoost: Number((racer.miniBoost ?? 0).toFixed(2)),
      stun: Number((racer.stun ?? 0).toFixed(2)),
      scramble: Number((racer.scramble ?? 0).toFixed(2)),
      slowTime: Number((racer.slowTime ?? 0).toFixed(2)),
    };
  }

  applyRemoteRacerStates() {
    if (!this.racers?.length) return;
    for (const state of this.remoteRacerStates.values()) {
      if (!state || state.slot === this.localSlot) continue;
      const racer = this.racers.find((item) => item.id === state.id || item.slot === state.slot);
      if (!racer || racer.bot) continue;
      racer.x += (state.x - racer.x) * 0.55;
      racer.y += (state.y - racer.y) * 0.55;
      racer.vx = state.vx;
      racer.vy = state.vy;
      const delta = angleDiff(racer.angle, state.angle);
      racer.angle += delta * 0.55;
      ["hp", "lap", "checkpoint", "lastProgress", "item", "cooldown", "respawn", "invulnerable", "finished", "finishPosition", "miniBoost", "stun", "scramble", "slowTime"].forEach((key) => {
        if (state[key] !== undefined) racer[key] = state[key];
      });
    }
  }

  publishSnapshot(force = false) {
    if (!this.network || this.networkRole !== "host" || !this.track) return;
    const snapshot = {
      phase: this.state,
      mapId: this.track.id,
      racers: this.racers.map((racer) => this.compactRacerState(racer)),
      pickups: force ? this.pickups : undefined,
      projectiles: force ? this.projectiles : undefined,
      hazards: force ? this.hazards : undefined,
      props: force ? this.props : undefined,
      tick: this.tick,
      winner: this.winner,
      finishOrder: this.finishOrder,
      revision: force ? Date.now() : this.revision += 1,
    };
    this.netcode.publish(snapshot);
  }

  applyNetworkSnapshot(snapshot) {
    if (this.networkRole !== "guest" || !snapshot || snapshot.kind !== "micromachines") return;
    if (snapshot.phase === "selecting") {
      this.state = "maps";
      this.mapChoice.hidden = false;
      this.callbacks.onStatus?.("The room host is choosing a track...");
      return;
    }
    if (!this.track || this.track.id !== snapshot.mapId) {
      this.start(snapshot.mapId, false);
    }
    if (snapshot.pickups) this.pickups = cloneSnapshot(snapshot.pickups);
    if (snapshot.projectiles) this.projectiles = cloneSnapshot(snapshot.projectiles);
    if (snapshot.hazards) this.hazards = cloneSnapshot(snapshot.hazards);
    if (snapshot.props) this.props = cloneSnapshot(snapshot.props);
    (snapshot.racers ?? []).forEach((state) => {
      if (!state || state.slot === this.localSlot) return;
      const racer = this.racers.find((item) => item.id === state.id || item.slot === state.slot);
      if (racer && !racer.bot) this.remoteRacerStates.set(racer.id, state);
    });
    this.applyRemoteRacerStates();
    this.tick = Math.max(this.tick ?? 0, snapshot.tick ?? 0);
    this.winner = snapshot.winner ?? null;
    this.finishOrder = snapshot.finishOrder ?? [];
    this.localSlot = this.racers.findIndex((racer) => racer.id === this.playerId);
    if (this.localSlot < 0) this.callbacks.onStatus?.("Spectating this race. You can join the next one.");
    else if (this.winner) this.callbacks.onStatus?.(`${this.winner.name} wins the race!`);
  }

  update(dt) {
    this.readLocalInput();
    this.accumulator += dt;
    while (this.accumulator >= this.fixedStep) {
      this.step(this.fixedStep);
      this.accumulator -= this.fixedStep;
    }
  }

  drawTrack(context) {
    const track = this.track;
    context.fillStyle = track.id === "kitchen" ? "#24743a" : track.id === "garden" ? "#2f6245" : "#4b4a55";
    context.fillRect(0, 0, track.world.width, track.world.height);
    this.drawBackdrop(context, track);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "rgba(255,102,140,.38)";
    context.lineWidth = track.width * 4.6;
    this.strokeLoop(context, track.points);
    context.strokeStyle = "rgba(10,9,18,.58)";
    context.lineWidth = track.width * 4.15;
    this.strokeLoop(context, track.points);
    context.strokeStyle = track.id === "garden" ? "#a88f57" : track.id === "kitchen" ? "#c9b56e" : "#9c9175";
    context.lineWidth = track.width * 3.15;
    this.strokeLoop(context, track.points);
    context.strokeStyle = "rgba(0,0,0,.25)";
    context.lineWidth = track.width + 46;
    this.strokeLoop(context, track.points);
    context.strokeStyle = track.id === "garden" ? "#6d7460" : track.id === "workshop" ? "#817a77" : "#2f9d56";
    context.lineWidth = track.width;
    this.strokeLoop(context, track.points);
    context.strokeStyle = track.id === "kitchen" ? "rgba(236,248,235,.9)" : "rgba(255,255,255,.28)";
    context.lineWidth = 4;
    context.setLineDash([32, 28]);
    this.strokeLoop(context, track.points);
    context.setLineDash([]);
    for (const zone of track.zones) this.drawZone(context, zone);
    this.drawRaceGates(context, track);
    for (const prop of this.props ?? track.props) {
      if (prop.alive === false) continue;
      context.save();
      context.translate(prop.x, prop.y);
      context.rotate(Math.sin(prop.x) * 0.5);
      context.fillStyle = "rgba(255,255,255,.16)";
      context.fillRect(-28, -18, 56, 36);
      context.fillStyle = "rgba(15,18,36,.78)";
      context.font = "900 13px Rubik, sans-serif";
      context.textAlign = "center";
      context.fillText(prop.label, 0, 5);
      context.restore();
    }
  }

  drawBackdrop(context, track) {
    if (track.id === "kitchen") {
      context.strokeStyle = "rgba(255,255,255,.18)";
      context.lineWidth = 8;
      context.strokeRect(140, 120, track.world.width - 280, track.world.height - 240);
      ["#f8f7ff", "#ffd36a", "#ff668c", "#171525"].forEach((color, index) => {
        context.fillStyle = color;
        context.beginPath();
        context.arc(250 + index * 145, 175 + (index % 2) * 48, 34, 0, TAU);
        context.fill();
      });
      return;
    }
    context.strokeStyle = "rgba(255,255,255,.08)";
    context.lineWidth = 3;
    for (let x = 90; x < track.world.width; x += 170) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x - 120, track.world.height);
      context.stroke();
    }
  }

  drawRaceGates(context, track) {
    const local = this.racers?.[this.localSlot] ?? this.racers?.[0] ?? null;
    const center = this.trackCenter();
    track.points.forEach((point, index) => {
      const gate = this.gateSegment(index);
      const sector = this.checkpointSector(index);
      const length = distance(gate.a, gate.b);
      const passed = Boolean(local?.gateProgress?.[index]);
      const nextGate = local && index === local.checkpoint % track.points.length;
      const gateColor = passed ? "#63dcff" : nextGate ? "#4cff7a" : "rgba(255,102,140,.78)";
      const gateGlow = passed ? "rgba(99,220,255,.18)" : nextGate ? "rgba(76,255,122,.18)" : "rgba(255,102,140,.18)";
      const dx = gate.b.x - gate.a.x;
      const dy = gate.b.y - gate.a.y;
      context.save();
      context.translate(center.x, center.y);
      context.fillStyle = nextGate ? gateGlow : gateGlow.replace(".18", ".08");
      context.beginPath();
      context.arc(0, 0, sector.radius + sector.halfRadius, sector.angle - sector.halfAngle, sector.angle + sector.halfAngle);
      context.arc(0, 0, Math.max(12, sector.radius - sector.halfRadius), sector.angle + sector.halfAngle, sector.angle - sector.halfAngle, true);
      context.closePath();
      context.fill();
      context.restore();
      context.save();
      context.translate(gate.a.x, gate.a.y);
      context.rotate(Math.atan2(dy, dx));
      context.lineCap = "round";
      context.strokeStyle = gateGlow;
      context.lineWidth = this.gateHitRadius() * 2;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(length, 0);
      context.stroke();
      if (index === 0) {
        const cells = Math.ceil(length / 18);
        for (let cell = 0; cell < cells; cell += 1) {
          context.fillStyle = cell % 2 ? "#171525" : gateColor;
          context.fillRect(cell * 18, -15, 18, 30);
        }
        context.strokeStyle = gateColor;
        context.lineWidth = 5;
        context.strokeRect(0, -18, length, 36);
        context.fillStyle = gateColor;
        context.font = "900 22px Rubik, sans-serif";
        context.textAlign = "center";
        context.fillText("START / FINISH", length / 2, -28);
      } else {
        context.strokeStyle = gateColor;
        context.lineWidth = nextGate ? 10 : 7;
        context.setLineDash([12, 10]);
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(length, 0);
        context.stroke();
        context.setLineDash([]);
      }
      context.restore();
    });
  }

  strokeLoop(context, points) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.closePath();
    context.stroke();
  }

  drawZone(context, zone) {
    const colors = {
      oil: "rgba(18,18,30,.72)",
      fire: "rgba(255,87,46,.58)",
      boost: "rgba(183,243,74,.45)",
      ramp: "rgba(99,220,255,.38)",
      sand: "rgba(224,195,127,.58)",
      cliff: "rgba(8,9,18,.86)",
    };
    context.fillStyle = colors[zone.type] ?? "rgba(255,255,255,.2)";
    context.beginPath();
    context.arc(zone.x, zone.y, zone.r, 0, TAU);
    context.fill();
    if (zone.type === "cliff") {
      context.strokeStyle = "#ff668c";
      context.lineWidth = 8;
      context.setLineDash([18, 12]);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#ff668c";
      context.font = "900 18px Rubik, sans-serif";
      context.textAlign = "center";
      context.fillText("DROP", zone.x, zone.y + 6);
    } else if (zone.type === "sand") {
      context.fillStyle = "rgba(255,255,255,.22)";
      for (let i = 0; i < 18; i += 1) {
        const angle = i * 2.1;
        const radius = (i * 31) % zone.r;
        context.fillRect(zone.x + Math.cos(angle) * radius, zone.y + Math.sin(angle) * radius, 8, 3);
      }
    } else if (zone.type === "fire") {
      context.fillStyle = "#ffd36a";
      context.font = "900 18px Rubik, sans-serif";
      context.textAlign = "center";
      context.fillText("HEAT", zone.x, zone.y + 6);
    } else if (zone.type === "oil") {
      context.fillStyle = "rgba(255,255,255,.18)";
      context.beginPath();
      context.ellipse(zone.x - zone.r * 0.25, zone.y - zone.r * 0.22, zone.r * 0.25, zone.r * 0.08, -0.4, 0, TAU);
      context.fill();
    }
    if (zone.type === "boost" || zone.type === "ramp") {
      context.strokeStyle = zone.type === "boost" ? "#b7f34a" : "#63dcff";
      context.lineWidth = 7;
      context.beginPath();
      context.moveTo(zone.x - 34, zone.y);
      context.lineTo(zone.x + 34, zone.y);
      context.stroke();
    }
  }

  drawWorld(context) {
    if (!this.track) return;
    const local = this.racers?.[this.localSlot] ?? this.racers?.[0] ?? { x: this.track.world.width / 2, y: this.track.world.height / 2, angle: 0 };
    this.camera.x = lerp(this.camera.x || local.x, local.x + Math.cos(local.angle) * 90, 0.08);
    this.camera.y = lerp(this.camera.y || local.y, local.y + Math.sin(local.angle) * 90, 0.08);
    this.camera.zoom = lerp(this.camera.zoom, 0.88, 0.05);
    context.save();
    context.translate(480, 282);
    context.scale(this.camera.zoom, this.camera.zoom);
    context.translate(-this.camera.x, -this.camera.y);
    this.drawTrack(context);
    this.drawDynamicWorld(context);
    context.restore();
  }

  drawDynamicWorld(context) {
    this.drawRocketCone(context);
    for (const pickup of this.pickups ?? []) {
      if (pickup.respawn > 0) continue;
      context.save();
      context.translate(pickup.x, pickup.y);
      context.rotate(this.tick * 0.04);
      this.drawItemIcon(context, pickup.item, 0, 0, 36);
      context.restore();
    }
    for (const hazard of this.hazards ?? []) {
      if (hazard.type === "oil" || hazard.type === "spikes" || hazard.type === "shock") {
        context.fillStyle = hazard.type === "oil" ? "rgba(5,6,14,.82)" : hazard.type === "shock" ? "rgba(148,120,255,.6)" : "rgba(220,220,230,.72)";
        context.beginPath();
        context.arc(hazard.x, hazard.y, hazard.r, 0, TAU);
        context.fill();
      }
    }
    for (const projectile of this.projectiles ?? []) {
      context.fillStyle = projectile.type === "rocket" ? "#ff668c" : "#fff3ad";
      context.beginPath();
      context.arc(projectile.x, projectile.y, projectile.r, 0, TAU);
      context.fill();
    }
    for (const racer of this.racers ?? []) this.drawRacer(context, racer);
  }

  drawRocketCone(context) {
    const racer = this.racers?.[this.localSlot];
    if (!racer || racer.item !== "rocket" || racer.respawn > 0 || racer.finished) return;
    context.save();
    context.translate(racer.x, racer.y);
    context.rotate(racer.angle);
    context.fillStyle = "rgba(255,102,140,.18)";
    context.strokeStyle = "rgba(255,102,140,.68)";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(22, 0);
    context.lineTo(520, -330);
    context.arc(22, 0, 610, -0.56, 0.56);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = "#ff668c";
    context.font = "900 16px Rubik, sans-serif";
    context.textAlign = "center";
    context.fillText("LOCK", 250, 0);
    context.restore();
  }

  drawItemIcon(context, item, x, y, size = 34) {
    const radius = size / 2;
    const color = {
      spikes: "#dfe3ef",
      oil: "#171525",
      rocket: "#ff668c",
      machinegun: "#ffd36a",
      shock: "#9478ff",
      boost: "#b7f34a",
    }[item] ?? "#b7f34a";
    context.save();
    context.translate(x, y);
    context.fillStyle = color;
    context.strokeStyle = "#171525";
    context.lineWidth = 4;
    context.beginPath();
    context.roundRect(-radius, -radius, size, size, 8);
    context.fill();
    context.stroke();
    context.fillStyle = item === "oil" ? "#f8f7ff" : "#171525";
    context.font = `900 ${Math.round(size * 0.52)}px Rubik, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(ITEM_ICONS[item] ?? "?", 0, 1);
    context.restore();
  }

  drawRacer(context, racer) {
    if (racer.respawn > 0 && Math.floor(racer.respawn * 10) % 2) return;
    context.save();
    context.translate(racer.x, racer.y);
    context.rotate(racer.angle);
    const alpha = racer.invulnerable > 0 ? 0.62 : 1;
    context.globalAlpha = alpha;
    context.fillStyle = "rgba(0,0,0,.28)";
    context.beginPath();
    context.ellipse(0, 4, 24, 15, 0, 0, TAU);
    context.fill();
    context.fillStyle = racer.color;
    context.beginPath();
    context.moveTo(24, 0);
    context.quadraticCurveTo(13, -15, -11, -13);
    context.quadraticCurveTo(-25, -8, -25, 0);
    context.quadraticCurveTo(-25, 8, -11, 13);
    context.quadraticCurveTo(13, 15, 24, 0);
    context.fill();
    context.strokeStyle = "#171525";
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = "#f8f7ff";
    context.beginPath();
    context.roundRect(0, -8, 13, 16, 5);
    context.fill();
    context.fillStyle = "#171525";
    context.fillRect(-14, -16, 9, 5);
    context.fillRect(-14, 11, 9, 5);
    context.fillRect(8, -16, 9, 5);
    context.fillRect(8, 11, 9, 5);
    if (racer.miniBoost > 0) {
      context.fillStyle = "#ffd36a";
      context.beginPath();
      context.moveTo(-25, 0);
      context.lineTo(-43, -8);
      context.lineTo(-37, 0);
      context.lineTo(-43, 8);
      context.closePath();
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
    context.textAlign = "center";
    context.font = "900 12px Rubik, sans-serif";
    context.fillStyle = "rgba(15,18,36,.72)";
    context.fillRect(racer.x - 32, racer.y - 47, 64, 18);
    context.fillStyle = racer.color;
    context.fillText(`${Math.max(0, Math.round(racer.hp))}`, racer.x, racer.y - 34);
  }

  drawHud(context) {
    const local = this.racers?.[this.localSlot] ?? null;
    context.fillStyle = "rgba(15,18,36,.78)";
    context.fillRect(16, 16, 282, 88);
    context.fillStyle = "#f8f7ff";
    context.font = "900 17px Rubik, sans-serif";
    context.fillText(local ? `${local.name}  Lap ${Math.min(3, local.lap + 1)} / 3` : "Spectating", 32, 45);
    context.fillStyle = "#aaa7bd";
    context.font = "800 12px Rubik, sans-serif";
    context.fillText(local ? "Item" : "Waiting for next race", 32, 72);
    if (local?.item) {
      this.drawItemIcon(context, local.item, 118, 68, 34);
      context.fillStyle = "#f8f7ff";
      context.font = "900 12px Rubik, sans-serif";
      context.textAlign = "left";
      context.textBaseline = "alphabetic";
      context.fillText(ITEM_LABELS[local.item], 144, 73);
    } else if (local) {
      context.fillStyle = "#aaa7bd";
      context.fillText("Empty", 88, 72);
    }
    const ranking = [...(this.racers ?? [])].sort((a, b) => {
      if (a.finishPosition && b.finishPosition) return a.finishPosition - b.finishPosition;
      if (a.finishPosition) return -1;
      if (b.finishPosition) return 1;
      return (b.lap - a.lap) || (b.checkpoint - a.checkpoint) || ((b.lastProgress ?? 0) - (a.lastProgress ?? 0));
    });
    context.fillStyle = "rgba(15,18,36,.65)";
    context.fillRect(706, 16, 238, 124);
    ranking.forEach((racer, index) => {
      const trophy = racer.finishPosition === 1 ? "🏆" : racer.finishPosition === 2 ? "🥈" : racer.finishPosition === 3 ? "🥉" : racer.finishPosition ? "✓" : `${index + 1}.`;
      context.fillStyle = racer.color;
      context.font = "900 12px Rubik, sans-serif";
      context.fillText(`${trophy} ${racer.name}  L${Math.min(3, racer.lap + 1)}`, 722, 43 + index * 24);
    });
    if (this.feedbackTime > 0) {
      context.fillStyle = "#b7f34a";
      context.font = "900 26px Rubik, sans-serif";
      context.textAlign = "center";
      context.fillText(this.feedback, 480, 96);
    }
    if (this.winner) {
      context.fillStyle = "rgba(21,20,37,.82)";
      context.fillRect(310, 216, 340, 108);
      context.fillStyle = "#b7f34a";
      context.font = "900 34px Rubik, sans-serif";
      context.textAlign = "center";
      context.fillText(`${this.winner.name} wins!`, 480, 276);
    }
    context.globalAlpha = 0.8;
    context.fillStyle = "rgba(255,255,255,.22)";
    context.beginPath();
    context.arc(112, 442, 58, 0, TAU);
    context.fill();
    context.fillStyle = "rgba(255,102,140,.72)";
    context.beginPath();
    context.arc(850, 382, 42, 0, TAU);
    context.fill();
    context.fillStyle = "rgba(99,220,255,.72)";
    context.beginPath();
    context.arc(850, 482, 42, 0, TAU);
    context.fill();
    context.fillStyle = "#fff";
    context.font = "900 13px Rubik, sans-serif";
    context.textAlign = "center";
    context.fillText("FIRE", 850, 387);
    context.fillText("BRAKE", 850, 487);
    context.globalAlpha = 1;
  }

  draw() {
    const context = this.context;
    context.clearRect(0, 0, 960, 540);
    if (this.state === "maps") {
      context.fillStyle = "#171525";
      context.fillRect(0, 0, 960, 540);
      return;
    }
    this.drawWorld(context);
    this.drawHud(context);
    this.feedbackTime = Math.max(0, this.feedbackTime - 1 / 60);
  }

  loop(time) {
    if (!this.running) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.update(dt);
    this.draw();
    this.frame = requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.root.classList.remove("is-active");
    this.root.replaceChildren();
  }
}
