import { RealtimeSnapshotChannel } from "../core/realtime-netcode.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const WIDTH = 1280;
const HEIGHT = 720;
const LANES = [205, 360, 515];
const BASE_X = [82, WIDTH - 82];
const CENTER_X = WIDTH / 2;
const UNIT_RADIUS = 18;
const RESOURCE_RADIUS = 70;
const GOLD_CAP = 360;
const PLAYER_COLORS = ["#59d9ff", "#ff6b8c"];

const UNIT_TYPES = {
  guard: {
    label: "Guard",
    emoji: "🛡️",
    key: "Q",
    cost: 62,
    hp: 285,
    damage: 22,
    buildingDamageMultiplier: 0.72,
    range: 30,
    cooldown: 0.95,
    speed: 32,
    armor: 10,
    sight: 150,
    pop: 2,
    strong: "ranger",
    weak: "mage",
  },
  ranger: {
    label: "Ranger",
    emoji: "🏹",
    key: "W",
    cost: 56,
    hp: 138,
    damage: 22,
    buildingDamageMultiplier: 0.24,
    range: 116,
    cooldown: 0.82,
    speed: 44,
    armor: 3,
    sight: 190,
    pop: 1,
    strong: "mage",
    weak: "guard",
  },
  mage: {
    label: "Mage",
    emoji: "🧙",
    key: "E",
    cost: 74,
    hp: 112,
    damage: 42,
    buildingDamageMultiplier: 0.48,
    range: 132,
    cooldown: 1.45,
    speed: 34,
    armor: 1,
    sight: 185,
    splash: 34,
    pierce: 0.5,
    pop: 2,
    strong: "guard",
    weak: "ranger",
  },
  scout: {
    label: "Scout",
    emoji: "🦅",
    key: "R",
    cost: 34,
    hp: 72,
    damage: 8,
    buildingDamageMultiplier: 0.18,
    range: 26,
    cooldown: 0.75,
    speed: 74,
    armor: 0,
    sight: 280,
    pop: 1,
  },
  ram: {
    label: "Ram",
    emoji: "🪵",
    key: "T",
    cost: 138,
    hp: 380,
    damage: 18,
    buildingDamage: 112,
    range: 46,
    cooldown: 1.75,
    speed: 23,
    armor: 6,
    sight: 145,
    pop: 4,
  },
};

const COUNTER_DAMAGE = {
  guard: { ranger: 1.32, mage: 0.76 },
  ranger: { mage: 1.35, guard: 0.76 },
  mage: { guard: 1.42, ranger: 0.72 },
};

const UPGRADE_DEFS = {
  unitAttack: { label: "Blades", key: "A", baseCost: 120, scale: 1.55, max: 4 },
  unitArmor: { label: "Armor", key: "S", baseCost: 110, scale: 1.52, max: 4 },
  towerDamage: { label: "Tower", key: "D", baseCost: 135, scale: 1.6, max: 4 },
  towerSight: { label: "Sight", key: "F", baseCost: 90, scale: 1.45, max: 3 },
};

function upgradeCost(state, side, id) {
  const def = UPGRADE_DEFS[id];
  const level = state.players[side].upgrades[id] ?? 0;
  return Math.round(def.baseCost * (def.scale ** level));
}

function makeInitialState(humanSlots = []) {
  const towers = [];
  for (let side = 0; side < 2; side += 1) {
    LANES.forEach((y, lane) => {
      const xs = side === 0 ? [270, 420, 570] : [1010, 860, 710];
      xs.forEach((x, index) => {
        const outerness = side === 0 ? index : 2 - index;
        towers.push({
          id: `t-${side}-${lane}-${index}`,
          side,
          lane,
          x,
          y,
          hp: 1220 + outerness * 170,
          maxHp: 1220 + outerness * 170,
          damage: 58 + outerness * 8,
          range: 218,
          sight: 210,
          cooldown: 0,
        });
      });
    });
  }
  return {
    kind: "fantasy-lanes",
    phase: "playing",
    time: 0,
    tick: 0,
    winner: null,
    units: [],
    towers,
    mines: LANES.map((y, lane) => ({ id: `mine-${lane}`, lane, x: CENTER_X, y, owner: null, progress: 0 })),
    players: [0, 1].map((side) => ({
      side,
      gold: 260,
      income: 10,
      pop: 0,
      popCap: 62,
      base: { hp: 5000, maxHp: 5000, x: BASE_X[side], y: 360, sight: 300, cooldown: 0 },
      upgrades: { unitAttack: 0, unitArmor: 0, towerDamage: 0, towerSight: 0 },
      bounty: 0,
      name: side === 0 ? "Azure Keep" : "Crimson Keep",
    })),
    humanSlots,
    revision: Date.now(),
    serial: 1,
    log: "Build a mixed army, take the center springs, and break the enemy base.",
  };
}

