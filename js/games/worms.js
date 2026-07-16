const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TURN_DURATION = 35;
const WORLD_ZOOM = 0.86;
const TEAM_SIZE = 5;

const WEAPONS = [
  { id: "pistol", icon: "⌁", label: "Pistol", ammo: 8 },
  { id: "rocket", icon: "➤", label: "Bazooka", ammo: 2 },
  { id: "grenade", icon: "●", label: "Grenade", ammo: 2 },
  { id: "molotov", icon: "♨", label: "Molotov", ammo: 1 },
  { id: "bat", icon: "╱", label: "Bat", ammo: 3 },
  { id: "finger", icon: "☝", label: "Finger", ammo: Infinity },
  { id: "dig", icon: "⛏", label: "Pickaxe", ammo: 8 },
  { id: "block", icon: "■", label: "Block", ammo: 6 },
  { id: "rope", icon: "⌇", label: "Rope", ammo: 5 },
];

const MAPS = [
  { id: "canyon", title: "Canyon", subtitle: "Heights and a dangerous rift", colors: ["#f1ad5f", "#9a4c42"] },
  { id: "anthill", title: "Anthill", subtitle: "Hills and tight positions", colors: ["#8dcf6f", "#3d774d"] },
  { id: "islands", title: "Archipelago", subtitle: "Jumps, rope, and gaps", colors: ["#74d1cf", "#317290"] },
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
    this.canvas.setAttribute("aria-label", "Worms game field");
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
    this.gameMode = this.networkRole === "solo" ? "classic" : "simultaneous";
    this.selectedWeapon = "pistol";
    this.lastTime = performance.now();
    this.networkClock = 0;
    this.inputClock = 0;
    this.localInput = { move: 0, ropeDelta: 0, aim: -0.35, weapon: "pistol", jumpSeq: 0, fireSeq: 0 };
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
    heading.innerHTML = "<small>CHOOSE MODE AND ARENA</small><strong>How do we fight?</strong>";
    this.mapChoice.append(heading);
    const modes = document.createElement("div");
    modes.className = "worms-mode-choice";
    const modeItems = this.networkRole === "solo"
      ? [
        ["classic", "Classic turns", "5 vs 5 · 35 seconds · like Armageddon"],
        ["simultaneous", "Real-time chaos", "1 vs 1 · both move at once"],
      ]
      : [["simultaneous", "Network duel", "Both players move at once"]];
    for (const [id, title, subtitle] of modeItems) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.mode = id;
      button.innerHTML = `<strong>${title}</strong><small>${subtitle}</small>`;
      button.classList.toggle("is-selected", id === this.gameMode);
      button.addEventListener("click", () => {
        this.gameMode = id;
        [...modes.children].forEach((item) => item.classList.toggle("is-selected", item === button));
      });
      modes.append(button);
    }
    this.mapChoice.append(modes);
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
      heading.innerHTML = "<small>NETWORK DUEL</small><strong>The host is choosing a map...</strong>";
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
    this.wind = (Math.random() * 2 - 1) * 92;
    this.turnTeam = "player";
    this.turnNumber = 1;
    this.turnTime = TURN_DURATION;
    this.turnResolving = false;
    this.turnSettleTime = 0;
    this.aiPlan = null;
    this.crateClock = 22;
    this.projectiles = [];
    this.meleeAttacks = [];
    this.firePatches = [];
    this.particles = [];
    this.blocks = [];
    this.crates = [];
    this.terrainEvents = [];
    this.appliedTerrainEvents = 0;
    this.message = "FIGHT!";
    this.messageTime = 1.2;
    this.terrain = this.createTerrain(mapId);
    if (this.gameMode === "classic" && this.networkRole === "solo") {
      const playerSpawns = Array.from({ length: TEAM_SIZE }, (_, index) => 80 + index * 180);
      const enemySpawns = Array.from({ length: TEAM_SIZE }, (_, index) => 170 + index * 180);
      const occupied = [];
      const spawnTeam = (spawns, color, prefix, team) => spawns.map((preferredX, index) => {
        const x = this.findSafeSpawn(preferredX, occupied);
        occupied.push(x);
        return this.createWorm(x, color, `${prefix} ${index + 1}`, team);
      });
      this.playerTeam = spawnTeam(playerSpawns, "#ff668c", "Pink", "player");
      this.enemyTeam = spawnTeam(enemySpawns, "#63dcff", "Blue", "enemy");
      [...this.playerTeam, ...this.enemyTeam].forEach((worm) => {
        worm.y = this.groundAt(worm.x) - worm.radius;
      });
      this.playerIndex = 0;
      this.enemyIndex = 0;
      this.player = this.playerTeam[0];
      this.enemy = this.enemyTeam[0];
      this.beginTurn("player");
    } else {
      this.playerTeam = [this.createWorm(130, "#ff668c", "You", "player")];
      this.enemyTeam = [this.createWorm(830, "#63dcff", "Bot", "enemy")];
      this.player = this.playerTeam[0];
      this.enemy = this.enemyTeam[0];
      this.player.y = this.groundAt(this.player.x) - this.player.radius;
      this.enemy.y = this.groundAt(this.enemy.x) - this.enemy.radius;
    }
    this.updateToolbar();
    const local = this.localWorm;
    if (this.networkRole === "guest") {
      local.name = "You";
      this.player.name = "Host";
    } else if (this.networkRole === "host") {
      this.enemy.name = "Opponent";
    }
    this.callbacks.onStatus?.(this.gameMode === "classic"
      ? "Classic turns · 5 worms per team · 35 seconds"
      : "120 HP · destroy the opponent worm");
    if (publish && this.networkRole === "host") this.publishSnapshot();
  }

  createWorm(x, color, name, team = "player") {
    return {
      x, y: 100, vx: 0, vy: 0, radius: 16, color, name,
      team, hp: this.gameMode === "classic" ? 100 : 120, armor: 0, alive: true,
      grounded: false, facing: x < 480 ? 1 : -1,
      aim: x < 480 ? -0.35 : Math.PI + 0.35, cooldown: 0, invulnerable: 0,
      lavaExposure: 0, fireExposure: 0, hurtTime: 0, hurtTilt: 0, animTime: Math.random() * 10,
      bodyAngle: 0, angularVelocity: 0, squash: 0, blinkClock: 1 + Math.random() * 3,
      ammo: Object.fromEntries(WEAPONS.map((item) => [item.id, item.ammo])),
      rope: null,
    };
  }

  get allWorms() {
    return [...(this.playerTeam ?? (this.player ? [this.player] : [])), ...(this.enemyTeam ?? (this.enemy ? [this.enemy] : []))];
  }

  livingTeam(team) {
    return (team === "player" ? this.playerTeam : this.enemyTeam).filter((worm) => worm.alive && worm.hp > 0);
  }

  createTerrain(mapId) {
    const terrain = new Uint8Array(960 * 540);
    const surface = new Int16Array(960);
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
      surface[x] = clamp(Math.round(y), 250, 535);
      for (let row = surface[x]; row < 540; row += 1) terrain[row * 960 + x] = 1;
    }

    const carveCircle = (cx, cy, radius) => {
      const minX = clamp(Math.floor(cx - radius), 0, 959);
      const maxX = clamp(Math.ceil(cx + radius), 0, 959);
      const minY = clamp(Math.floor(cy - radius), 0, 539);
      const maxY = clamp(Math.ceil(cy + radius), 0, 539);
      for (let row = minY; row <= maxY; row += 1) {
        for (let column = minX; column <= maxX; column += 1) {
          if ((column - cx) ** 2 + (row - cy) ** 2 <= radius ** 2) {
            terrain[row * 960 + column] = 0;
          }
        }
      }
    };

    if (mapId === "anthill") {
      for (let x = 90; x <= 870; x += 18) carveCircle(x, 410 + Math.sin(x / 75) * 18, 24);
      for (let x = 170; x <= 790; x += 18) carveCircle(x, 474 + Math.sin(x / 58) * 12, 21);
      for (let y = 350; y <= 480; y += 17) {
        carveCircle(285 + Math.sin(y / 22) * 8, y, 20);
        carveCircle(675 + Math.cos(y / 25) * 8, y, 20);
      }
    }
    this.terrainSurface = surface;
    this.terrainDirty = true;
    return terrain;
  }

  isTerrainSolid(x, y) {
    const column = Math.round(x);
    const row = Math.round(y);
    if (column < 0 || column >= 960 || row >= 540) return true;
    if (row < 0) return false;
    return this.terrain[row * 960 + column] === 1;
  }

  isBlockSolid(x, y) {
    return this.blocks.some(
      (block) => x >= block.x && x <= block.x + block.width && y >= block.y && y <= block.y + block.height,
    );
  }

