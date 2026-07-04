const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const WEAPONS = [
  { id: "pistol", icon: "⌁", label: "Пистолет", ammo: 8 },
  { id: "rocket", icon: "➤", label: "Базука", ammo: 2 },
  { id: "grenade", icon: "●", label: "Граната", ammo: 2 },
  { id: "bat", icon: "╱", label: "Бита", ammo: Infinity },
  { id: "dig", icon: "⛏", label: "Копать", ammo: Infinity },
  { id: "block", icon: "■", label: "Блок", ammo: 6 },
  { id: "rope", icon: "⌇", label: "Верёвка", ammo: Infinity },
];

const MAPS = [
  { id: "canyon", title: "Каньон", subtitle: "Высоты и опасная расселина", colors: ["#f1ad5f", "#9a4c42"] },
  { id: "anthill", title: "Муравейник", subtitle: "Холмы и тесные позиции", colors: ["#8dcf6f", "#3d774d"] },
  { id: "islands", title: "Архипелаг", subtitle: "Прыжки, верёвка и пропасти", colors: ["#74d1cf", "#317290"] },
];

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export class WormsGame {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.network = callbacks.network ?? null;
    this.networkRole = this.network?.role ?? "solo";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "worms-canvas";
    this.canvas.width = 960;
    this.canvas.height = 540;
    this.canvas.setAttribute("aria-label", "Поле игры «Червячки»");
    this.canvas.setAttribute("role", "application");
    this.context = this.canvas.getContext("2d");
    this.toolbar = document.createElement("div");
    this.toolbar.className = "worms-toolbar";
    this.mapChoice = document.createElement("div");
    this.mapChoice.className = "worms-map-choice";
    this.root.replaceChildren(this.canvas, this.toolbar, this.mapChoice);
    this.root.classList.add("is-active");
    this.keys = new Set();
    this.pointers = new Map();
    this.running = true;
    this.state = "maps";
    this.selectedWeapon = "pistol";
    this.lastTime = performance.now();
    this.networkClock = 0;
    this.inputClock = 0;
    this.localInput = { move: 0, aim: -0.35, weapon: "pistol", jumpSeq: 0, fireSeq: 0 };
    this.jumpHeld = false;
    this.lastRemoteJumpSeq = 0;
    this.lastRemoteFireSeq = 0;
    this.terrainEvents = [];
    this.appliedTerrainEvents = 0;
    this.bindEvents();
    this.buildMapChoice();
    this.buildToolbar();
    this.toolbar.hidden = true;
    this.frame = requestAnimationFrame((time) => this.loop(time));
  }

  buildMapChoice() {
    const heading = document.createElement("div");
    heading.className = "worms-map-heading";
    heading.innerHTML = "<small>ВЫБЕРИ АРЕНУ</small><strong>Три карты. Один шанс.</strong>";
    this.mapChoice.append(heading);
    MAPS.forEach((map) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "worms-map-button";
      button.style.setProperty("--map-a", map.colors[0]);
      button.style.setProperty("--map-b", map.colors[1]);
      button.innerHTML = `<span></span><strong>${map.title}</strong><small>${map.subtitle}</small>`;
      button.addEventListener("click", () => this.start(map.id));
      button.disabled = this.networkRole === "guest";
      this.mapChoice.append(button);
    });
    if (this.networkRole === "guest") {
      heading.innerHTML = "<small>СЕТЕВАЯ ДУЭЛЬ</small><strong>Хозяин выбирает карту…</strong>";
    }
  }

  buildToolbar() {
    WEAPONS.forEach((weapon) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.weapon = weapon.id;
      button.title = weapon.label;
      button.innerHTML = `<b>${weapon.icon}</b><span>${weapon.label}</span><small></small>`;
      button.addEventListener("click", () => this.selectWeapon(weapon.id));
      this.toolbar.append(button);
    });
  }

  bindEvents() {
    this.onKeyDown = (event) => {
      this.keys.add(event.key.toLowerCase());
      if (event.key >= "1" && event.key <= "7") this.selectWeapon(WEAPONS[Number(event.key) - 1].id);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(event.key.toLowerCase())) event.preventDefault();
    };
    this.onKeyUp = (event) => {
      this.keys.delete(event.key.toLowerCase());
      if (event.code === "Space") this.fire();
    };
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);

    this.canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.pointerUp(event));
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  start(mapId, publish = true) {
    this.state = "playing";
    this.mapId = mapId;
    this.mapChoice.hidden = true;
    this.toolbar.hidden = false;
    this.time = 0;
    this.crateClock = 22;
    this.projectiles = [];
    this.particles = [];
    this.blocks = [];
    this.crates = [];
    this.terrainEvents = [];
    this.appliedTerrainEvents = 0;
    this.message = "БОЙ!";
    this.messageTime = 1.2;
    this.terrain = this.createTerrain(mapId);
    this.player = this.createWorm(130, "#ff668c", "Ты");
    this.enemy = this.createWorm(830, "#63dcff", "Бот");
    this.player.y = this.groundAt(this.player.x) - this.player.radius;
    this.enemy.y = this.groundAt(this.enemy.x) - this.enemy.radius;
    this.updateToolbar();
    const local = this.localWorm;
    if (this.networkRole === "guest") {
      local.name = "Ты";
      this.player.name = "Хост";
    } else if (this.networkRole === "host") {
      this.enemy.name = "Соперник";
    }
    this.callbacks.onStatus?.("120 HP · уничтожь червячка соперника");
    if (publish && this.networkRole === "host") this.publishSnapshot();
  }

  createWorm(x, color, name) {
    return {
      x, y: 100, vx: 0, vy: 0, radius: 16, color, name,
      hp: 120, armor: 0, grounded: false, facing: x < 480 ? 1 : -1,
      aim: x < 480 ? -0.35 : Math.PI + 0.35, cooldown: 0, invulnerable: 0,
      ammo: Object.fromEntries(WEAPONS.map((item) => [item.id, item.ammo])),
      rope: null,
    };
  }

  createTerrain(mapId) {
    const terrain = new Float32Array(960);
    for (let x = 0; x < 960; x += 1) {
      let y;
      if (mapId === "canyon") {
        y = 355 + Math.sin(x / 80) * 34 + Math.sin(x / 29) * 11;
        if (x > 390 && x < 570) y += 125 - Math.abs(x - 480) * 0.25;
      } else if (mapId === "anthill") {
        y = 370 - Math.sin(x / 105) * 65 - Math.sin(x / 37) * 19;
        if (x > 405 && x < 555) y -= 55;
      } else {
        y = 385 + Math.sin(x / 48) * 48;
        if ((x > 245 && x < 340) || (x > 620 && x < 735)) y = 535;
      }
      terrain[x] = clamp(y, 250, 535);
    }
    return terrain;
  }

  groundAt(x) {
    const index = clamp(Math.round(x), 0, 959);
    let ground = this.terrain[index];
    for (const block of this.blocks) {
      if (x >= block.x && x <= block.x + block.width) ground = Math.min(ground, block.y);
    }
    return ground;
  }

  get localWorm() {
    return this.networkRole === "guest" ? this.enemy : this.player;
  }

  get remoteWorm() {
    return this.networkRole === "guest" ? this.player : this.enemy;
  }

  selectWeapon(id) {
    if (this.state !== "playing") return;
    this.selectedWeapon = id;
    this.localInput.weapon = id;
    if (this.networkRole === "guest") this.sendNetworkInput(true);
    this.updateToolbar();
  }

  updateToolbar() {
    const worm = this.localWorm;
    if (!worm) return;
    [...this.toolbar.children].forEach((button) => {
      const weapon = WEAPONS.find((item) => item.id === button.dataset.weapon);
      const ammo = worm.ammo[weapon.id];
      button.classList.toggle("is-selected", weapon.id === this.selectedWeapon);
      button.disabled = ammo !== Infinity && ammo <= 0;
      button.querySelector("small").textContent = ammo === Infinity ? "∞" : ammo;
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
    if (this.state !== "playing") return;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.pointerPosition(event);
    const side = point.x < 480 ? "move" : "aim";
    this.pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y, side });
    if (side === "move" && point.y < 365) this.jump();
    if (side === "aim") this.setAimFromPointer(point);
  }

  pointerMove(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    const point = this.pointerPosition(event);
    pointer.x = point.x;
    pointer.y = point.y;
    if (pointer.side === "aim") this.setAimFromPointer(point);
  }

  pointerUp(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    if (pointer.side === "aim") this.fire();
    else if (pointer.startY - pointer.y > 55) this.jump();
    this.pointers.delete(event.pointerId);
  }

  setAimFromPointer(point) {
    const worm = this.localWorm;
    worm.aim = Math.atan2(point.y - worm.y, point.x - worm.x);
    worm.facing = Math.cos(worm.aim) >= 0 ? 1 : -1;
    this.localInput.aim = worm.aim;
  }

  jump() {
    const worm = this.localWorm;
    if (this.networkRole === "guest") {
      this.localInput.jumpSeq += 1;
      this.sendNetworkInput(true);
      return;
    }
    if (worm?.grounded) {
      worm.vy = -285;
      worm.grounded = false;
    }
  }

  fire() {
    const worm = this.localWorm;
    if (this.state !== "playing" || worm.cooldown > 0) return;
    if (this.networkRole === "guest") {
      this.localInput.fireSeq += 1;
      this.localInput.weapon = this.selectedWeapon;
      this.localInput.aim = worm.aim;
      this.sendNetworkInput(true);
      return;
    }
    this.useWeapon(worm, this.selectedWeapon, worm.aim);
  }

  useWeapon(worm, id, angle) {
    const ammo = worm.ammo[id];
    if (ammo !== Infinity && ammo <= 0) return;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    if (id === "pistol") {
      this.hitscan(worm, angle);
      worm.cooldown = 0.55;
    } else if (id === "rocket" || id === "grenade") {
      this.projectiles.push({
        type: id, owner: worm, x: worm.x + direction.x * 23, y: worm.y + direction.y * 23,
        vx: direction.x * (id === "rocket" ? 430 : 300),
        vy: direction.y * (id === "rocket" ? 430 : 300) - (id === "grenade" ? 80 : 0),
        life: id === "rocket" ? 3 : 2.1, radius: id === "rocket" ? 5 : 7,
      });
      worm.cooldown = id === "rocket" ? 1.6 : 1.3;
    } else if (id === "bat") {
      const target = worm === this.player ? this.enemy : this.player;
      if (distance(worm, target) < 62) {
        this.damage(target, 22, direction.x * 330, -175);
        this.burst(target.x, target.y, worm.color, 12);
      }
      worm.cooldown = 0.8;
    } else if (id === "dig") {
      this.crater(worm.x + direction.x * 35, worm.y + direction.y * 25, 32);
      worm.cooldown = 0.45;
    } else if (id === "block") {
      const x = clamp(worm.x + direction.x * 52 - 22, 10, 906);
      const y = Math.min(this.groundAt(x + 22) - 34, worm.y + direction.y * 58);
      this.blocks.push({ x, y, width: 44, height: 34, hp: 45, color: worm.color });
      worm.cooldown = 0.5;
    } else if (id === "rope") {
      if (worm.rope) worm.rope = null;
      else {
        const length = 190;
        const anchor = { x: clamp(worm.x + direction.x * length, 15, 945), y: clamp(worm.y + direction.y * length, 30, 490) };
        worm.rope = { ...anchor, length: distance(worm, anchor) };
      }
      worm.cooldown = 0.35;
    }
    if (ammo !== Infinity) worm.ammo[id] -= 1;
    if (worm === this.localWorm) this.updateToolbar();
  }

  hitscan(worm, angle) {
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const target = worm === this.player ? this.enemy : this.player;
    const toTarget = { x: target.x - worm.x, y: target.y - worm.y };
    const projection = toTarget.x * direction.x + toTarget.y * direction.y;
    const closest = Math.abs(toTarget.x * direction.y - toTarget.y * direction.x);
    let end = { x: worm.x + direction.x * 520, y: worm.y + direction.y * 520 };
    if (projection > 0 && projection < 520 && closest < target.radius + 5) {
      end = { x: worm.x + direction.x * projection, y: worm.y + direction.y * projection };
      this.damage(target, 18, direction.x * 110, -55);
    }
    this.particles.push({ type: "line", x: worm.x, y: worm.y, x2: end.x, y2: end.y, life: 0.12, maxLife: 0.12, color: worm.color });
  }

  damage(worm, amount, vx = 0, vy = 0) {
    if (worm.invulnerable > 0 || this.state !== "playing") return;
    const absorbed = Math.min(worm.armor, Math.round(amount * 0.6));
    worm.armor -= absorbed;
    worm.hp = Math.max(0, worm.hp - (amount - absorbed));
    worm.vx += vx;
    worm.vy += vy;
    worm.invulnerable = 0.2;
    if (worm.hp <= 0) this.finish(worm === this.enemy);
  }

  explode(x, y, radius = 55, damage = 34) {
    this.crater(x, y, radius);
    [this.player, this.enemy].forEach((worm) => {
      const d = distance(worm, { x, y });
      if (d < radius + worm.radius) {
        const force = 1 - d / (radius + worm.radius);
        const nx = (worm.x - x) / Math.max(d, 1);
        this.damage(worm, Math.round(damage * clamp(force, 0.35, 1)), nx * 390 * force, -250 * force);
      }
    });
    this.blocks = this.blocks.filter((block) => distance({ x: block.x + 22, y: block.y + 17 }, { x, y }) > radius);
    this.burst(x, y, "#ffd36a", 30);
  }

  crater(x, y, radius) {
    const start = clamp(Math.floor(x - radius), 0, 959);
    const end = clamp(Math.ceil(x + radius), 0, 959);
    for (let column = start; column <= end; column += 1) {
      const dx = column - x;
      const depth = Math.sqrt(Math.max(0, radius * radius - dx * dx));
      if (this.terrain[column] < y + depth) this.terrain[column] = clamp(y + depth, this.terrain[column], 540);
    }
    if (this.networkRole === "host") this.terrainEvents.push({ x, y, radius });
  }

  burst(x, y, color, count) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU;
      const speed = 40 + Math.random() * 180;
      this.particles.push({
        type: "dot", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.5, maxLife: 0.9, color,
      });
    }
  }

  updateWorm(worm, dt, input = 0) {
    worm.cooldown = Math.max(0, worm.cooldown - dt);
    worm.invulnerable = Math.max(0, worm.invulnerable - dt);
    worm.vx += input * 580 * dt;
    worm.vx *= Math.pow(worm.grounded ? 0.001 : 0.12, dt);
    worm.vx = clamp(worm.vx, -145, 145);
    worm.vy += 720 * dt;
    if (worm.rope) {
      const dx = worm.x - worm.rope.x;
      const dy = worm.y - worm.rope.y;
      const d = Math.hypot(dx, dy);
      if (d > worm.rope.length) {
        const excess = d - worm.rope.length;
        worm.vx -= dx / d * excess * 24;
        worm.vy -= dy / d * excess * 24;
      }
    }
    worm.x = clamp(worm.x + worm.vx * dt, worm.radius, 960 - worm.radius);
    worm.y += worm.vy * dt;
    const ground = this.groundAt(worm.x);
    if (worm.y + worm.radius >= ground && worm.vy >= 0) {
      const impact = worm.vy;
      worm.y = ground - worm.radius;
      worm.vy = 0;
      worm.grounded = true;
      if (impact > 520) this.damage(worm, Math.round((impact - 500) / 13));
    } else worm.grounded = false;
    if (worm.y > 560) {
      worm.hp = 0;
      this.finish(worm === this.enemy);
    }
  }

  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.life -= dt;
      projectile.vy += (projectile.type === "grenade" ? 610 : 70) * dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      if (projectile.type === "grenade" && projectile.y >= this.groundAt(projectile.x) - projectile.radius) {
        projectile.y = this.groundAt(projectile.x) - projectile.radius;
        projectile.vy *= -0.48;
        projectile.vx *= 0.72;
      }
      const hitWorm = [this.player, this.enemy].some((worm) => worm !== projectile.owner && distance(worm, projectile) < worm.radius + projectile.radius);
      const hitGround = projectile.type === "rocket" && projectile.y >= this.groundAt(projectile.x);
      const expired = projectile.life <= 0 || projectile.x < 0 || projectile.x > 960 || projectile.y > 540;
      if (hitWorm || hitGround || expired) {
        this.explode(projectile.x, projectile.y, projectile.type === "rocket" ? 58 : 52, projectile.type === "rocket" ? 38 : 34);
        return false;
      }
      return true;
    });
  }

  updateAI(dt) {
    if (!this.enemy || this.state !== "playing") return;
    const dx = this.player.x - this.enemy.x;
    const safeDistance = Math.abs(dx) > 230;
    const direction = safeDistance ? Math.sign(dx) : -Math.sign(dx);
    this.updateWorm(this.enemy, dt, direction * 0.5);
    this.enemy.facing = Math.sign(dx);
    this.enemy.aim = Math.atan2(this.player.y - this.enemy.y - 18, dx);
    if (this.enemy.grounded && Math.random() < dt * 0.24) this.enemy.vy = -265;
    if (this.enemy.cooldown <= 0 && Math.random() < dt * 0.7 && Math.abs(dx) < 600) {
      const spread = (Math.random() - 0.5) * 0.16;
      const weapon = Math.abs(dx) < 55 ? "bat" : this.enemy.ammo.rocket > 0 && Math.random() < 0.28 ? "rocket" : "pistol";
      this.useWeapon(this.enemy, weapon, this.enemy.aim + spread);
    }
  }

  updateCrates(dt) {
    this.crateClock -= dt;
    if (this.crateClock <= 0 && this.crates.length < 2) {
      const x = 130 + Math.random() * 700;
      this.crates.push({ x, y: -20, vy: 0, type: ["health", "armor", "ammo"][Math.floor(Math.random() * 3)] });
      this.crateClock = 28 + Math.random() * 10;
      this.message = "ПРИПАСЫ!";
      this.messageTime = 1.5;
    }
    this.crates = this.crates.filter((crate) => {
      crate.vy += 400 * dt;
      crate.y += crate.vy * dt;
      const ground = this.groundAt(crate.x);
      if (crate.y > ground - 13) {
        crate.y = ground - 13;
        crate.vy = 0;
      }
      for (const worm of [this.player, this.enemy]) {
        if (distance(crate, worm) < 32) {
          if (crate.type === "health") worm.hp = Math.min(120, worm.hp + 30);
          else if (crate.type === "armor") worm.armor = Math.min(50, worm.armor + 30);
          else {
            worm.ammo.pistol += 3;
            worm.ammo.rocket += 1;
            worm.ammo.grenade += 1;
          }
          this.burst(crate.x, crate.y, "#b7f34a", 18);
          if (worm === this.player) this.updateToolbar();
          return false;
        }
      }
      return true;
    });
  }

  finish(playerWon) {
    if (this.state !== "playing") return;
    this.state = "finished";
    this.message = playerWon ? "ПОБЕДА!" : "ПОРАЖЕНИЕ";
    this.messageTime = Infinity;
    this.callbacks.onStatus?.(playerWon ? "Ты победил!" : "Компьютер победил");
    const restart = document.createElement("button");
    restart.type = "button";
    restart.className = "worms-restart";
    restart.textContent = "Выбрать новую карту";
    restart.addEventListener("click", () => {
      restart.remove();
      this.state = "maps";
      this.mapChoice.hidden = false;
      this.toolbar.hidden = true;
      this.callbacks.onStatus?.("Выбери одну из трёх карт");
      if (this.networkRole === "host") {
        this.network.publish?.({ kind: "worms", phase: "selecting", revision: Date.now() });
      }
    });
    this.root.append(restart);
    if (this.networkRole === "host") this.publishSnapshot();
  }

  sendNetworkInput(force = false) {
    if (this.networkRole !== "guest" || !this.network) return;
    if (!force && this.inputClock < 0.05) return;
    this.inputClock = 0;
    this.network.sendInput?.({ ...this.localInput, sentAt: Date.now() });
  }

  serializeWorm(worm) {
    return {
      x: worm.x, y: worm.y, vx: worm.vx, vy: worm.vy,
      hp: worm.hp, armor: worm.armor, grounded: worm.grounded,
      facing: worm.facing, aim: worm.aim, cooldown: worm.cooldown,
      ammo: { ...worm.ammo },
      rope: worm.rope ? { ...worm.rope } : null,
    };
  }

  applyWormState(worm, state) {
    if (!worm || !state) return;
    Object.assign(worm, state, { ammo: { ...state.ammo } });
  }

  createSnapshot() {
    return {
      kind: "worms",
      phase: this.state,
      mapId: this.mapId,
      tick: Math.round(this.time * 60),
      revision: Date.now(),
      player: this.serializeWorm(this.player),
      enemy: this.serializeWorm(this.enemy),
      projectiles: this.projectiles.map(({ owner, ...projectile }) => ({
        ...projectile,
        ownerSide: owner === this.player ? "player" : "enemy",
      })),
      crates: this.crates.map((crate) => ({ ...crate })),
      blocks: this.blocks.map((block) => ({ ...block })),
      terrainEvents: this.terrainEvents.map((event) => ({ ...event })),
      message: this.message,
      messageTime: Number.isFinite(this.messageTime) ? this.messageTime : 999,
    };
  }

  publishSnapshot() {
    if (this.networkRole !== "host" || !this.network || !this.player) return;
    this.network.publish?.(this.createSnapshot());
  }

  applyNetworkSnapshot(snapshot) {
    if (this.networkRole !== "guest" || !snapshot || snapshot.kind !== "worms") return;
    if (snapshot.phase === "selecting") {
      this.state = "maps";
      this.mapChoice.hidden = false;
      this.toolbar.hidden = true;
      this.callbacks.onStatus?.("Хозяин комнаты выбирает карту…");
      return;
    }
    if (!this.player || this.mapId !== snapshot.mapId) this.start(snapshot.mapId, false);
    this.applyWormState(this.player, snapshot.player);
    this.applyWormState(this.enemy, snapshot.enemy);
    this.projectiles = (snapshot.projectiles ?? []).map((projectile) => ({
      ...projectile,
      owner: projectile.ownerSide === "player" ? this.player : this.enemy,
    }));
    this.crates = (snapshot.crates ?? []).map((crate) => ({ ...crate }));
    this.blocks = (snapshot.blocks ?? []).map((block) => ({ ...block }));
    const events = snapshot.terrainEvents ?? [];
    for (let index = this.appliedTerrainEvents; index < events.length; index += 1) {
      const event = events[index];
      this.crater(event.x, event.y, event.radius);
    }
    this.appliedTerrainEvents = events.length;
    this.time = (snapshot.tick ?? 0) / 60;
    this.message = snapshot.message === "ПОБЕДА!"
      ? "ПОРАЖЕНИЕ"
      : snapshot.message === "ПОРАЖЕНИЕ"
        ? "ПОБЕДА!"
        : snapshot.message ?? "";
    this.messageTime = snapshot.messageTime ?? 0;
    this.state = snapshot.phase === "finished" ? "finished" : "playing";
    if (this.state === "finished") {
      this.callbacks.onStatus?.(this.message === "ПОБЕДА!" ? "Ты победил!" : "Хозяин комнаты победил");
    }
    this.updateToolbar();
  }

  updateNetworkHost(dt, localMove) {
    this.updateWorm(this.player, dt, localMove);
    if (localMove) this.player.facing = Math.sign(localMove);

    const remoteInput = this.network.getRemoteInput?.();
    const move = clamp(Number(remoteInput?.move) || 0, -1, 1);
    this.enemy.aim = Number.isFinite(remoteInput?.aim) ? remoteInput.aim : this.enemy.aim;
    this.enemy.facing = Math.cos(this.enemy.aim) >= 0 ? 1 : -1;
    this.updateWorm(this.enemy, dt, move);

    if (remoteInput?.jumpSeq > this.lastRemoteJumpSeq) {
      this.lastRemoteJumpSeq = remoteInput.jumpSeq;
      if (this.enemy.grounded) {
        this.enemy.vy = -285;
        this.enemy.grounded = false;
      }
    }
    if (remoteInput?.fireSeq > this.lastRemoteFireSeq) {
      this.lastRemoteFireSeq = remoteInput.fireSeq;
      const weapon = WEAPONS.some((item) => item.id === remoteInput.weapon) ? remoteInput.weapon : "pistol";
      if (this.enemy.cooldown <= 0) this.useWeapon(this.enemy, weapon, this.enemy.aim);
    }

    this.updateProjectiles(dt);
    this.updateCrates(dt);
    this.networkClock += dt;
    if (this.networkClock >= 1 / 12) {
      this.networkClock = 0;
      this.publishSnapshot();
    }
  }

  update(dt) {
    if (this.state !== "playing") return;
    this.time += dt;
    this.messageTime -= dt;
    let input = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) input -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) input += 1;
    for (const pointer of this.pointers.values()) {
      if (pointer.side === "move") input += clamp((pointer.x - pointer.startX) / 55, -1, 1);
    }
    input = clamp(input, -1, 1);
    const wantsJump = this.keys.has("w") || this.keys.has("arrowup");
    if (wantsJump && !this.jumpHeld && this.localWorm.grounded) this.jump();
    this.jumpHeld = wantsJump;

    if (this.networkRole === "guest") {
      this.localInput.move = input;
      this.localInput.aim = this.localWorm.aim;
      this.inputClock += dt;
      this.sendNetworkInput();
      return;
    }

    if (this.networkRole === "host") this.updateNetworkHost(dt, input);
    else {
      this.updateWorm(this.player, dt, input);
      if (input) this.player.facing = Math.sign(input);
      this.updateAI(dt);
      this.updateProjectiles(dt);
      this.updateCrates(dt);
    }
    this.particles = this.particles.filter((particle) => {
      particle.life -= dt;
      if (particle.type === "dot") {
        particle.vy += 300 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      }
      return particle.life > 0;
    });
  }

  drawTerrain() {
    const context = this.context;
    const gradient = context.createLinearGradient(0, 260, 0, 540);
    gradient.addColorStop(0, this.mapId === "islands" ? "#4f9b78" : "#946044");
    gradient.addColorStop(1, "#3d2730");
    context.beginPath();
    context.moveTo(0, 540);
    context.lineTo(0, this.terrain[0]);
    for (let x = 1; x < 960; x += 3) context.lineTo(x, this.terrain[x]);
    context.lineTo(960, 540);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = "#d39a5e";
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = "rgba(255,255,255,.05)";
    for (let x = 20; x < 960; x += 70) {
      context.beginPath();
      context.arc(x, this.terrain[x] + 30, 4, 0, TAU);
      context.fill();
    }
  }

  drawWorm(worm) {
    const context = this.context;
    if (worm.invulnerable > 0 && Math.floor(worm.invulnerable * 30) % 2) return;
    context.save();
    context.translate(worm.x, worm.y);
    context.fillStyle = worm.color;
    context.strokeStyle = "#171525";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(0, 2, worm.radius, 0, TAU);
    context.fill();
    context.stroke();
    context.fillStyle = "white";
    context.beginPath();
    context.arc(worm.facing * 6, -5, 5, 0, TAU);
    context.fill();
    context.fillStyle = "#171525";
    context.beginPath();
    context.arc(worm.facing * 8, -5, 2.3, 0, TAU);
    context.fill();
    context.strokeStyle = worm.color;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(0, 8);
    context.lineTo(-worm.facing * 11, 17);
    context.stroke();
    context.restore();
    if (worm.rope) {
      context.strokeStyle = "rgba(255,255,255,.8)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(worm.x, worm.y);
      context.lineTo(worm.rope.x, worm.rope.y);
      context.stroke();
      context.fillStyle = "#b7f34a";
      context.beginPath();
      context.arc(worm.rope.x, worm.rope.y, 4, 0, TAU);
      context.fill();
    }
  }

  drawHud() {
    const context = this.context;
    const drawHealth = (worm, x, align) => {
      context.textAlign = align;
      context.fillStyle = "rgba(21,20,37,.86)";
      roundedRect(context, align === "left" ? x : x - 215, 18, 215, 58, 15);
      context.fill();
      context.fillStyle = worm.color;
      context.font = "800 17px Rubik, sans-serif";
      context.fillText(`${worm.name}  ${worm.hp} HP`, x + (align === "left" ? 14 : -14), 43);
      context.fillStyle = "#9478ff";
      context.font = "700 12px Rubik, sans-serif";
      context.fillText(`БРОНЯ ${worm.armor}`, x + (align === "left" ? 14 : -14), 62);
    };
    drawHealth(this.player, 18, "left");
    drawHealth(this.enemy, 942, "right");
    context.textAlign = "center";
    context.fillStyle = "rgba(21,20,37,.75)";
    roundedRect(context, 430, 22, 100, 38, 13);
    context.fill();
    context.fillStyle = "white";
    context.font = "800 15px Rubik, sans-serif";
    context.fillText(`${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, "0")}`, 480, 47);
  }

  drawControls() {
    const context = this.context;
    context.globalAlpha = 0.72;
    context.strokeStyle = "rgba(255,255,255,.28)";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(105, 440, 54, 0, TAU);
    context.stroke();
    const movePointer = [...this.pointers.values()].find((pointer) => pointer.side === "move");
    context.fillStyle = "rgba(255,255,255,.2)";
    context.beginPath();
    context.arc(
      movePointer ? 105 + clamp(movePointer.x - movePointer.startX, -35, 35) : 105,
      movePointer ? 440 + clamp(movePointer.y - movePointer.startY, -35, 35) : 440,
      22, 0, TAU,
    );
    context.fill();
    context.beginPath();
    context.arc(850, 430, 65, 0, TAU);
    context.stroke();
    context.fillStyle = "#b7f34a";
    context.font = "800 13px Rubik, sans-serif";
    context.textAlign = "center";
    context.fillText("ПРИЦЕЛ / ОГОНЬ", 850, 434);
    context.globalAlpha = 1;
    if (this.state === "playing") {
      context.strokeStyle = "rgba(255,255,255,.55)";
      context.setLineDash([7, 7]);
      context.beginPath();
      const worm = this.localWorm;
      context.moveTo(worm.x, worm.y);
      context.lineTo(worm.x + Math.cos(worm.aim) * 78, worm.y + Math.sin(worm.aim) * 78);
      context.stroke();
      context.setLineDash([]);
    }
  }

  draw() {
    const context = this.context;
    const sky = context.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, "#282653");
    sky.addColorStop(0.65, "#535188");
    sky.addColorStop(1, "#ee9d76");
    context.fillStyle = sky;
    context.fillRect(0, 0, 960, 540);
    context.fillStyle = "rgba(255,255,255,.08)";
    for (let index = 0; index < 12; index += 1) {
      context.beginPath();
      context.arc((index * 191 + 60) % 960, 80 + (index * 67) % 190, 2 + index % 3, 0, TAU);
      context.fill();
    }
    if (this.state === "maps") return;
    this.drawTerrain();
    for (const block of this.blocks) {
      context.fillStyle = block.color;
      context.fillRect(block.x, block.y, block.width, block.height);
      context.strokeStyle = "#171525";
      context.lineWidth = 4;
      context.strokeRect(block.x, block.y, block.width, block.height);
    }
    for (const crate of this.crates) {
      context.fillStyle = crate.type === "health" ? "#ff668c" : crate.type === "armor" ? "#9478ff" : "#b7f34a";
      context.fillRect(crate.x - 13, crate.y - 13, 26, 26);
      context.fillStyle = "#171525";
      context.font = "900 17px Rubik";
      context.textAlign = "center";
      context.fillText(crate.type === "health" ? "+" : crate.type === "armor" ? "◆" : "?", crate.x, crate.y + 6);
    }
    for (const projectile of this.projectiles) {
      context.fillStyle = projectile.type === "rocket" ? "#ff668c" : "#171525";
      context.beginPath();
      context.arc(projectile.x, projectile.y, projectile.radius, 0, TAU);
      context.fill();
    }
    this.drawWorm(this.player);
    this.drawWorm(this.enemy);
    for (const particle of this.particles) {
      context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      context.strokeStyle = particle.color;
      context.fillStyle = particle.color;
      if (particle.type === "line") {
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x2, particle.y2);
        context.stroke();
      } else {
        context.beginPath();
        context.arc(particle.x, particle.y, 3, 0, TAU);
        context.fill();
      }
    }
    context.globalAlpha = 1;
    this.drawHud();
    this.drawControls();
    if (this.messageTime > 0) {
      context.fillStyle = "rgba(21,20,37,.75)";
      roundedRect(context, 335, 220, 290, 82, 20);
      context.fill();
      context.fillStyle = this.message === "ПОРАЖЕНИЕ" ? "#ff668c" : "#b7f34a";
      context.textAlign = "center";
      context.font = "900 38px Rubik, sans-serif";
      context.fillText(this.message, 480, 272);
    }
  }

  loop(time) {
    if (!this.running) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.033);
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