function compactState(state) {
  return JSON.parse(JSON.stringify(state));
}

function laneThreat(state, side, lane) {
  return state.units
    .filter((unit) => unit.side !== side && unit.lane === lane)
    .reduce((sum, unit) => sum + unit.hp + UNIT_TYPES[unit.type].cost * 0.8, 0);
}

export class FantasyLanesGame {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.network = callbacks.network ?? null;
    this.netcode = new RealtimeSnapshotChannel({ network: this.network, kind: "fantasy-lanes", playerId: "solo" });
    this.networkRole = this.netcode.role;
    this.playerId = this.netcode.playerId;
    this.localSide = this.networkRole === "guest" ? 1 : 0;
    this.state = makeInitialState(this.resolveHumanSlots());
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.fixedStep = 1 / 30;
    this.running = true;
    this.commandSeq = 0;
    this.pendingCommands = [];
    this.lastCommandByPlayer = new Map();
    this.selectedType = "guard";
    this.selectedLane = 1;
    this.botCooldown = 1.2;
    this.botUpgradeCooldown = 4;
    this.snapshotTimer = 0;
    this.mouse = { x: 0, y: 0 };
    this.root.classList.add("is-active");
    this.buildShell();
    this.bindEvents();
    this.resize();
    if (this.networkRole === "host") this.publishSnapshot(true);
    this.callbacks.onStatus?.("Train counters, upgrade wisely, and fight for the center springs.");
    this.frame = requestAnimationFrame((time) => this.loop(time));
  }

  buildShell() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.canvas.className = "fantasy-canvas";
    this.context = this.canvas.getContext("2d");
    this.hud = document.createElement("div");
    this.hud.className = "fantasy-hud";
    this.hud.innerHTML = `
      <div class="fantasy-readout"><small>Gold</small><strong data-gold>0</strong></div>
      <div class="fantasy-readout"><small>Income</small><strong data-income>0/s</strong></div>
      <div class="fantasy-readout"><small>Pop</small><strong data-pop>0/0</strong></div>
      <div class="fantasy-readout"><small>Bases</small><strong data-bases>100% / 100%</strong></div>
    `;
    this.controls = document.createElement("div");
    this.controls.className = "fantasy-controls";
    this.unitButtons = {};
    Object.entries(UNIT_TYPES).forEach(([id, unit]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.unit = id;
      button.innerHTML = `<strong>${unit.key}</strong><span>${unit.label}</span><small>${unit.cost}g</small>`;
      button.addEventListener("click", () => { this.selectedType = id; this.refreshControls(); });
      this.unitButtons[id] = button;
      this.controls.append(button);
    });
    this.laneButtons = [];
    ["Top", "Mid", "Bot"].forEach((label, lane) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.lane = String(lane);
      button.innerHTML = `<strong>${lane + 1}</strong><span>${label}</span>`;
      button.addEventListener("click", () => this.issueCommand({ kind: "spawn", type: this.selectedType, lane }));
      this.laneButtons.push(button);
      this.controls.append(button);
    });
    Object.entries(UPGRADE_DEFS).forEach(([id, def]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.upgrade = id;
      button.innerHTML = `<strong>${def.key}</strong><span>${def.label}</span><small data-cost></small>`;
      button.addEventListener("click", () => this.issueCommand({ kind: "upgrade", upgrade: id }));
      this.controls.append(button);
    });
    this.overlay = document.createElement("div");
    this.overlay.className = "fantasy-result";
    this.overlay.hidden = true;
    this.overlay.innerHTML = `<strong data-result-title></strong><span data-result-copy></span>`;
    this.root.replaceChildren(this.canvas, this.hud, this.controls, this.overlay);
    this.goldEl = this.hud.querySelector("[data-gold]");
    this.incomeEl = this.hud.querySelector("[data-income]");
    this.popEl = this.hud.querySelector("[data-pop]");
    this.basesEl = this.hud.querySelector("[data-bases]");
    this.resultTitle = this.overlay.querySelector("[data-result-title]");
    this.resultCopy = this.overlay.querySelector("[data-result-copy]");
    this.refreshControls();
  }

  bindEvents() {
    this.onResize = () => this.resize();
    this.onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const unit = Object.entries(UNIT_TYPES).find(([, value]) => value.key.toLowerCase() === key);
      if (unit) {
        this.selectedType = unit[0];
        this.refreshControls();
        event.preventDefault();
        return;
      }
      if (["1", "2", "3"].includes(key)) {
        this.issueCommand({ kind: "spawn", type: this.selectedType, lane: Number(key) - 1 });
        event.preventDefault();
        return;
      }
      const upgrade = Object.entries(UPGRADE_DEFS).find(([, value]) => value.key.toLowerCase() === key);
      if (upgrade) {
        this.issueCommand({ kind: "upgrade", upgrade: upgrade[0] });
        event.preventDefault();
      }
    };
    this.onPointerMove = (event) => {
      const point = this.canvasPoint(event);
      this.mouse.x = point.x;
      this.mouse.y = point.y;
    };
    this.onPointerDown = (event) => {
      const point = this.canvasPoint(event);
      const lane = LANES.reduce((best, y, index) => Math.abs(point.y - y) < Math.abs(point.y - LANES[best]) ? index : best, 0);
      this.issueCommand({ kind: "spawn", type: this.selectedType, lane });
    };
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
  }

  canvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * WIDTH / rect.width,
      y: (event.clientY - rect.top) * HEIGHT / rect.height,
    };
  }

  resize() {
    const rect = this.root.getBoundingClientRect();
    const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
    this.canvas.style.width = `${WIDTH * scale}px`;
    this.canvas.style.height = `${HEIGHT * scale}px`;
  }

  resolveHumanSlots() {
    if (!this.network) return [{ playerId: "solo", side: 0, name: "You" }];
    return (this.network.getPlayers?.() ?? []).slice(0, 2).map((player, side) => ({
      playerId: player.id,
      side,
      name: player.name ?? (side === 0 ? "Host" : "Player 2"),
    }));
  }

  issueCommand(command) {
    if (this.state.winner) return;
    const full = { ...command, side: this.localSide, seq: ++this.commandSeq, playerId: this.playerId };
    if (!this.network || this.networkRole === "host") {
      this.pendingCommands.push(full);
      if (this.networkRole === "host") this.lastCommandByPlayer.set(this.playerId, full.seq);
    }
    if (this.network) this.netcode.sendInput({ command: full });
  }

  processNetworkInputs() {
    if (!this.network || this.networkRole !== "host") return;
    const slots = this.resolveHumanSlots();
    this.state.humanSlots = slots;
    const sideByPlayer = new Map(slots.map((slot) => [slot.playerId, slot.side]));
    this.netcode.getInputs().forEach(({ playerId, value }) => {
      const command = value?.command;
      const side = sideByPlayer.get(playerId);
      if (!command || side === undefined) return;
      const lastSeq = this.lastCommandByPlayer.get(playerId) ?? 0;
      if (command.seq <= lastSeq) return;
      this.lastCommandByPlayer.set(playerId, command.seq);
      this.pendingCommands.push({ ...command, side, playerId });
    });
  }

  applyCommand(command) {
    const player = this.state.players[command.side];
    if (!player || this.state.winner) return;
    if (command.kind === "spawn") {
      const type = UNIT_TYPES[command.type];
      if (!type || command.lane < 0 || command.lane > 2) return;
      if (player.gold < type.cost || player.pop + type.pop > player.popCap) return;
      player.gold -= type.cost;
      player.pop += type.pop;
      const side = command.side;
      this.state.units.push({
        id: `u-${this.state.serial++}`,
        side,
        type: command.type,
        lane: command.lane,
        x: BASE_X[side] + (side === 0 ? 34 : -34),
        y: LANES[command.lane] + (Math.random() - 0.5) * 18,
        hp: type.hp * (1 + player.upgrades.unitArmor * 0.08),
        maxHp: type.hp * (1 + player.upgrades.unitArmor * 0.08),
        cooldown: Math.random() * 0.25,
        bountyValue: type.cost,
      });
      this.state.log = `${player.name} trained ${type.label} on lane ${command.lane + 1}.`;
      return;
    }
    if (command.kind === "upgrade") {
      const def = UPGRADE_DEFS[command.upgrade];
      if (!def) return;
      const level = player.upgrades[command.upgrade] ?? 0;
      if (level >= def.max) return;
      const cost = upgradeCost(this.state, command.side, command.upgrade);
      if (player.gold < cost) return;
      player.gold -= cost;
      player.upgrades[command.upgrade] = level + 1;
      this.state.log = `${player.name} upgraded ${def.label} to ${level + 2}.`;
    }
  }

  step(dt) {
    if (this.networkRole === "guest") return;
    this.processNetworkInputs();
    while (this.pendingCommands.length) this.applyCommand(this.pendingCommands.shift());
    this.updateEconomy(dt);
    this.updateMines(dt);
    this.updateBot(dt);
    this.updateUnits(dt);
    this.updateTowers(dt);
    this.updateBases(dt);
    this.cleanupDead();
    this.checkWinner();
    this.state.time += dt;
    this.state.tick += 1;
  }

  updateEconomy(dt) {
    const hp = this.state.players.map((p) => p.base.hp / p.base.maxHp);
    const towerCount = this.state.players.map((_, side) => this.state.towers.filter((tower) => tower.side === side && tower.hp > 0).length);
    for (const player of this.state.players) {
      const mineIncome = this.state.mines.filter((mine) => mine.owner === player.side).length * 4.5;
      const behindBase = hp[player.side] < hp[1 - player.side] - 0.12 ? 2.4 : 0;
      const behindTowers = towerCount[player.side] < towerCount[1 - player.side] ? 1.8 : 0;
      player.income = 10 + mineIncome + behindBase + behindTowers;
      player.gold = Math.min(GOLD_CAP, player.gold + player.income * dt);
    }
  }

  updateMines(dt) {
    for (const mine of this.state.mines) {
      const presence = [0, 1].map((side) => this.state.units
        .filter((unit) => unit.side === side && unit.lane === mine.lane && distance(unit, mine) <= RESOURCE_RADIUS)
        .reduce((sum, unit) => sum + UNIT_TYPES[unit.type].pop, 0));
      if (presence[0] === presence[1]) {
        mine.progress *= Math.max(0, 1 - dt * 1.4);
        continue;
      }
      const owner = presence[0] > presence[1] ? 0 : 1;
      mine.progress += dt * (0.32 + Math.abs(presence[0] - presence[1]) * 0.05);
      if (mine.progress >= 1) {
        mine.owner = owner;
        mine.progress = 0.35;
      }
    }
  }

  updateBot(dt) {
    const enemyHuman = this.state.humanSlots.some((slot) => slot.side === 1);
    if (this.network && enemyHuman) return;
    this.botCooldown -= dt;
    this.botUpgradeCooldown -= dt;
    if (this.botUpgradeCooldown <= 0) {
      this.botUpgradeCooldown = 7 + Math.random() * 4;
      const options = ["unitAttack", "unitArmor", "towerDamage", "towerSight"].filter((id) => {
        const def = UPGRADE_DEFS[id];
        return this.state.players[1].upgrades[id] < def.max && this.state.players[1].gold >= upgradeCost(this.state, 1, id);
      });
      if (options.length) this.applyCommand({ kind: "upgrade", side: 1, upgrade: options[Math.floor(Math.random() * options.length)] });
    }
    if (this.botCooldown > 0) return;
    const laneScores = LANES.map((_, lane) => laneThreat(this.state, 1, lane) - laneThreat(this.state, 0, lane) * 0.55 + Math.random() * 90);
    const lane = laneScores.indexOf(Math.max(...laneScores));
    const seen = this.state.units.filter((unit) => unit.side === 0 && unit.lane === lane);
    const counts = Object.fromEntries(Object.keys(UNIT_TYPES).map((key) => [key, seen.filter((unit) => unit.type === key).length]));
    let type = "guard";
    if (counts.guard > counts.ranger && counts.guard >= counts.mage) type = "mage";
    else if (counts.mage > counts.guard) type = "ranger";
    else if (this.state.time > 90 && Math.random() < 0.22) type = "ram";
    else if (Math.random() < 0.16) type = "scout";
    this.applyCommand({ kind: "spawn", side: 1, type, lane });
    this.botCooldown = 0.85 + Math.random() * 1.1;
  }

  updateUnits(dt) {
    for (const unit of this.state.units) {
      if (unit.hp <= 0) continue;
      unit.cooldown = Math.max(0, unit.cooldown - dt);
      const type = UNIT_TYPES[unit.type];
      const dir = unit.side === 0 ? 1 : -1;
      const enemies = this.state.units.filter((other) => other.side !== unit.side && other.lane === unit.lane && other.hp > 0);
      const enemyTowers = this.state.towers.filter((tower) => tower.side !== unit.side && tower.lane === unit.lane && tower.hp > 0);
      const enemyBase = this.state.players[1 - unit.side].base;
      const target = enemies.find((other) => Math.abs(other.x - unit.x) <= type.range + UNIT_RADIUS)
        ?? enemyTowers.find((tower) => Math.abs(tower.x - unit.x) <= type.range + 26)
        ?? (Math.abs(enemyBase.x - unit.x) <= type.range + 48 ? enemyBase : null);
      if (target) {
        if (unit.cooldown <= 0) {
          this.damageTarget(unit, target);
          unit.cooldown = type.cooldown;
        }
        continue;
      }
      const blocker = enemies.find((other) => Math.abs(other.x - unit.x) < UNIT_RADIUS * 1.8);
      if (!blocker) unit.x += dir * type.speed * dt;
      unit.y += (LANES[unit.lane] - unit.y) * clamp(dt * 4, 0, 1);
    }
  }

  damageTarget(unit, target) {
    const type = UNIT_TYPES[unit.type];
    const player = this.state.players[unit.side];
    const isBuilding = !target.type;
    let damage = isBuilding ? (type.buildingDamage ?? type.damage) : type.damage;
    if (isBuilding && !type.buildingDamage) damage *= type.buildingDamageMultiplier ?? 0.6;
    damage *= 1 + player.upgrades.unitAttack * 0.1;
    if (!isBuilding && target.type) damage *= COUNTER_DAMAGE[unit.type]?.[target.type] ?? 1;
    const armor = target.type ? (UNIT_TYPES[target.type].armor + this.state.players[target.side].upgrades.unitArmor * 2) : 8;
    const pierce = type.pierce ?? 0;
    target.hp -= Math.max(3, damage - armor * (1 - pierce));
    if (type.splash && target.type) {
      this.state.units
        .filter((other) => other !== target && other.side === target.side && other.lane === target.lane && distance(other, target) <= type.splash)
        .forEach((other) => { other.hp -= Math.max(2, damage * 0.32 - UNIT_TYPES[other.type].armor); });
    }
  }

  updateTowers(dt) {
    for (const tower of this.state.towers) {
      if (tower.hp <= 0) continue;
      const owner = this.state.players[tower.side];
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      tower.sight = 210 + owner.upgrades.towerSight * 38;
      const target = this.state.units
        .filter((unit) => unit.side !== tower.side && unit.lane === tower.lane && unit.hp > 0 && distance(unit, tower) <= tower.range)
        .sort((a, b) => distance(a, tower) - distance(b, tower))[0];
      if (!target || tower.cooldown > 0) continue;
      const homeBonus = tower.side === 0 ? clamp((tower.x - CENTER_X) / -420, 0, 0.28) : clamp((CENTER_X - tower.x) / -420, 0, 0.28);
      target.hp -= tower.damage * (1 + owner.upgrades.towerDamage * 0.14 + homeBonus);
      tower.cooldown = 1.05;
    }
  }

  updateBases(dt) {
    for (const player of this.state.players) {
      const base = player.base;
      base.cooldown = Math.max(0, base.cooldown - dt);
      const target = this.state.units
        .filter((unit) => unit.side !== player.side && unit.hp > 0 && distance(unit, base) <= 220)
        .sort((a, b) => distance(a, base) - distance(b, base))[0];
      if (!target || base.cooldown > 0) continue;
      const comeback = base.hp < base.maxHp * 0.45 ? 1.55 : 1;
      target.hp -= 52 * comeback;
      base.cooldown = 0.9;
    }
  }

  cleanupDead() {
    for (const tower of this.state.towers) {
      if (tower.hp > 0 || tower.deadPaid) continue;
      tower.deadPaid = true;
      const killerSide = 1 - tower.side;
      this.state.players[killerSide].gold += 115;
      this.state.log = `${this.state.players[killerSide].name} destroyed a tower on lane ${tower.lane + 1}.`;
    }
    this.state.units = this.state.units.filter((unit) => {
      if (unit.hp > 0) return true;
      this.state.players[unit.side].pop = Math.max(0, this.state.players[unit.side].pop - UNIT_TYPES[unit.type].pop);
      const enemy = this.state.players[1 - unit.side];
      const enemyBaseRatio = enemy.base.hp / enemy.base.maxHp;
      const bounty = unit.bountyValue * (enemyBaseRatio < 0.55 ? 0.34 : 0.24);
      enemy.gold += bounty;
      return false;
    });
  }

  checkWinner() {
    if (this.state.winner) return;
    for (const player of this.state.players) {
      if (player.base.hp > 0) continue;
      this.state.winner = 1 - player.side;
      this.state.phase = "finished";
      this.state.log = `${this.state.players[1 - player.side].name} wins.`;
    }
  }

  publishSnapshot(force = false) {
    if (!this.network || this.networkRole !== "host") return;
    this.netcode.publish({ ...compactState(this.state), revision: force ? Date.now() : this.state.tick });
  }

  applyNetworkSnapshot(snapshot) {
    if (this.networkRole !== "guest" || !snapshot || snapshot.kind !== "fantasy-lanes") return;
    if (!Array.isArray(snapshot.players) || !Array.isArray(snapshot.units)) return;
    this.state = compactState(snapshot);
    const slot = this.state.humanSlots?.find((entry) => entry.playerId === this.playerId);
    this.localSide = slot?.side ?? 1;
    this.refreshControls();
  }

  update(dt) {
    this.accumulator += dt;
    while (this.accumulator >= this.fixedStep) {
      this.step(this.fixedStep);
      this.accumulator -= this.fixedStep;
    }
    if (this.networkRole === "host") {
      this.snapshotTimer -= dt;
      if (this.snapshotTimer <= 0) {
        this.snapshotTimer = 0.1;
        this.publishSnapshot();
      }
    }
    this.refreshHud();
  }

  refreshControls() {
    Object.entries(this.unitButtons ?? {}).forEach(([id, button]) => {
      button.classList.toggle("is-selected", id === this.selectedType);
    });
    const player = this.state?.players?.[this.localSide];
    this.controls?.querySelectorAll("[data-upgrade]").forEach((button) => {
      const id = button.dataset.upgrade;
      const level = player?.upgrades?.[id] ?? 0;
      const def = UPGRADE_DEFS[id];
      const cost = level >= def.max ? "MAX" : `${upgradeCost(this.state, this.localSide, id)}g`;
      button.querySelector("[data-cost]").textContent = `Lv ${level} ${cost}`;
    });
  }

  refreshHud() {
    const player = this.state.players[this.localSide] ?? this.state.players[0];
    this.goldEl.textContent = `${Math.floor(player.gold)}/${GOLD_CAP}g`;
    this.incomeEl.textContent = `${player.income.toFixed(1)}/s`;
    this.popEl.textContent = `${player.pop}/${player.popCap}`;
    this.basesEl.textContent = `${Math.max(0, Math.round(this.state.players[this.localSide].base.hp / 50))}% / ${Math.max(0, Math.round(this.state.players[1 - this.localSide].base.hp / 50))}%`;
    this.refreshControls();
    if (this.state.winner !== null) {
      this.overlay.hidden = false;
      this.resultTitle.textContent = this.state.winner === this.localSide ? "Victory" : "Defeat";
      this.resultCopy.textContent = "Close the match and launch again for a fresh duel.";
    }
  }

  draw() {
    const ctx = this.context;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.drawMap(ctx);
    this.drawMines(ctx);
    this.drawBases(ctx);
    this.drawTowers(ctx);
    this.drawUnits(ctx);
    this.drawTopText(ctx);
  }

  drawMap(ctx) {
    const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    grad.addColorStop(0, "#7fd78a");
    grad.addColorStop(0.5, "#9ce07f");
    grad.addColorStop(1, "#7fd78a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const tile = 46;
    for (let y = 0; y < HEIGHT; y += tile) {
      for (let x = 0; x < WIDTH; x += tile) {
        ctx.fillStyle = ((x / tile + y / tile) % 2) ? "rgba(255,255,255,.08)" : "rgba(58,138,58,.08)";
        ctx.fillRect(x, y, tile, tile);
      }
    }

    ctx.fillStyle = "#68c5e8";
    ctx.fillRect(CENTER_X - 40, 74, 80, HEIGHT - 148);
    ctx.fillStyle = "rgba(255,255,255,.28)";
    for (let y = 100; y < HEIGHT - 100; y += 58) {
      ctx.beginPath();
      ctx.ellipse(CENTER_X - 17, y, 20, 6, -0.25, 0, Math.PI * 2);
      ctx.ellipse(CENTER_X + 22, y + 28, 17, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawArenaDecor(ctx);

    LANES.forEach((y, lane) => {
      ctx.strokeStyle = lane === 1 ? "#d9bc7d" : "#cfae70";
      ctx.lineWidth = 44;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(110, y);
      ctx.lineTo(WIDTH - 110, y);
      ctx.stroke();

      ctx.fillStyle = "#b57b4a";
      ctx.strokeStyle = "#6d4a31";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(CENTER_X - 64, y - 27, 128, 54, 8);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,235,175,.55)";
      ctx.lineWidth = 2;
      for (let plank = -44; plank <= 44; plank += 22) {
        ctx.beginPath();
        ctx.moveTo(CENTER_X + plank, y - 24);
        ctx.lineTo(CENTER_X + plank, y + 24);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(80,57,34,.36)";
      ctx.lineWidth = 2;
      ctx.setLineDash([22, 18]);
      ctx.beginPath();
      ctx.moveTo(130, y);
      ctx.lineTo(WIDTH - 130, y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  drawArenaDecor(ctx) {
    ctx.fillStyle = "rgba(33,92,45,.45)";
    [[46, 84, 60, 170], [42, 468, 62, 166], [1172, 84, 60, 170], [1176, 468, 62, 166]].forEach(([x, y, w, h]) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 16);
      ctx.fill();
    });
    ctx.fillStyle = "#b6b2a2";
    [[130, 84], [188, 638], [1088, 84], [1148, 638], [55, 320], [1216, 388]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, 24, 17, Math.sin(x) * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(75,70,62,.35)";
      ctx.lineWidth = 3;
      ctx.stroke();
    });
    ctx.strokeStyle = "rgba(92,59,34,.7)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    [[125, 118, 230, 118], [1048, 118, 1155, 118], [125, 604, 230, 604], [1048, 604, 1155, 604]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  }

  drawMines(ctx) {
    for (const mine of this.state.mines) {
      ctx.fillStyle = mine.owner === null ? "rgba(255,255,255,.22)" : PLAYER_COLORS[mine.owner];
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#171525";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "#171525";
      ctx.font = "900 15px Rubik, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+4.5", mine.x, mine.y + 5);
    }
  }

  drawBases(ctx) {
    this.state.players.forEach((player) => {
      const base = player.base;
      ctx.fillStyle = "rgba(20,22,30,.25)";
      ctx.beginPath();
      ctx.ellipse(base.x, base.y + 90, 70, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = player.side === 0 ? "#4ea8de" : "#eb5879";
      ctx.beginPath();
      ctx.roundRect(base.x - 50, base.y - 80, 100, 158, 12);
      ctx.fill();
      ctx.fillStyle = "#f3d37b";
      ctx.beginPath();
      ctx.roundRect(base.x - 32, base.y - 108, 64, 44, 8);
      ctx.fill();
      ctx.fillStyle = "#30314a";
      ctx.fillRect(base.x - 20, base.y - 48, 40, 52);
      ctx.strokeStyle = "#263244";
      ctx.lineWidth = 7;
      ctx.stroke();
      this.drawCrown(ctx, base.x, base.y - 86, 1.15);
      this.drawBar(ctx, base.x - 55, base.y - 112, 110, 12, base.hp / base.maxHp, "#b7f34a");
    });
  }

  drawTowers(ctx) {
    for (const tower of this.state.towers) {
      if (tower.hp <= 0) {
        ctx.fillStyle = "rgba(20,17,24,.5)";
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, 20, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = "rgba(20,22,30,.22)";
      ctx.beginPath();
      ctx.ellipse(tower.x, tower.y + 37, 34, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tower.side === 0 ? "#6fb7e6" : "#f0708e";
      ctx.beginPath();
      ctx.roundRect(tower.x - 25, tower.y - 31, 50, 64, 8);
      ctx.fill();
      ctx.fillStyle = "#3c4058";
      ctx.fillRect(tower.x - 13, tower.y - 12, 26, 28);
      ctx.fillStyle = "#f3d37b";
      ctx.beginPath();
      ctx.roundRect(tower.x - 20, tower.y - 47, 40, 22, 6);
      ctx.fill();
      ctx.strokeStyle = "#263244";
      ctx.lineWidth = 4;
      ctx.stroke();
      this.drawCrown(ctx, tower.x, tower.y - 38, 0.62);
      this.drawBar(ctx, tower.x - 28, tower.y - 48, 56, 7, tower.hp / tower.maxHp, "#ffd36a");
    }
  }

  drawCrown(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffd65c";
    ctx.strokeStyle = "#775321";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, 8);
    ctx.lineTo(-13, -8);
    ctx.lineTo(-5, 1);
    ctx.lineTo(0, -11);
    ctx.lineTo(5, 1);
    ctx.lineTo(13, -8);
    ctx.lineTo(15, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawUnits(ctx) {
    const units = [...this.state.units].sort((a, b) => a.y - b.y);
    for (const unit of units) {
      const type = UNIT_TYPES[unit.type];
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.beginPath();
      ctx.arc(0, 1, unit.type === "ram" ? 26 : 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PLAYER_COLORS[unit.side];
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "rgba(15,18,36,.25)";
      ctx.beginPath();
      ctx.ellipse(0, 21, 23, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${unit.type === "ram" ? 28 : 26}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(type.emoji, 0, 0);
      ctx.restore();
      this.drawBar(ctx, unit.x - 23, unit.y - 33, 46, 6, unit.hp / unit.maxHp, "#2bd66f");
    }
  }

  drawTopText(ctx) {
    ctx.fillStyle = "rgba(15,18,36,.72)";
    ctx.fillRect(420, 18, 440, 34);
    ctx.fillStyle = "#f8f7ff";
    ctx.font = "800 14px Rubik, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.state.log, WIDTH / 2, 40);
    LANES.forEach((y, lane) => {
      if (Math.abs(this.mouse.y - y) > 30) return;
      ctx.strokeStyle = "rgba(255,255,255,.42)";
      ctx.lineWidth = 4;
      ctx.strokeRect(112, y - 30, WIDTH - 224, 60);
      ctx.fillStyle = "#f8f7ff";
      ctx.font = "900 13px Rubik, sans-serif";
      ctx.fillText(`Click to send ${UNIT_TYPES[this.selectedType].label} to lane ${lane + 1}`, WIDTH / 2, y - 44);
    });
  }

  drawBar(ctx, x, y, w, h, t, color) {
    ctx.fillStyle = "rgba(10,9,18,.76)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(t, 0, 1), h);
  }

  loop(time) {
    if (!this.running) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.update(dt);
    this.draw();
    this.frame = requestAnimationFrame((next) => this.loop(next));
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.root.classList.remove("is-active");
    this.root.replaceChildren();
  }
}