circleHitsSolid(x, y, radius) {
  const testRadius = Math.max(2, radius - 1);
  // Проверяем центр и все точки по окружности
  if (this.isTerrainSolid(Math.round(x), Math.round(y)) || this.isBlockSolid(x, y)) return true;
  
  // Проверяем больше точек для более точного определения столкновения
  const steps = 24;
  for (let index = 0; index < steps; index += 1) {
    const angle = index / steps * TAU;
    const px = x + Math.cos(angle) * testRadius;
    const py = y + Math.sin(angle) * testRadius;
    const col = Math.round(px);
    const row = Math.round(py);
    if (col < 0 || col >= 960 || row >= 540) continue;
    if (row < 0) continue;
    if (this.isTerrainSolid(col, row) || this.isBlockSolid(px, py)) return true;
  }
    // Дополнительная проверка для нижней части червячка
  // Это помогает предотвратить проваливание на краях
  for (let offset = -radius * 0.7; offset <= radius * 0.7; offset += radius * 0.3) {
    const px = x + offset;
    const py = y + radius * 0.9;
    const col = Math.round(px);
    const row = Math.round(py);
    if (col < 0 || col >= 960 || row >= 540) continue;
    if (row < 0) continue;
    if (this.isTerrainSolid(col, row) || this.isBlockSolid(px, py)) return true;
  }
  
  return false;
}

groundAt(x, startY = 0) {
  const column = clamp(Math.round(x), 0, 959);
  let ground = 540;
  const startRow = clamp(Math.floor(startY), 0, 539);
  for (let row = startRow; row < 540; row += 1) {
    if (this.terrain[row * 960 + column]) {
      ground = row;
      break;
    }
  }
  for (const block of this.blocks) {
    if (x >= block.x && x <= block.x + block.width && block.y >= startY) {
      ground = Math.min(ground, block.y);
    }
  }
  // Проверяем соседние колонки для более точного определения поверхности
  // Это помогает на крутых склонах
  for (let offset = -1; offset <= 1; offset += 1) {
    const adjColumn = clamp(column + offset, 0, 959);
    for (let row = Math.max(0, ground - 10); row < Math.min(540, ground + 10); row += 1) {
      if (this.terrain[row * 960 + adjColumn]) {
        ground = Math.min(ground, row);
        break;
      }
    }
  }
  return ground;
}

  findSafeSpawn(preferredX, occupied = []) {
    for (let offset = 0; offset <= 270; offset += 15) {
      for (const direction of offset === 0 ? [1] : [1, -1]) {
        const x = clamp(preferredX + offset * direction, 24, 936);
        const ground = this.groundAt(x);
        if (ground < 505 && occupied.every((taken) => Math.abs(taken - x) > 42)) return x;
      }
    }
    return clamp(preferredX, 24, 936);
  }

  get localWorm() {
    return this.networkRole === "guest" ? this.enemy : this.player;
  }

  get remoteWorm() {
    return this.networkRole === "guest" ? this.player : this.enemy;
  }

  beginTurn(team) {
    if (this.gameMode !== "classic") return;
    this.turnTeam = team;
    this.turnTime = TURN_DURATION;
    this.turnResolving = false;
    this.turnSettleTime = 0;
    this.wind = clamp(this.wind * 0.35 + (Math.random() * 2 - 1) * 78, -100, 100);
    const roster = this.livingTeam(team);
    if (!roster.length) return;
    const indexKey = team === "player" ? "playerIndex" : "enemyIndex";
    const teamList = team === "player" ? this.playerTeam : this.enemyTeam;
    let index = this[indexKey] % teamList.length;
    while (!teamList[index].alive) index = (index + 1) % teamList.length;
    this[indexKey] = index;
    if (team === "player") this.player = teamList[index];
    else this.enemy = teamList[index];
    const active = team === "player" ? this.player : this.enemy;
    active.rope = null;
    active.cooldown = 0;
    this.aiPlan = null;
    this.message = team === "player" ? "YOUR TURN" : "BLUE TEAM";
    this.messageTime = 1;
    this.updateToolbar();
  }

  endTurn() {
    if (this.gameMode !== "classic" || this.state !== "playing") return;
    const previous = this.turnTeam;
    const indexKey = previous === "player" ? "playerIndex" : "enemyIndex";
    const teamList = previous === "player" ? this.playerTeam : this.enemyTeam;
    const previousWorm = previous === "player" ? this.player : this.enemy;
    previousWorm.rope = null;
    this[indexKey] = (this[indexKey] + 1) % teamList.length;
    this.turnNumber += 1;
    this.beginTurn(previous === "player" ? "enemy" : "player");
  }

  canControl(worm) {
    return this.state === "playing"
      && worm?.alive
      && (this.gameMode !== "classic" || (this.turnTeam === "player" && !this.turnResolving && worm === this.player));
  }

  selectWeapon(id) {
    if (!this.canControl(this.localWorm)) return;
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
    if (!this.canControl(this.localWorm)) return;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.pointerPosition(event);
    let side;
    if (Math.hypot(point.x - 890, point.y - 430) < 62) side = "jump";
    else if (Math.hypot(point.x - 890, point.y - 330) < 62) side = "fire";
    else side = point.x < 480 ? "move" : "aim";
    this.pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y, side });
    if (side === "jump") this.jump();
    else if (side === "fire") this.fire();
    else if (side === "aim") this.setAimFromPointer(point, this.pointers.get(event.pointerId));
  }

  pointerMove(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    const point = this.pointerPosition(event);
    pointer.x = point.x;
    pointer.y = point.y;
    if (pointer.side === "aim") this.setAimFromPointer(point, pointer);
  }

  pointerUp(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    this.pointers.delete(event.pointerId);
  }

  setAimFromPointer(point, pointer = point) {
    const worm = this.localWorm;
    if (!this.canControl(worm)) return;
    const dx = point.x - pointer.startX;
    const dy = point.y - pointer.startY;
    if (Math.hypot(dx, dy) < 8) return;
    worm.aim = Math.atan2(dy, dx);
    worm.facing = Math.cos(worm.aim) >= 0 ? 1 : -1;
    this.localInput.aim = worm.aim;
  }

  jump() {
    const worm = this.localWorm;
    if (!this.canControl(worm)) return;
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
    if (!this.canControl(worm) || worm.cooldown > 0) return;
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
      this.projectiles.push({
        type: "bullet", owner: worm, x: worm.x + direction.x * 24, y: worm.y + direction.y * 24,
        vx: direction.x * 330, vy: direction.y * 330, life: 2.2, radius: 4,
      });
      this.burst(worm.x + direction.x * 22, worm.y + direction.y * 22, "#fff3ad", 5);
      worm.cooldown = 0.5;
    } else if (id === "rocket" || id === "grenade" || id === "molotov") {
      this.projectiles.push({
        type: id, owner: worm, x: worm.x + direction.x * 23, y: worm.y + direction.y * 23,
        vx: direction.x * (id === "rocket" ? 430 : 300),
        vy: direction.y * (id === "rocket" ? 430 : 300) - (id === "grenade" || id === "molotov" ? 80 : 0),
        life: id === "rocket" ? 3 : id === "molotov" ? 1.8 : 2.1,
        radius: id === "rocket" ? 5 : 7,
      });
      worm.cooldown = id === "rocket" ? 1.6 : id === "molotov" ? 1.5 : 1.3;
    } else if (id === "bat" || id === "finger") {
      this.meleeAttacks.push({
        owner: worm, angle, age: 0,
        duration: id === "bat" ? 0.42 : 0.28,
        strikeAt: id === "bat" ? 0.26 : 0.14,
        weapon: id,
        struck: false,
      });
      worm.cooldown = id === "bat" ? 0.95 : 0.48;
    } else if (id === "dig") {
      this.crater(worm.x + direction.x * 30, worm.y + direction.y * 24, 18);
      worm.cooldown = 0.45;
    } else if (id === "block") {
      const x = clamp(worm.x + direction.x * 52 - 22, 10, 906);
      const y = Math.min(this.groundAt(x + 22, Math.max(0, worm.y - 20)) - 34, worm.y + direction.y * 58);
      this.blocks.push({ x, y, width: 44, height: 34, hp: 45, color: worm.color });
      worm.cooldown = 0.5;
    } else if (id === "rope") {
      if (worm.rope) {
        worm.rope = null;
        return;
      }
      else {
        const length = 190;
        const anchor = { x: clamp(worm.x + direction.x * length, 15, 945), y: clamp(worm.y + direction.y * length, 30, 490) };
        worm.rope = { ...anchor, length: distance(worm, anchor) };
      }
      worm.cooldown = 0.35;
    }
    if (ammo !== Infinity) worm.ammo[id] -= 1;
    if (this.gameMode === "classic" && worm === (this.turnTeam === "player" ? this.player : this.enemy) && id !== "rope") {
      this.turnResolving = true;
      this.turnSettleTime = 0;
    }
    if (worm === this.localWorm) this.updateToolbar();
  }

  hitscan(worm, angle) {
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const target = this.allWorms
      .filter((candidate) => candidate !== worm && candidate.alive)
      .sort((a, b) => distance(worm, a) - distance(worm, b))[0];
    if (!target) return;
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
    if (!worm?.alive || worm.invulnerable > 0 || this.state !== "playing") return;
    const absorbed = Math.min(worm.armor, Math.round(amount * 0.6));
    worm.armor -= absorbed;
    worm.hp = Math.max(0, worm.hp - (amount - absorbed));
    worm.vx += vx;
    worm.vy += vy;
    worm.angularVelocity += clamp(vx * 0.012 + (Math.random() - 0.5) * 5, -8, 8);
    worm.squash = 1;
    worm.invulnerable = 0.2;
    worm.hurtTime = 0.58;
    worm.hurtTilt = (Math.random() - 0.5) * 0.9;
    this.particles.push({
      type: "text", x: worm.x, y: worm.y - 24, vx: vx * 0.05, vy: -48,
      text: `-${amount - absorbed}`, life: 0.9, maxLife: 0.9, color: "#fff3ad",
    });
    this.burst(worm.x, worm.y, worm.color, 8);
    if (worm.hp <= 0) this.killWorm(worm);
  }

  killWorm(worm) {
    if (!worm.alive) return;
    worm.alive = false;
    worm.hp = 0;
    worm.rope = null;
    worm.deathTime = 1.7;
    this.burst(worm.x, worm.y, "#ffffff", 24);
    if (!this.livingTeam("enemy").length) this.finish(true);
    else if (!this.livingTeam("player").length) this.finish(false);
    else if (this.gameMode === "classic" && (worm === this.player || worm === this.enemy)) {
      this.turnResolving = true;
    }
  }

  explode(x, y, radius = 55, damage = 34) {
    this.crater(x, y, radius);
    this.allWorms.forEach((worm) => {
      if (!worm.alive) return;
      const d = distance(worm, { x, y });
      if (d < radius + worm.radius) {
        const force = 1 - d / (radius + worm.radius);
        const nx = (worm.x - x) / Math.max(d, 1);
        const ny = (worm.y - y) / Math.max(d, 1);
        this.damage(worm, Math.round(damage * clamp(force, 0.35, 1)), nx * 520 * force, ny * 260 * force - 285 * force);
      }
    });
    this.blocks = this.blocks.filter((block) => distance({ x: block.x + 22, y: block.y + 17 }, { x, y }) > radius);
    this.burst(x, y, "#ffd36a", 30);
  }

  crater(x, y, radius) {
    const minX = clamp(Math.floor(x - radius), 0, 959);
    const maxX = clamp(Math.ceil(x + radius), 0, 959);
    const minY = clamp(Math.floor(y - radius), 0, 539);
    const maxY = clamp(Math.ceil(y + radius), 0, 539);
    for (let row = minY; row <= maxY; row += 1) {
      for (let column = minX; column <= maxX; column += 1) {
        if ((column - x) ** 2 + (row - y) ** 2 <= radius ** 2) {
          this.terrain[row * 960 + column] = 0;
        }
      }
    }
    this.terrainDirty = true;
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
  if (!worm.alive) {
    worm.deathTime = Math.max(0, (worm.deathTime ?? 0) - dt);
    return;
  }
  worm.animTime += dt;
  worm.blinkClock -= dt;
  if (worm.blinkClock < -0.13) worm.blinkClock = 1.8 + Math.random() * 3.6;
  worm.squash = Math.max(0, worm.squash - dt * 3.4);
  worm.cooldown = Math.max(0, worm.cooldown - dt);
  worm.invulnerable = Math.max(0, worm.invulnerable - dt);
  worm.hurtTime = Math.max(0, (worm.hurtTime ?? 0) - dt);
  worm.vx += input * 580 * dt;
  worm.vx *= Math.pow(worm.grounded ? 0.001 : 0.12, dt);
  worm.vx = clamp(worm.vx, -145, 145);
  worm.vy += 720 * dt;
  worm.bodyAngle += worm.angularVelocity * dt;
  worm.angularVelocity *= Math.pow(worm.grounded ? 0.003 : 0.55, dt);
  if (worm.grounded && worm.hurtTime <= 0) worm.bodyAngle *= Math.pow(0.0005, dt);
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
  
  // Горизонтальное движение с улучшенной проверкой
  const oldX = worm.x;
  const candidateX = clamp(worm.x + worm.vx * dt, worm.radius, 960 - worm.radius);
  if (this.circleHitsSolid(candidateX, worm.y, worm.radius)) {
    let stepped = false;
    if (worm.grounded) {
      for (let step = 1; step <= 12; step += 1) {
        if (!this.circleHitsSolid(candidateX, worm.y - step, worm.radius)) {
          worm.x = candidateX;
          worm.y -= step;
          stepped = true;
          break;
        }
      }
    }
    if (!stepped) {
      // Пробуем в другую сторону
      for (let step = 1; step <= 4; step += 1) {
        if (!this.circleHitsSolid(candidateX, worm.y + step, worm.radius)) {
          worm.x = candidateX;
          worm.y += step;
          stepped = true;
          break;
        }
      }
    }
    if (!stepped) {
      worm.vx = 0;
      worm.x = oldX;
    }
  } else {
    worm.x = candidateX;
  }
  
  // Вертикальное движение с улучшенной проверкой
  const oldY = worm.y;
  const candidateY = worm.y + worm.vy * dt;
  const direction = Math.sign(candidateY - oldY);
  let safeY = oldY;
  let verticalCollision = false;
  
  if (direction) {
    // Используем более мелкие шаги для точной проверки
    const stepSize = direction > 0 ? 1 : -1;
    let currentY = oldY;
    // Проверяем с шагом 1 пиксель для точности
    const maxSteps = Math.abs(Math.round(candidateY - oldY)) + 5;
    for (let step = 0; step < maxSteps; step += 1) {
      const nextY = currentY + stepSize;
      // Проверяем не только центр, но и нижнюю/верхнюю часть червячка
      let hit = false;
      for (let offset = -worm.radius * 0.6; offset <= worm.radius * 0.6; offset += worm.radius * 0.3) {
        const checkX = worm.x + offset;
        if (this.circleHitsSolid(checkX, nextY, worm.radius * 0.8)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        verticalCollision = true;
        safeY = currentY;
        break;
      }
      currentY = nextY;
      safeY = nextY;
      if (Math.abs(currentY - oldY) >= Math.abs(candidateY - oldY)) break;
    }
  }
  
  if (verticalCollision) {
    const impact = worm.vy;
    worm.y = safeY;
    worm.vy = 0;
    worm.grounded = direction > 0;
    if (direction > 0) {
      if (impact > 240) worm.squash = clamp((impact - 200) / 420, 0.25, 1);
      if (impact > 520) this.damage(worm, Math.round((impact - 500) / 13));
    }
  } else {
    worm.y = candidateY;
    // Проверяем grounded более тщательно
    worm.grounded = false;
    for (let offset = -worm.radius * 0.6; offset <= worm.radius * 0.6; offset += worm.radius * 0.3) {
      const checkX = worm.x + offset;
      const checkY = worm.y + worm.radius * 0.9;
      if (this.isTerrainSolid(Math.round(checkX), Math.round(checkY)) || 
          this.isBlockSolid(checkX, checkY)) {
        worm.grounded = true;
        break;
      }
    }
    // Если червячок касается земли снизу, но не стоит на ней
    if (!worm.grounded && worm.vy >= 0) {
      const belowY = worm.y + worm.radius + 2;
      for (let offset = -worm.radius * 0.5; offset <= worm.radius * 0.5; offset += worm.radius * 0.3) {
        const checkX = worm.x + offset;
        if (this.isTerrainSolid(Math.round(checkX), Math.round(belowY)) || 
            this.isBlockSolid(checkX, belowY)) {
          worm.grounded = true;
          break;
        }
      }
    }
  }
  
  // Обработка лавы и падения
  if (worm.y + worm.radius >= 515) {
    worm.lavaExposure = (worm.lavaExposure ?? 0) + dt;
    while (worm.lavaExposure >= 1) {
      worm.lavaExposure -= 1;
      worm.hp = Math.max(0, worm.hp - 1);
      worm.hurtTime = 0.45;
      worm.hurtTilt = (Math.random() - 0.5) * 0.7;
      if (worm.hp <= 0) this.killWorm(worm);
    }
  } else {
    worm.lavaExposure = 0;
  }
  if (worm.y > 560) {
    this.killWorm(worm);
  }
}

  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.life -= dt;
      const gravity = projectile.type === "grenade" || projectile.type === "molotov"
        ? 610
        : projectile.type === "bullet"
          ? 0
          : 70;
      const windFactor = projectile.type === "bullet" ? 0.12 : projectile.type === "rocket" ? 0.8 : 1.15;
      projectile.vx += this.wind * windFactor * dt;
      projectile.vy += gravity * dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      const touchesSolid = this.isTerrainSolid(projectile.x, projectile.y + projectile.radius)
        || this.isBlockSolid(projectile.x, projectile.y + projectile.radius);
      if (projectile.type === "grenade" && touchesSolid) {
        while (this.isTerrainSolid(projectile.x, projectile.y + projectile.radius)
          || this.isBlockSolid(projectile.x, projectile.y + projectile.radius)) projectile.y -= 1;
        projectile.vy *= -0.48;
        projectile.vx *= 0.72;
      }
      const target = this.allWorms.find(
        (worm) => worm.alive && worm !== projectile.owner && distance(worm, projectile) < worm.radius + projectile.radius,
      );
      const touchesGround = this.isTerrainSolid(projectile.x, projectile.y)
        || this.isBlockSolid(projectile.x, projectile.y);
      if (projectile.type === "bullet" && (target || touchesGround)) {
        if (target) this.damage(target, 10, Math.sign(projectile.vx) * 75, -25);
        this.burst(projectile.x, projectile.y, target ? "#fff3ad" : "#d7a96a", 7);
        return false;
      }
      if (projectile.type === "bullet"
        && (projectile.life <= 0 || projectile.x < 0 || projectile.x > 960 || projectile.y < 0 || projectile.y > 540)) {
        return false;
      }
      if (projectile.type === "molotov" && (target || touchesGround || projectile.life <= 0)) {
        const surface = this.groundAt(projectile.x, Math.max(0, projectile.y - 14));
        this.ignite(projectile.x, Math.min(projectile.y, surface - 4));
        return false;
      }
      const hitGround = projectile.type === "rocket" && touchesGround;
      const expired = projectile.life <= 0 || projectile.x < 0 || projectile.x > 960 || projectile.y > 540;
      if (target || hitGround || expired) {
        this.explode(projectile.x, projectile.y, projectile.type === "rocket" ? 58 : 52, projectile.type === "rocket" ? 38 : 34);
        return false;
      }
      return true;
    });
  }

  updateMeleeAttacks(dt) {
    this.meleeAttacks = this.meleeAttacks.filter((attack) => {
      attack.age += dt;
      if (!attack.struck && attack.age >= attack.strikeAt) {
        attack.struck = true;
        const target = this.allWorms
          .filter((worm) => worm !== attack.owner && worm.alive)
          .sort((a, b) => distance(attack.owner, a) - distance(attack.owner, b))[0];
        if (!target) return attack.age < attack.duration;
        const dx = target.x - attack.owner.x;
        const dy = target.y - attack.owner.y;
        const d = Math.hypot(dx, dy);
        const facing = Math.cos(Math.atan2(dy, dx) - attack.angle);
        const range = attack.weapon === "bat" ? 68 : 48;
        if (d < range && facing > 0.35) {
          const damage = attack.weapon === "bat" ? 22 : 7;
          const pushX = attack.weapon === "bat" ? 510 : 150;
          const pushY = attack.weapon === "bat" ? -300 : -75;
          this.damage(target, damage, Math.cos(attack.angle) * pushX, pushY);
          this.burst(target.x, target.y, attack.owner.color, 12);
        }
      }
      return attack.age < attack.duration;
    });
  }

  ignite(x, y) {
    let cursor = clamp(x, 15, 945);
    const scanY = Math.max(0, y - 22);
    const direction = this.groundAt(cursor - 18, scanY) > this.groundAt(cursor + 18, scanY) ? -1 : 1;
    for (let index = 0; index < 9; index += 1) {
      cursor = clamp(cursor + direction * 18, 10, 950);
      this.firePatches.push({
        x: cursor,
        y: this.groundAt(cursor, scanY) - 3,
        life: 5.5 - index * 0.18,
        burnClock: 0.3 + index * 0.11,
      });
    }
    this.burst(x, y, "#ff9d3d", 22);
  }

  updateFire(dt) {
    this.firePatches = this.firePatches.filter((patch) => {
      patch.life -= dt;
      patch.burnClock -= dt;
      patch.y = this.groundAt(patch.x, Math.max(0, patch.y - 18)) - 3;
      if (patch.burnClock <= 0) {
        patch.burnClock = 1.15;
        this.crater(patch.x, patch.y + 3, 2.5);
      }
      return patch.life > 0;
    });
    for (const worm of this.allWorms) {
      if (!worm.alive) continue;
      const burning = this.firePatches.some((patch) => distance(worm, patch) < worm.radius + 18);
      if (!burning) {
        worm.fireExposure = 0;
        continue;
      }
      worm.fireExposure = (worm.fireExposure ?? 0) + dt;
      while (worm.fireExposure >= 0.5) {
        worm.fireExposure -= 0.5;
        this.damage(worm, 2);
      }
    }
  }

  updateAI(dt) {
    if (!this.enemy?.alive || this.state !== "playing") return;
    if (this.gameMode === "classic" && (this.turnTeam !== "enemy" || this.turnResolving)) return;
    const bot = this.enemy;
    if (!this.aiPlan || !this.aiPlan.target?.alive) this.aiPlan = this.makeAIPlan(bot);
    const plan = this.aiPlan;
    const target = plan.target;
    plan.age += dt;
    const dx = target.x - bot.x;
    const distanceToTarget = Math.abs(dx);
    const ranged = ["pistol", "rocket", "grenade", "molotov"].some((id) => bot.ammo[id] === Infinity || bot.ammo[id] > 0);
    const atPosition = Math.abs(plan.destinationX - bot.x) < 16;
    let move = atPosition ? 0 : Math.sign(plan.destinationX - bot.x) * 0.72;
    if (!ranged || plan.weapon === "bat" || plan.weapon === "finger") move = distanceToTarget > 44 ? Math.sign(dx) * 0.9 : 0;
    if (this.gameMode !== "classic") this.updateWorm(bot, dt, move);
    else bot.aiMove = move;
    if (move) bot.facing = Math.sign(move);

    const aheadX = clamp(bot.x + Math.sign(move || dx) * 24, 20, 940);
    const obstacle = this.groundAt(aheadX, Math.max(0, bot.y - 24)) < bot.y + bot.radius - 3;
    const gap = this.groundAt(aheadX, bot.y) > bot.y + 55;
    if (bot.grounded && move && (obstacle || gap || bot.aiStuckX === Math.round(bot.x))) {
      bot.vy = -285;
      bot.grounded = false;
    }
    bot.aiStuckX = Math.random() < dt * 2 ? Math.round(bot.x) : bot.aiStuckX;

    bot.aim = this.findAIAim(bot, target, plan.weapon);
    bot.facing = Math.cos(bot.aim) >= 0 ? 1 : -1;
    const canStrike = (plan.weapon === "bat" || plan.weapon === "finger") ? distanceToTarget < 62 : true;
    const shouldFire = plan.age > 0.8 && canStrike && (atPosition || plan.age > 3.8 || this.turnTime < 8);
    if (shouldFire && bot.cooldown <= 0) {
      this.useWeapon(bot, plan.weapon, bot.aim + (Math.random() - 0.5) * 0.045);
      this.aiPlan = null;
    }
  }

  makeAIPlan(bot) {
    const enemies = this.livingTeam("player");
    const target = enemies.reduce((best, worm) => {
      const score = distance(bot, worm) + worm.hp * 1.4 - (bot.y - worm.y) * 0.25;
      return !best || score < best.score ? { worm, score } : best;
    }, null)?.worm ?? this.player;
    const d = distance(bot, target);
    let weapon = "finger";
    if (d < 68 && bot.ammo.bat > 0) weapon = "bat";
    else if (d > 115 && bot.ammo.rocket > 0) weapon = "rocket";
    else if (d > 85 && bot.ammo.grenade > 0 && target.y > bot.y - 35) weapon = "grenade";
    else if (bot.ammo.pistol > 0) weapon = "pistol";
    else if (bot.ammo.molotov > 0) weapon = "molotov";
    else if (bot.ammo.bat > 0) weapon = "bat";

    const desiredRange = weapon === "bat" || weapon === "finger" ? 42 : weapon === "molotov" ? 150 : 260;
    let destinationX = bot.x;
    let bestScore = -Infinity;
    for (let x = clamp(bot.x - 210, 24, 936); x <= clamp(bot.x + 210, 24, 936); x += 30) {
      const y = this.groundAt(x) - bot.radius;
      const range = Math.abs(target.x - x);
      const heightAdvantage = target.y - y;
      const clearShot = this.hasLineOfSight({ x, y }, target) ? 1 : 0;
      const lavaRisk = y > 480 ? 400 : 0;
      const travelCost = Math.abs(x - bot.x) * 0.18;
      const rangeScore = -Math.abs(range - desiredRange) * (weapon === "bat" || weapon === "finger" ? 1.7 : 0.35);
      const crateBonus = this.crates.some((crate) => Math.abs(crate.x - x) < 40 && (bot.hp < 55 || crate.type === "ammo")) ? 90 : 0;
      const score = rangeScore + heightAdvantage * 0.85 + clearShot * 80 + crateBonus - lavaRisk - travelCost;
      if (score > bestScore) {
        bestScore = score;
        destinationX = x;
      }
    }
    return { target, weapon, destinationX, age: 0 };
  }

  hasLineOfSight(from, to) {
    const d = distance(from, to);
    const steps = Math.max(2, Math.ceil(d / 12));
    for (let index = 2; index < steps - 1; index += 1) {
      const t = index / steps;
      if (this.isTerrainSolid(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) return false;
    }
    return true;
  }

  findAIAim(bot, target, weapon) {
    if (weapon === "bat" || weapon === "finger") return Math.atan2(target.y - bot.y, target.x - bot.x);
    const speed = weapon === "rocket" ? 430 : weapon === "pistol" ? 330 : 300;
    const gravity = weapon === "grenade" || weapon === "molotov" ? 610 : weapon === "pistol" ? 0 : 70;
    const windFactor = weapon === "pistol" ? 0.12 : weapon === "rocket" ? 0.8 : 1.15;
    const facingBase = target.x >= bot.x ? 0 : Math.PI;
    let best = { angle: Math.atan2(target.y - bot.y, target.x - bot.x), miss: Infinity };
    for (let index = 0; index <= 46; index += 1) {
      const lift = -1.35 + index / 46 * 2.15;
      const angle = facingBase === 0 ? lift : Math.PI - lift;
      let x = bot.x + Math.cos(angle) * 23;
      let y = bot.y + Math.sin(angle) * 23;
      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed - ((weapon === "grenade" || weapon === "molotov") ? 80 : 0);
      let miss = Infinity;
      for (let step = 0; step < 75; step += 1) {
        vx += this.wind * windFactor * 0.045;
        vy += gravity * 0.045;
        x += vx * 0.045;
        y += vy * 0.045;
        miss = Math.min(miss, Math.hypot(x - target.x, y - target.y));
        if (this.isTerrainSolid(x, y) || x < 0 || x > 960 || y > 540) break;
      }
      if (miss < best.miss) best = { angle, miss };
    }
    return best.angle;
  }

  updateCrates(dt) {
    this.crateClock -= dt;
    if (this.crateClock <= 0 && this.crates.length < 2) {
      const x = 130 + Math.random() * 700;
      this.crates.push({ x, y: -20, vy: 0, type: ["health", "armor", "ammo"][Math.floor(Math.random() * 3)] });
      this.crateClock = 28 + Math.random() * 10;
      this.message = "SUPPLIES!";
      this.messageTime = 1.5;
    }
    this.crates = this.crates.filter((crate) => {
      crate.vy += 400 * dt;
      crate.y += crate.vy * dt;
      const ground = this.groundAt(crate.x, Math.max(0, crate.y));
      if (crate.y > ground - 13) {
        crate.y = ground - 13;
        crate.vy = 0;
      }
      for (const worm of this.allWorms) {
        if (!worm.alive) continue;
        if (distance(crate, worm) < 32) {
          if (crate.type === "health") worm.hp = Math.min(this.gameMode === "classic" ? 100 : 120, worm.hp + 30);
          else if (crate.type === "armor") worm.armor = Math.min(50, worm.armor + 30);
          else {
            worm.ammo.pistol += 3;
            worm.ammo.rocket += 1;
            worm.ammo.grenade += 1;
            worm.ammo.molotov += 1;
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
    this.message = playerWon ? "VICTORY!" : "DEFEAT";
    this.messageTime = Infinity;
    this.callbacks.onStatus?.(playerWon ? "You won!" : "Computer won");
    const restart = document.createElement("button");
    restart.type = "button";
    restart.className = "worms-restart";
    restart.textContent = "Choose a new map";
    restart.addEventListener("click", () => {
      restart.remove();
      this.state = "maps";
      this.mapChoice.hidden = false;
      this.toolbar.hidden = true;
      this.callbacks.onStatus?.("Choose a mode and arena");
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
      lavaExposure: worm.lavaExposure, fireExposure: worm.fireExposure,
      hurtTime: worm.hurtTime, hurtTilt: worm.hurtTilt,
      alive: worm.alive, deathTime: worm.deathTime ?? 0,
      bodyAngle: worm.bodyAngle, angularVelocity: worm.angularVelocity, squash: worm.squash,
      ammo: Object.fromEntries(
        Object.entries(worm.ammo).map(([key, value]) => [key, value === Infinity ? -1 : value]),
      ),
      rope: worm.rope ? { ...worm.rope } : null,
    };
  }

  applyWormState(worm, state, smooth = false) {
    if (!worm || !state) return;
    const ammo = Object.fromEntries(
      Object.entries(state.ammo ?? {}).map(([key, value]) => [key, value === -1 ? Infinity : value]),
    );
    if (smooth) {
      worm._netTarget = { x: state.x, y: state.y, vx: state.vx, vy: state.vy, aim: state.aim };
      const { x, y, vx, vy, aim, ...rest } = state;
      Object.assign(worm, rest, { ammo });
    } else {
      Object.assign(worm, state, { ammo });
    }
  }

  createSnapshot() {
    return {
      kind: "worms",
      phase: this.state,
      mapId: this.mapId,
      tick: Math.round(this.time * 60),
      wind: this.wind,
      revision: Date.now(),
      player: this.serializeWorm(this.player),
      enemy: this.serializeWorm(this.enemy),
      projectiles: this.projectiles.map(({ owner, ...projectile }) => ({
        ...projectile,
        ownerSide: owner === this.player ? "player" : "enemy",
      })),
      meleeAttacks: this.meleeAttacks.map(({ owner, ...attack }) => ({
        ...attack,
        ownerSide: owner === this.player ? "player" : "enemy",
      })),
      firePatches: this.firePatches.map((patch) => ({ ...patch })),
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
      this.callbacks.onStatus?.("The room host is choosing a map...");
      return;
    }
    if (!this.player || this.mapId !== snapshot.mapId) this.start(snapshot.mapId, false);
    const firstSnapshot = !this.player._hasNetworkState;
    this.applyWormState(this.player, snapshot.player, !firstSnapshot);
    this.applyWormState(this.enemy, snapshot.enemy, !firstSnapshot);
    this.player._hasNetworkState = true;
    this.enemy._hasNetworkState = true;
    this.projectiles = (snapshot.projectiles ?? []).map((projectile) => ({
      ...projectile,
      owner: projectile.ownerSide === "player" ? this.player : this.enemy,
    }));
    this.meleeAttacks = (snapshot.meleeAttacks ?? []).map((attack) => ({
      ...attack,
      owner: attack.ownerSide === "player" ? this.player : this.enemy,
    }));
    this.firePatches = (snapshot.firePatches ?? []).map((patch) => ({ ...patch }));
    this.crates = (snapshot.crates ?? []).map((crate) => ({ ...crate }));
    this.blocks = (snapshot.blocks ?? []).map((block) => ({ ...block }));
    const events = snapshot.terrainEvents ?? [];
    for (let index = this.appliedTerrainEvents; index < events.length; index += 1) {
      const event = events[index];
      this.crater(event.x, event.y, event.radius);
    }
    this.appliedTerrainEvents = events.length;
    this.time = (snapshot.tick ?? 0) / 60;
    this.wind = Number.isFinite(snapshot.wind) ? snapshot.wind : this.wind;
    this.message = snapshot.message === "VICTORY!"
      ? "DEFEAT"
      : snapshot.message === "DEFEAT"
        ? "VICTORY!"
        : snapshot.message ?? "";
    this.messageTime = snapshot.messageTime ?? 0;
    this.state = snapshot.phase === "finished" ? "finished" : "playing";
    if (this.state === "finished") {
      this.callbacks.onStatus?.(this.message === "VICTORY!" ? "You won!" : "The room host won");
    }
    this.updateToolbar();
  }

  adjustRope(worm, delta, dt) {
    if (!worm.rope || !delta) return;
    worm.rope.length = clamp(worm.rope.length + delta * 120 * dt, 42, 300);
  }

  updateNetworkHost(dt, localMove, localRopeDelta) {
    this.adjustRope(this.player, localRopeDelta, dt);
    this.updateWorm(this.player, dt, localMove);
    if (localMove) this.player.facing = Math.sign(localMove);

    const remoteInput = this.network.getRemoteInput?.();
    const move = clamp(Number(remoteInput?.move) || 0, -1, 1);
    const ropeDelta = clamp(Number(remoteInput?.ropeDelta) || 0, -1, 1);
    this.enemy.aim = Number.isFinite(remoteInput?.aim) ? remoteInput.aim : this.enemy.aim;
    this.enemy.facing = Math.cos(this.enemy.aim) >= 0 ? 1 : -1;
    this.adjustRope(this.enemy, ropeDelta, dt);
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
    this.updateMeleeAttacks(dt);
    this.updateFire(dt);
    this.updateCrates(dt);
    this.networkClock += dt;
    if (this.networkClock >= 1 / 12) {
      this.networkClock = 0;
      this.publishSnapshot();
    }
  }

  updateGuestPresentation(dt) {
    for (const worm of this.allWorms) {
      worm.animTime += dt;
      worm.blinkClock -= dt;
      if (worm.blinkClock < -0.13) worm.blinkClock = 1.8 + Math.random() * 3.6;
      const target = worm._netTarget;
      if (!target) continue;
      const factor = 1 - Math.exp(-18 * dt);
      worm.x += (target.x - worm.x) * factor;
      worm.y += (target.y - worm.y) * factor;
      worm.vx += (target.vx - worm.vx) * factor;
      worm.vy += (target.vy - worm.vy) * factor;
      if (worm !== this.localWorm) {
        const angleDelta = Math.atan2(Math.sin(target.aim - worm.aim), Math.cos(target.aim - worm.aim));
        worm.aim += angleDelta * factor;
      }
    }
    for (const projectile of this.projectiles) {
      const gravity = projectile.type === "grenade" || projectile.type === "molotov"
        ? 610
        : projectile.type === "bullet"
          ? 0
          : 70;
      projectile.vx += this.wind * (projectile.type === "bullet" ? 0.12 : projectile.type === "rocket" ? 0.8 : 1.15) * dt;
      projectile.vy += gravity * dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
    }
    for (const attack of this.meleeAttacks) attack.age = Math.min(attack.duration, attack.age + dt);
  }

  update(dt) {
    if (this.state !== "playing") return;
    this.time += dt;
    this.messageTime -= dt;
    let input = 0;
    let ropeDelta = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) input -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) input += 1;
    for (const pointer of this.pointers.values()) {
      if (pointer.side === "move") {
        input += clamp((pointer.x - pointer.startX) / 55, -1, 1);
        ropeDelta += clamp((pointer.y - pointer.startY) / 55, -1, 1);
      }
    }
    input = clamp(input, -1, 1);
    ropeDelta = clamp(ropeDelta, -1, 1);
    if (this.localWorm?.rope) {
      if (this.keys.has("w") || this.keys.has("arrowup")) ropeDelta -= 1;
      if (this.keys.has("s") || this.keys.has("arrowdown")) ropeDelta += 1;
    }
    const wantsJump = !this.localWorm?.rope && (this.keys.has("w") || this.keys.has("arrowup"));
    if (wantsJump && !this.jumpHeld && this.localWorm?.grounded) this.jump();
    this.jumpHeld = wantsJump;

    if (this.networkRole === "guest") {
      this.localInput.move = input;
      this.localInput.ropeDelta = ropeDelta;
      this.localInput.aim = this.localWorm.aim;
      this.inputClock += dt;
      this.sendNetworkInput();
      this.updateGuestPresentation(dt);
      return;
    }

    if (this.networkRole === "host") this.updateNetworkHost(dt, input, ropeDelta);
    else if (this.gameMode === "classic") {
      if (!this.turnResolving) {
        this.turnTime = Math.max(0, this.turnTime - dt);
        if (this.turnTime <= 0) this.turnResolving = true;
      }
      this.updateAI(dt);
      for (const worm of this.allWorms) {
        const wormInput = worm === this.player && this.turnTeam === "player" && !this.turnResolving
          ? input
          : worm === this.enemy && this.turnTeam === "enemy" && !this.turnResolving
            ? worm.aiMove ?? 0
            : 0;
        this.updateWorm(worm, dt, wormInput);
        if (wormInput) worm.facing = Math.sign(wormInput);
      }
      this.updateProjectiles(dt);
      this.updateMeleeAttacks(dt);
      this.updateFire(dt);
      this.updateCrates(dt);
      if (this.turnResolving && this.state === "playing") {
        const actionFinished = this.projectiles.length === 0 && this.meleeAttacks.length === 0;
        const bodiesSettled = this.allWorms.every((worm) => !worm.alive || (Math.abs(worm.vx) < 8 && Math.abs(worm.vy) < 12));
        this.turnSettleTime = actionFinished && bodiesSettled ? this.turnSettleTime + dt : 0;
        if (this.turnSettleTime > 1.1) this.endTurn();
      }
    } else {
      this.adjustRope(this.player, ropeDelta, dt);
      this.updateWorm(this.player, dt, input);
      if (input) this.player.facing = Math.sign(input);
      this.updateAI(dt);
      this.updateProjectiles(dt);
      this.updateMeleeAttacks(dt);
      this.updateFire(dt);
      this.updateCrates(dt);
    }
    this.particles = this.particles.filter((particle) => {
      particle.life -= dt;
      if (particle.type === "dot") {
        particle.vy += 300 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      } else if (particle.type === "text") {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 35 * dt;
      }
      return particle.life > 0;
    });
  }

  drawTerrain() {
    const context = this.context;
    if (!this.terrainCanvas) {
      this.terrainCanvas = document.createElement("canvas");
      this.terrainCanvas.width = 960;
      this.terrainCanvas.height = 540;
    }
    if (this.terrainDirty) {
      const terrainContext = this.terrainCanvas.getContext("2d");
      const image = terrainContext.createImageData(960, 540);
      for (let y = 0; y < 540; y += 1) {
        for (let x = 0; x < 960; x += 1) {
          if (!this.terrain[y * 960 + x]) continue;
          const offset = (y * 960 + x) * 4;
          const edge = y < 4 || !this.terrain[(y - 3) * 960 + x];
          const grain = ((x * 17 + y * 29) % 19) - 9;
          if (edge) {
            image.data[offset] = 214 + grain;
            image.data[offset + 1] = 166 + grain;
            image.data[offset + 2] = 94 + grain / 2;
          } else {
            const depth = clamp((y - 270) / 270, 0, 1);
            image.data[offset] = 126 - depth * 52 + grain;
            image.data[offset + 1] = 88 - depth * 42 + grain;
            image.data[offset + 2] = 70 - depth * 26 + grain;
          }
          image.data[offset + 3] = 255;
        }
      }
      terrainContext.putImageData(image, 0, 0);
      this.terrainDirty = false;
    }
    context.drawImage(this.terrainCanvas, 0, 0);
  }

  drawWorm(worm) {
    const context = this.context;
    if (!worm.alive && (worm.deathTime ?? 0) <= 0) return;
    if (worm.invulnerable > 0 && Math.floor(worm.invulnerable * 30) % 2) return;
    const isActive = this.gameMode !== "classic" || worm === (this.turnTeam === "player" ? this.player : this.enemy);
    const hurt = clamp((worm.hurtTime ?? 0) / 0.58, 0, 1);
    const airborne = !worm.grounded;
    const crawl = worm.animTime * 9 + worm.x * 0.04;
    const breathing = Math.sin(worm.animTime * 3.2) * 0.035;
    const squash = worm.squash ?? 0;
    context.save();
    context.globalAlpha = worm.alive ? 1 : clamp((worm.deathTime ?? 0) / 1.7, 0, 1);
    context.translate(worm.x, worm.y);
    context.rotate(worm.bodyAngle ?? 0);
    if (hurt > 0) {
      const wobble = Math.sin(worm.hurtTime * 42);
      context.rotate(worm.hurtTilt * wobble);
      context.scale(1 + Math.abs(wobble) * 0.22, 1 - Math.abs(wobble) * 0.2);
    }
    context.scale(1 + squash * 0.24 + breathing, 1 - squash * 0.22 - breathing * 0.5);
    context.fillStyle = "rgba(8,10,24,.28)";
    context.beginPath();
    context.ellipse(-worm.facing * 2, 18, airborne ? 11 : 21, airborne ? 3 : 5, 0, 0, TAU);
    context.fill();

    // Tapered, curved body: three overlapping segments read as a soft worm, not a ball.
    const tailWave = airborne ? Math.sin(crawl) * 5 : Math.sin(crawl) * Math.min(4, Math.abs(worm.vx) / 35);
    const segments = [
      { x: -worm.facing * 15, y: 10 + tailWave, rx: 9, ry: 8 },
      { x: -worm.facing * 8, y: 6 - tailWave * 0.25, rx: 12, ry: 12 },
      { x: 0, y: 1, rx: 16, ry: 17 },
    ];
    context.fillStyle = worm.color;
    context.strokeStyle = "#171525";
    context.lineWidth = 3.5;
    for (const segment of segments) {
      context.beginPath();
      context.ellipse(segment.x, segment.y, segment.rx, segment.ry, -worm.facing * 0.15, 0, TAU);
      context.fill();
      context.stroke();
    }
    // A lighter belly makes the flexible silhouette easier to read.
    context.fillStyle = "rgba(255,255,255,.16)";
    context.beginPath();
    context.ellipse(-worm.facing * 4, 8, 8, 4, 0, 0, TAU);
    context.fill();

    context.fillStyle = "white";
    const blinking = worm.blinkClock < 0;
    context.beginPath();
    context.ellipse(worm.facing * 5, -5, 5, blinking ? 1.1 : 5.5, 0, 0, TAU);
    context.fill();
    context.fillStyle = "#171525";
    if (worm.alive && !blinking && hurt <= 0.25) {
      context.beginPath();
      context.arc(worm.facing * 7, -5, 2.2, 0, TAU);
      context.fill();
    } else if (hurt > 0.25 || !worm.alive) {
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(worm.facing * 2, -9);
      context.lineTo(worm.facing * 9, -2);
      context.moveTo(worm.facing * 9, -9);
      context.lineTo(worm.facing * 2, -2);
      context.stroke();
    }
    if (hurt > 0) {
      context.strokeStyle = "#171525";
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(worm.facing * 4, 5, 5, Math.PI * 1.1, Math.PI * 1.9);
      context.stroke();
    } else {
      context.fillStyle = "rgba(255,255,255,.35)";
      context.beginPath();
      context.arc(worm.facing * 10, 2, 2.4, 0, TAU);
      context.fill();
    }
    context.restore();

    if (!worm.alive) return;
    context.textAlign = "center";
    context.font = "900 11px Rubik, sans-serif";
    context.fillStyle = isActive ? "rgba(16,20,39,.9)" : "rgba(16,20,39,.62)";
    roundedRect(context, worm.x - 31, worm.y - 43, 62, 20, 8);
    context.fill();
    context.fillStyle = worm.color;
    context.fillText(`${worm.hp} HP`, worm.x, worm.y - 28);
    if (isActive && this.gameMode === "classic") {
      context.fillStyle = "#fff3ad";
      context.beginPath();
      context.moveTo(worm.x, worm.y - 49);
      context.lineTo(worm.x - 5, worm.y - 57);
      context.lineTo(worm.x + 5, worm.y - 57);
      context.closePath();
      context.fill();
    }
    if (hurt > 0) {
      context.fillStyle = "#fff3ad";
      context.font = "900 13px Rubik, sans-serif";
      const wobble = Math.sin(worm.hurtTime * 32) * 5;
      context.fillText("✦", worm.x - 23 + wobble, worm.y - 17);
      context.fillText("✧", worm.x + 24 - wobble, worm.y - 12);
    }
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
    const drawHealth = (team, active, x, align) => {
      const living = team.filter((worm) => worm.alive);
      const hp = living.reduce((total, worm) => total + worm.hp, 0);
      context.textAlign = align;
      context.fillStyle = "rgba(21,20,37,.86)";
      roundedRect(context, align === "left" ? x : x - 215, 18, 215, 58, 15);
      context.fill();
      context.fillStyle = active.color;
      context.font = "800 17px Rubik, sans-serif";
      const title = this.gameMode === "classic" ? `${active.team === "player" ? "PINK" : "BLUE"}  ${hp} HP` : `${active.name}  ${active.hp} HP`;
      context.fillText(title, x + (align === "left" ? 14 : -14), 43);
      context.fillStyle = "#9478ff";
      context.font = "700 12px Rubik, sans-serif";
      if (this.gameMode === "classic") {
        const startX = align === "left" ? x + 16 : x - 16;
        living.forEach((worm, index) => {
          context.fillStyle = worm === active ? "#fff3ad" : worm.color;
          context.beginPath();
          context.arc(startX + (align === "left" ? 1 : -1) * index * 18, 59, worm === active ? 5 : 4, 0, TAU);
          context.fill();
        });
      } else {
        context.fillText(`ARMOR ${active.armor}`, x + (align === "left" ? 14 : -14), 62);
      }
    };
    drawHealth(this.playerTeam, this.player, 18, "left");
    drawHealth(this.enemyTeam, this.enemy, 942, "right");
    context.textAlign = "center";
    context.fillStyle = "rgba(21,20,37,.75)";
    roundedRect(context, 424, 18, 112, 62, 13);
    context.fill();
    context.fillStyle = this.gameMode === "classic" && this.turnTime < 8 ? "#ff668c" : "white";
    context.font = "900 20px Rubik, sans-serif";
    const clock = this.gameMode === "classic"
      ? String(Math.ceil(this.turnTime)).padStart(2, "0")
      : `${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, "0")}`;
    context.fillText(clock, 480, 44);
    context.fillStyle = "#b7f34a";
    context.font = "800 10px Rubik, sans-serif";
    context.fillText(this.gameMode === "classic" ? `TURN ${this.turnNumber}` : "REAL TIME", 480, 62);

    const windLength = Math.abs(this.wind) * 0.38;
    context.strokeStyle = "rgba(255,255,255,.72)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(480, 91);
    context.lineTo(480 + Math.sign(this.wind) * windLength, 91);
    context.stroke();
    context.fillStyle = "white";
    context.beginPath();
    const tipX = 480 + Math.sign(this.wind) * windLength;
    context.moveTo(tipX, 91);
    context.lineTo(tipX - Math.sign(this.wind) * 7, 87);
    context.lineTo(tipX - Math.sign(this.wind) * 7, 95);
    context.closePath();
    context.fill();
    context.font = "800 9px Rubik, sans-serif";
    context.fillText(`WIND ${Math.round(Math.abs(this.wind))}`, 480, 106);
  }

  drawControls() {
    const context = this.context;
    const controlsEnabled = this.canControl(this.localWorm);
    const movePointer = [...this.pointers.values()].find((pointer) => pointer.side === "move");
    const aimPointer = [...this.pointers.values()].find((pointer) => pointer.side === "aim");
    const drawPad = (x, y, radius, pointer, color) => {
      context.fillStyle = "rgba(12,18,34,.38)";
      context.strokeStyle = "rgba(255,255,255,.35)";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
      context.stroke();
      context.fillStyle = color;
      context.beginPath();
      context.arc(
        pointer ? x + clamp(pointer.x - pointer.startX, -radius * 0.55, radius * 0.55) : x,
        pointer ? y + clamp(pointer.y - pointer.startY, -radius * 0.55, radius * 0.55) : y,
        radius * 0.34, 0, TAU,
      );
      context.fill();
    };

    context.globalAlpha = controlsEnabled ? 0.8 : 0.28;
    drawPad(95, 425, 58, movePointer, "rgba(255,255,255,.26)");
    drawPad(765, 425, 58, aimPointer, "rgba(99,220,255,.38)");

    context.fillStyle = "rgba(12,18,34,.52)";
    context.strokeStyle = "rgba(255,255,255,.35)";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(890, 430, 36, 0, TAU);
    context.fill();
    context.stroke();
    context.fillStyle = "#b7f34a";
    context.font = "900 22px Rubik, sans-serif";
    context.textAlign = "center";
    context.fillText("↑", 890, 438);

    context.fillStyle = "rgba(255,102,140,.72)";
    context.strokeStyle = "rgba(255,255,255,.55)";
    context.beginPath();
    context.arc(890, 330, 39, 0, TAU);
    context.fill();
    context.stroke();
    context.fillStyle = "white";
    context.font = "800 13px Rubik, sans-serif";
    context.fillText("FIRE", 890, 335);

    context.fillStyle = "rgba(255,255,255,.62)";
    context.font = "800 11px Rubik, sans-serif";
    context.fillText(this.localWorm.rope ? "MOVE / LENGTH" : "MOVE", 95, 501);
    context.fillText("AIM", 765, 501);
    context.globalAlpha = 1;
    if (controlsEnabled) {
      context.save();
      context.translate((960 - 960 * WORLD_ZOOM) / 2, 22);
      context.scale(WORLD_ZOOM, WORLD_ZOOM);
      context.strokeStyle = "rgba(255,255,255,.55)";
      context.setLineDash([7, 7]);
      context.beginPath();
      const worm = this.localWorm;
      context.moveTo(worm.x, worm.y);
      context.lineTo(worm.x + Math.cos(worm.aim) * 78, worm.y + Math.sin(worm.aim) * 78);
      context.stroke();
      context.setLineDash([]);
      context.restore();
    } else if (this.gameMode === "classic" && this.state === "playing") {
      context.fillStyle = "rgba(21,20,37,.72)";
      roundedRect(context, 400, 466, 160, 34, 12);
      context.fill();
      context.fillStyle = "white";
      context.font = "800 12px Rubik, sans-serif";
      context.fillText(this.turnResolving ? "RESOLVING..." : "BOT IS THINKING...", 480, 488);
    }
  }

  draw() {
    const context = this.context;
    const sky = context.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, "#47698d");
    sky.addColorStop(0.58, "#7794ad");
    sky.addColorStop(1, "#c8a18c");
    context.fillStyle = sky;
    context.fillRect(0, 0, 960, 540);

    context.fillStyle = "rgba(30,49,72,.18)";
    context.beginPath();
    context.moveTo(0, 310);
    for (let x = 0; x <= 960; x += 60) {
      context.lineTo(x, 245 + Math.sin(x / 85) * 38 + Math.sin(x / 31) * 13);
    }
    context.lineTo(960, 540);
    context.lineTo(0, 540);
    context.closePath();
    context.fill();

    context.fillStyle = "rgba(255,255,255,.12)";
    for (let index = 0; index < 7; index += 1) {
      const x = (index * 173 + 35) % 960;
      const y = 72 + (index % 3) * 63;
      context.beginPath();
      context.ellipse(x, y, 42, 11, 0, 0, TAU);
      context.ellipse(x + 28, y - 7, 28, 13, 0, 0, TAU);
      context.fill();
    }
    if (this.state === "maps") return;
    context.save();
    context.translate((960 - 960 * WORLD_ZOOM) / 2, 22);
    context.scale(WORLD_ZOOM, WORLD_ZOOM);
    this.drawTerrain();
    const lava = context.createLinearGradient(0, 512, 0, 540);
    lava.addColorStop(0, "rgba(255,210,72,.95)");
    lava.addColorStop(0.32, "rgba(255,102,34,.94)");
    lava.addColorStop(1, "rgba(112,20,32,.98)");
    context.fillStyle = lava;
    context.fillRect(0, 515, 960, 25);
    context.strokeStyle = "rgba(255,242,145,.9)";
    context.lineWidth = 3;
    context.beginPath();
    for (let x = 0; x <= 960; x += 12) {
      const y = 515 + Math.sin(this.time * 2.4 + x / 35) * 2;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
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
      context.fillStyle = projectile.type === "rocket"
        ? "#ff668c"
        : projectile.type === "bullet"
          ? "#fff4a9"
          : projectile.type === "molotov"
            ? "#ff8b3d"
            : "#171525";
      if (projectile.type === "bullet") {
        context.strokeStyle = "rgba(255,244,169,.45)";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(projectile.x, projectile.y);
        context.lineTo(projectile.x - projectile.vx * 0.045, projectile.y - projectile.vy * 0.045);
        context.stroke();
      }
      context.beginPath();
      context.arc(projectile.x, projectile.y, projectile.radius, 0, TAU);
      context.fill();
    }
    for (const patch of this.firePatches) {
      const flicker = Math.sin(this.time * 15 + patch.x) * 4;
      const flame = context.createLinearGradient(patch.x, patch.y - 30, patch.x, patch.y + 3);
      flame.addColorStop(0, "rgba(255,241,126,.15)");
      flame.addColorStop(0.45, "#ffcc48");
      flame.addColorStop(1, "#ef4a2b");
      context.fillStyle = flame;
      context.beginPath();
      context.moveTo(patch.x - 10, patch.y + 3);
      context.quadraticCurveTo(patch.x - 8, patch.y - 14, patch.x + flicker, patch.y - 27);
      context.quadraticCurveTo(patch.x + 13, patch.y - 10, patch.x + 10, patch.y + 3);
      context.closePath();
      context.fill();
    }
    for (const worm of this.allWorms) this.drawWorm(worm);
    for (const attack of this.meleeAttacks) {
      const progress = clamp(attack.age / attack.duration, 0, 1);
      const swing = attack.angle - 1.15 + progress * 2.3;
      context.strokeStyle = attack.struck ? "rgba(255,255,255,.8)" : "rgba(255,211,106,.72)";
      context.lineWidth = 8;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(attack.owner.x, attack.owner.y);
      context.lineTo(attack.owner.x + Math.cos(swing) * 46, attack.owner.y + Math.sin(swing) * 46);
      context.stroke();
      context.lineCap = "butt";
    }
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
      } else if (particle.type === "text") {
        context.font = "900 15px Rubik, sans-serif";
        context.textAlign = "center";
        context.fillText(particle.text, particle.x, particle.y);
      } else {
        context.beginPath();
        context.arc(particle.x, particle.y, 3, 0, TAU);
        context.fill();
      }
    }
    context.globalAlpha = 1;
    context.restore();
    this.drawHud();
    this.drawControls();
    if (this.messageTime > 0) {
      context.fillStyle = "rgba(21,20,37,.75)";
      roundedRect(context, 335, 220, 290, 82, 20);
      context.fill();
      context.fillStyle = this.message === "DEFEAT" ? "#ff668c" : "#b7f34a";
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
