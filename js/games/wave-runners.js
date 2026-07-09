import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const PLAYER_MAX_SPEED = 8.7;
const MAX_GREEN_SURFACE_RUN = 68;
const GREEN_SAFETY_MARGIN = 1.2;
const BASE_COLLECT_RATE = 76;
const TROPHY_TIERS = [
  { max: 500, items: ["🍎", "🍌", "🍓"] },
  { max: 1000, items: ["🍕", "⚽", "🎧"] },
  { max: 2000, items: ["📱", "🧸", "⭐"] },
  { max: 4000, items: ["🐱", "🐶", "🦊"] },
  { max: 8000, items: ["🦄", "💎", "🏆"] },
  { max: Infinity, items: ["🚀", "👑", "🌌"] },
];

const PLAYER_STATES = {
  RUNNING: "RUNNING",
  JUMPING: "JUMPING",
  IN_TRENCH: "IN_TRENCH",
  COLLECTING: "COLLECTING",
};

const WAVE_TYPES = [
  {
    id: "green",
    color: 0x5cff77,
    speed: 4.8,
    interval: MAX_GREEN_SURFACE_RUN / PLAYER_MAX_SPEED + GREEN_SAFETY_MARGIN,
    label: "GREEN",
  },
  { id: "yellow", color: 0xffd34d, speed: 13, interval: 4.5, label: "YELLOW" },
  { id: "red", color: 0xff4d68, speed: 18, interval: 3.1, label: "RED" },
];

export class WaveRunnersGame {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.classList.add("is-active");
    this.root.replaceChildren();
    this.keys = new Set();
    this.running = true;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.distance = 0;
    this.bestDistance = 0;
    this.trophies = 0;
    this.lootValue = 0;
    this.money = 0;
    this.speedLevel = 0;
    this.collectRateLevel = 0;
    this.speedUpgradeCost = 120;
    this.collectUpgradeCost = 80;
    this.wasActionPressed = false;
    this.collecting = null;
    this.deathFlash = 0;
    this.chunkLength = 34;
    this.trackWidth = 34;
    this.chunks = new Map();
    this.trenches = [];
    this.trophiesWorld = [];
    this.waves = [];
    this.nextWaveIn = 2.8;
    this.lastInputMove = 0;
    this.mobileInput = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      x: 0,
      y: 0,
      jump: false,
      action: false,
    };
    this.player = {
      x: 0,
      y: 1.55,
      z: 5,
      vx: 0,
      vy: 0,
      speed: 0,
      angle: 0,
      state: PLAYER_STATES.RUNNING,
      grounded: true,
      inTrench: false,
      box: new THREE.Box3(),
    };

    this.buildShell();
    this.buildScene();
    this.bindEvents();
    this.callbacks.onStatus?.("Run forward, jump trenches, hide from waves, and hold E near trophies.");
    this.frame = requestAnimationFrame(() => this.loop());
  }

  buildShell() {
    this.canvasHost = document.createElement("div");
    this.canvasHost.className = "wave-canvas-host";
    this.hud = document.createElement("div");
    this.hud.className = "wave-hud";
    this.hud.innerHTML = `
      <div><small>DISTANCE</small><strong data-wave-distance>0 m</strong></div>
      <div><small>MONEY</small><strong data-wave-money>$0</strong></div>
      <div><small>SPEED</small><strong data-wave-speed>8.7</strong></div>
      <div><small>TAKE RATE</small><strong data-wave-take-rate>$76/s</strong></div>
      <div><small>STATE</small><strong data-wave-state>RUNNING</strong></div>
      <div class="wave-collect" data-wave-collect hidden><span></span></div>
      <div class="wave-controls">W/S move, A/D turn, Space jumps, E harvests. On phone use the stick and right buttons.</div>
    `;
    this.touchControls = document.createElement("div");
    this.touchControls.className = "wave-touch";
    this.touchControls.innerHTML = `
      <div class="wave-stick" data-wave-stick><span></span></div>
      <div class="wave-touch-buttons">
        <button class="wave-touch-button" data-wave-jump type="button">JUMP</button>
        <button class="wave-touch-button is-action" data-wave-action type="button">TAKE</button>
      </div>
    `;
    this.overlay = document.createElement("div");
    this.overlay.className = "wave-reset";
    this.root.append(this.canvasHost, this.hud, this.touchControls, this.overlay);
    this.distanceEl = this.hud.querySelector("[data-wave-distance]");
    this.moneyEl = this.hud.querySelector("[data-wave-money]");
    this.speedEl = this.hud.querySelector("[data-wave-speed]");
    this.takeRateEl = this.hud.querySelector("[data-wave-take-rate]");
    this.stateEl = this.hud.querySelector("[data-wave-state]");
    this.collectEl = this.hud.querySelector("[data-wave-collect]");
    this.collectBar = this.collectEl.querySelector("span");
    this.stickEl = this.touchControls.querySelector("[data-wave-stick]");
    this.stickKnob = this.stickEl.querySelector("span");
    this.jumpButton = this.touchControls.querySelector("[data-wave-jump]");
    this.actionButton = this.touchControls.querySelector("[data-wave-action]");
  }

  buildScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc7e8);
    this.scene.fog = new THREE.Fog(0x8fc7e8, 70, 230);

    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 360);
    this.camera.position.set(0, 8, -12);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvasHost.append(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xdff5ff, 0x53653b, 1.8);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-8, 18, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -20;
    this.scene.add(sun);

    this.materials = {
      grass: new THREE.MeshStandardMaterial({ color: 0x5ea55d, roughness: 0.8 }),
      road: new THREE.MeshStandardMaterial({ color: 0xb9ac86, roughness: 0.85 }),
      trench: new THREE.MeshStandardMaterial({ color: 0x49352e, roughness: 0.95 }),
      safe: new THREE.MeshStandardMaterial({ color: 0x86b36f, roughness: 0.8 }),
      house: new THREE.MeshStandardMaterial({ color: 0xffd36a, roughness: 0.65 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xff668c, roughness: 0.7 }),
      machine: new THREE.MeshStandardMaterial({ color: 0x63dcff, roughness: 0.45, emissive: 0x174556, emissiveIntensity: 0.25 }),
      playerBody: new THREE.MeshStandardMaterial({ color: 0x4aa7ff, roughness: 0.65 }),
      playerSkin: new THREE.MeshStandardMaterial({ color: 0xf0c18f, roughness: 0.7 }),
      playerHair: new THREE.MeshStandardMaterial({ color: 0x2b1f27, roughness: 0.75 }),
      trophy: new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0x806000, emissiveIntensity: 0.45, roughness: 0.35 }),
    };

    const ground = new THREE.Mesh(new THREE.BoxGeometry(44, 0.3, 760), this.materials.grass);
    ground.position.set(0, -0.35, 210);
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);
    this.waveGroup = new THREE.Group();
    this.scene.add(this.waveGroup);
    this.trophyGroup = new THREE.Group();
    this.scene.add(this.trophyGroup);
    this.houseTrophyGroup = new THREE.Group();
    this.scene.add(this.houseTrophyGroup);
    this.createBase();
    this.playerGroup = this.createPlayer();
    this.scene.add(this.playerGroup);

    this.resize();
    this.generateChunksAround(0);
  }

  createPlayer() {
    const group = new THREE.Group();
    const makePart = (name, size, position, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
      mesh.name = name;
      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    this.parts = {
      torso: makePart("torso", new THREE.Vector3(0.9, 1.1, 0.45), new THREE.Vector3(0, 0.45, 0), this.materials.playerBody),
      head: makePart("head", new THREE.Vector3(0.68, 0.68, 0.68), new THREE.Vector3(0, 1.35, 0), this.materials.playerSkin),
      hair: makePart("hair", new THREE.Vector3(0.74, 0.22, 0.74), new THREE.Vector3(0, 1.78, 0), this.materials.playerHair),
      leftArm: makePart("leftArm", new THREE.Vector3(0.28, 0.95, 0.3), new THREE.Vector3(-0.72, 0.42, 0), this.materials.playerSkin),
      rightArm: makePart("rightArm", new THREE.Vector3(0.28, 0.95, 0.3), new THREE.Vector3(0.72, 0.42, 0), this.materials.playerSkin),
      leftLeg: makePart("leftLeg", new THREE.Vector3(0.32, 0.95, 0.34), new THREE.Vector3(-0.25, -0.6, 0), this.materials.playerBody),
      rightLeg: makePart("rightLeg", new THREE.Vector3(0.32, 0.95, 0.34), new THREE.Vector3(0.25, -0.6, 0), this.materials.playerBody),
    };
    return group;
  }

  createBase() {
    this.baseGroup = new THREE.Group();
    this.scene.add(this.baseGroup);
    const safeStrip = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth, 0.5, 28), this.materials.safe);
    safeStrip.position.set(0, 0.08, 8);
    safeStrip.receiveShadow = true;
    this.baseGroup.add(safeStrip);

    const house = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(22.5, 1.05, 18.6), this.materials.house);
    floor.position.set(0, 0.18, 0);
    floor.receiveShadow = true;
    house.add(floor);
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(22.5, 9.6, 1.05), this.materials.house);
    backWall.position.set(0, 4.8, -9.3);
    backWall.castShadow = true;
    house.add(backWall);
    [-1, 1].forEach((side) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.05, 9.6, 18.6), this.materials.house);
      wall.position.set(side * 11.25, 4.8, 0);
      wall.castShadow = true;
      wall.receiveShadow = true;
      house.add(wall);
    });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(16.2, 6.3, 4), this.materials.roof);
    roof.position.set(0, 12.15, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(roof);
    house.position.set(-5.5, 0.1, 8);
    this.baseGroup.add(house);
    this.baseGroup.add(this.createTextSprite("HOME", "#f8f7ff", "rgba(15,18,36,.72)", 3.8, 1.25, -5.5, 14.1, 8));

    this.speedMachine = this.createUpgradeMachine(11.5, 4.2, "SPEED", this.speedUpgradeCost, "#63dcff");
    this.collectMachine = this.createUpgradeMachine(11.5, 11.2, "TAKE", this.collectUpgradeCost, "#b7f34a");
  }

  createUpgradeMachine(x, z, label, cost, color) {
    const machine = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 1.4), this.materials.machine);
    machine.position.set(x, 1.55, z);
    machine.castShadow = true;
    machine.receiveShadow = true;
    this.baseGroup.add(machine);
    const sign = this.createTextSprite(`${label} $${cost}`, "#171525", color, 2.8, 0.8, x, 3.7, z);
    this.baseGroup.add(sign);
    return { x, z, machine, sign, label };
  }

  createTextSprite(text, color, background, width, height, x, y, z) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.font = "900 34px Rubik, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(width, height, 1);
    sprite.position.set(x, y, z);
    return sprite;
  }

  createEmojiSprite(symbol, size = 1.35) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    context.font = "92px Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(symbol, 64, 67);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  bindEvents() {
    this.onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
      if (event.code === "Space" && this.player.grounded) this.jump();
    };
    this.onKeyUp = (event) => this.keys.delete(event.key.toLowerCase());
    this.onResize = () => this.resize();
    this.onPointerDown = (event) => this.pointerDown(event);
    this.onPointerMove = (event) => this.pointerMove(event);
    this.onPointerUp = (event) => this.pointerUp(event);
    this.onJumpDown = (event) => {
      event.preventDefault();
      this.mobileInput.jump = true;
      this.jump();
    };
    this.onJumpUp = (event) => {
      event.preventDefault();
      this.mobileInput.jump = false;
    };
    this.onActionDown = (event) => {
      event.preventDefault();
      this.mobileInput.action = true;
    };
    this.onActionUp = (event) => {
      event.preventDefault();
      this.mobileInput.action = false;
    };
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    this.stickEl.addEventListener("pointerdown", this.onPointerDown);
    this.stickEl.addEventListener("pointermove", this.onPointerMove);
    this.stickEl.addEventListener("pointerup", this.onPointerUp);
    this.stickEl.addEventListener("pointercancel", this.onPointerUp);
    this.jumpButton.addEventListener("pointerdown", this.onJumpDown);
    this.jumpButton.addEventListener("pointerup", this.onJumpUp);
    this.jumpButton.addEventListener("pointercancel", this.onJumpUp);
    this.actionButton.addEventListener("pointerdown", this.onActionDown);
    this.actionButton.addEventListener("pointerup", this.onActionUp);
    this.actionButton.addEventListener("pointercancel", this.onActionUp);
  }

  resize() {
    const rect = this.root.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || window.innerWidth));
    const height = Math.max(240, Math.floor(rect.height || window.innerHeight));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  jump() {
    if (!this.player.grounded) return;
    this.player.vy = this.player.inTrench ? 13.8 : 9.4;
    this.player.grounded = false;
    this.player.state = PLAYER_STATES.JUMPING;
    this.cancelCollect();
  }

  pointerDown(event) {
    event.preventDefault();
    this.stickEl.setPointerCapture(event.pointerId);
    this.mobileInput.active = true;
    this.mobileInput.pointerId = event.pointerId;
    this.mobileInput.startX = event.clientX;
    this.mobileInput.startY = event.clientY;
    this.updateStick(event.clientX, event.clientY);
  }

  pointerMove(event) {
    if (!this.mobileInput.active || event.pointerId !== this.mobileInput.pointerId) return;
    event.preventDefault();
    this.updateStick(event.clientX, event.clientY);
  }

  pointerUp(event) {
    if (event.pointerId !== this.mobileInput.pointerId) return;
    event.preventDefault();
    this.mobileInput.active = false;
    this.mobileInput.pointerId = null;
    this.mobileInput.x = 0;
    this.mobileInput.y = 0;
    this.stickKnob.style.transform = "translate(-50%, -50%)";
  }

  updateStick(clientX, clientY) {
    const dx = clamp(clientX - this.mobileInput.startX, -52, 52);
    const dy = clamp(clientY - this.mobileInput.startY, -52, 52);
    this.mobileInput.x = dx / 52;
    this.mobileInput.y = dy / 52;
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  generateChunksAround(z) {
    const current = Math.floor(z / this.chunkLength);
    for (let index = current - 2; index <= current + 14; index += 1) {
      if (!this.chunks.has(index)) this.createChunk(index);
    }
    for (const [index, group] of this.chunks.entries()) {
      if (index < current - 4) {
        this.trackGroup.remove(group);
        group.traverse((child) => {
          child.geometry?.dispose?.();
        });
        this.chunks.delete(index);
        this.trenches = this.trenches.filter((trench) => trench.chunk !== index);
      }
    }
    this.trophiesWorld = this.trophiesWorld.filter((trophy) => {
      if (trophy.z < z - 24 || trophy.collected) {
        this.disposeTrophy(trophy);
        return false;
      }
      return true;
    });
  }

  createChunk(index) {
    const group = new THREE.Group();
    group.position.z = index * this.chunkLength;
    const difficulty = clamp(index / 28, 0, 1);
    const recentTrench = this.trenches.some((item) => item.chunk >= index - 1 && item.chunk < index);
    const forcedTrench = index > 0 && !recentTrench;
    const hasTrench = index > 0 && (Math.random() < 0.58 + difficulty * 0.22 || forcedTrench);
    const trench = hasTrench ? this.createTrenchSpec(index, forcedTrench) : null;
    if (trench) {
      this.trenches.push(trench);
    }

    const chunkStart = index * this.chunkLength;
    const addRoad = (centerX, centerZ, width, length) => {
      if (width <= 0.2 || length <= 0.2) return;
      const road = new THREE.Mesh(new THREE.BoxGeometry(width, 0.45, length), this.materials.road);
      road.position.set(centerX, 0, centerZ);
      road.receiveShadow = true;
      group.add(road);
    };
    if (trench) {
      const length = trench.z1 - trench.z0;
      const centerZ = (trench.z0 + trench.z1) / 2 - chunkStart;
      const localZ0 = trench.z0 - chunkStart;
      const localZ1 = trench.z1 - chunkStart;
      addRoad(0, localZ0 / 2, this.trackWidth, localZ0);
      addRoad(0, (localZ1 + this.chunkLength) / 2, this.trackWidth, this.chunkLength - localZ1);
      const trenchLeft = trench.x - trench.width / 2;
      const trenchRight = trench.x + trench.width / 2;
      const roadLeft = -this.trackWidth / 2;
      const roadRight = this.trackWidth / 2;
      addRoad((roadLeft + trenchLeft) / 2, centerZ, trenchLeft - roadLeft, length);
      addRoad((trenchRight + roadRight) / 2, centerZ, roadRight - trenchRight, length);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(trench.width, 0.35, length), this.materials.trench);
      floor.position.set(trench.x, trench.depth, centerZ);
      floor.receiveShadow = true;
      group.add(floor);
      [-1, 1].forEach((side) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.9, length), this.materials.trench);
        wall.position.set(trench.x + side * trench.width / 2, -1.1, centerZ);
        wall.receiveShadow = true;
        group.add(wall);
      });
      [-1, 1].forEach((end) => {
        const lip = new THREE.Mesh(new THREE.BoxGeometry(trench.width, 1.1, 0.28), this.materials.trench);
        lip.position.set(trench.x, -0.3, (end > 0 ? trench.z1 : trench.z0) - chunkStart);
        lip.receiveShadow = true;
        group.add(lip);
      });
    } else {
      addRoad(0, this.chunkLength / 2, this.trackWidth, this.chunkLength);
    }

    if (index > 1) {
      const trophyCount = 2 + Math.floor(Math.random() * 4) + (Math.random() < 0.35 ? 2 : 0);
      const rowZ = chunkStart + rand(8, this.chunkLength - 8);
      for (let item = 0; item < trophyCount; item += 1) {
        const parallel = item < 4 && Math.random() < 0.72;
        this.spawnTrophy(index, trench, parallel ? rowZ + rand(-1.4, 1.4) : null);
      }
    }
    this.trackGroup.add(group);
    this.chunks.set(index, group);
  }

  createTrenchSpec(index, forced = false) {
    const chunkStart = index * this.chunkLength;
    const roll = Math.random();
    const width = roll < 0.28 ? rand(26, 32) : roll < 0.62 ? rand(9, 15) : rand(13, 22);
    const sideSpan = this.trackWidth / 2 - width / 2 - 1;
    const x = width > this.trackWidth * 0.72 ? 0 : rand(-sideSpan, sideSpan);
    const length = forced ? rand(9, 14) : roll < 0.35 ? rand(4.5, 7.5) : roll < 0.72 ? rand(8, 12) : rand(13, 17);
    const maxStart = forced ? Math.min(9, this.chunkLength - length - 4) : this.chunkLength - length - 4;
    const z0 = chunkStart + rand(5, maxStart);
    return {
      chunk: index,
      x,
      z0,
      z1: z0 + length,
      width,
      depth: rand(-1.72, -1.48),
    };
  }

  spawnTrophy(index, trench, preferredZ = null) {
    const chunkStart = index * this.chunkLength;
    let z = preferredZ ?? chunkStart + rand(5, this.chunkLength - 5);
    if (trench && z > trench.z0 - 2 && z < trench.z1 + 2) {
      z = Math.random() < 0.5 ? trench.z0 - 3 : trench.z1 + 3;
    }
    const randomMultiplier = rand(1, 5);
    const value = Math.max(5, Math.round((Math.max(3, z) ** 1.5 * randomMultiplier) / 14));
    const symbol = this.trophySymbolForValue(value);
    const collectNeed = value * rand(1, 3);
    const sprite = this.createEmojiSprite(symbol, 1.25 + clamp(value / 300, 0, 0.45));
    let x = rand(-this.trackWidth / 2 + 2.5, this.trackWidth / 2 - 2.5);
    if (trench && z >= trench.z0 - 1 && z <= trench.z1 + 1 && Math.abs(x - trench.x) < trench.width / 2 + 1.2) {
      x = trench.x < 0 ? rand(2.5, this.trackWidth / 2 - 2.5) : rand(-this.trackWidth / 2 + 2.5, -2.5);
    }
    sprite.position.set(x, 1.35, z);
    this.trophyGroup.add(sprite);
    const priceSprite = this.createTextSprite(`$${value}`, "#171525", "rgba(183,243,74,.92)", 1.75, 0.55, x, 2.75, z);
    priceSprite.visible = false;
    this.trophyGroup.add(priceSprite);
    this.trophiesWorld.push({ sprite, priceSprite, symbol, x: sprite.position.x, z, value, collectNeed, collectedValue: 0, progress: 0, collected: false });
  }

  trophySymbolForValue(value) {
    const tier = TROPHY_TIERS.find((item) => value <= item.max) ?? TROPHY_TIERS[TROPHY_TIERS.length - 1];
    return tier.items[Math.floor(Math.random() * tier.items.length)];
  }

  disposeTrophy(trophy) {
    if (trophy.sprite) {
      this.trophyGroup.remove(trophy.sprite);
      trophy.sprite.material.map?.dispose();
      trophy.sprite.material.dispose();
      trophy.sprite = null;
    }
    if (trophy.priceSprite) {
      this.trophyGroup.remove(trophy.priceSprite);
      trophy.priceSprite.material.map?.dispose();
      trophy.priceSprite.material.dispose();
      trophy.priceSprite = null;
    }
  }

  currentTrench(z) {
    return this.trenches.find((trench) => z >= trench.z0 && z <= trench.z1 && Math.abs(this.player.x - trench.x) <= trench.width / 2) ?? null;
  }

  surfaceY(z) {
    return this.currentTrench(z)?.depth ?? 1.55;
  }

  spawnWave() {
    const difficulty = clamp(this.distance / 650, 0, 1);
    const roll = Math.random();
    const type = roll < 0.42 - difficulty * 0.12 ? WAVE_TYPES[0] : roll < 0.82 - difficulty * 0.08 ? WAVE_TYPES[1] : WAVE_TYPES[2];
    const geometry = new THREE.BoxGeometry(42, 2.2, 0.65);
    const material = new THREE.MeshStandardMaterial({
      color: type.color,
      emissive: type.color,
      emissiveIntensity: type.id === "red" ? 0.75 : 0.35,
      transparent: true,
      opacity: 0.72,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 1.35, this.player.z + 150);
    mesh.castShadow = true;
    this.waveGroup.add(mesh);
    this.waves.push({ mesh, type, speed: type.speed + difficulty * 7, box: new THREE.Box3() });
    this.nextWaveIn = Math.max(1.45, type.interval - difficulty * 1.55 + rand(-0.55, 0.55));
  }

  updateInput(dt) {
    const left = this.keys.has("d") || this.keys.has("arrowright");
    const right = this.keys.has("a") || this.keys.has("arrowleft");
    const forward = this.keys.has("w") || this.keys.has("arrowup");
    const back = this.keys.has("s") || this.keys.has("arrowdown");
    const harvest = this.keys.has("e") || this.mobileInput.action;
    const turn = (right ? 1 : 0) - (left ? 1 : 0) + this.mobileInput.x;
    const throttle = (forward ? 1 : 0) - (back ? 0.35 : 0) + clamp(-this.mobileInput.y, -0.35, 1);
    const targetSpeed = throttle > 0.05 ? this.currentMaxSpeed() * clamp(throttle, 0, 1) : throttle < -0.05 ? -2.5 : 0;
    this.player.angle += clamp(turn, -1, 1) * 2.65 * dt;
    this.player.speed += (targetSpeed - this.player.speed) * (1 - Math.exp(-7 * dt));
    this.player.x = clamp(this.player.x + Math.sin(this.player.angle) * this.player.speed * dt, -this.trackWidth / 2 + 1.1, this.trackWidth / 2 - 1.1);
    this.player.z = Math.max(0, this.player.z + Math.cos(this.player.angle) * this.player.speed * dt);
    if (this.player.x <= -this.trackWidth / 2 + 1.1 || this.player.x >= this.trackWidth / 2 - 1.1) {
      this.player.angle *= 0.92;
    }
    this.lastInputMove = Math.abs(turn) + Math.abs(this.player.speed);
    if (!harvest || this.lastInputMove > 0.4 || !this.player.grounded || this.player.inTrench) this.cancelCollect();
  }

  currentMaxSpeed() {
    return PLAYER_MAX_SPEED + this.speedLevel * 0.65;
  }

  currentCollectRate() {
    return BASE_COLLECT_RATE + this.collectRateLevel * 28;
  }

  updatePhysics(dt) {
    const groundY = this.surfaceY(this.player.z);
    this.player.inTrench = groundY < 1;
    if (!this.player.grounded) {
      this.player.vy -= 24 * dt;
      this.player.y += this.player.vy * dt;
      if (this.player.y <= groundY) {
        this.player.y = groundY;
        this.player.vy = 0;
        this.player.grounded = true;
      }
    } else {
      this.player.y += (groundY - this.player.y) * (1 - Math.exp(-18 * dt));
    }
    if (this.player.inTrench && (this.keys.has("s") || this.keys.has("arrowdown") || this.mobileInput.y > 0.35)) {
      this.player.y = Math.min(this.player.y, groundY);
    }
  }

  updateCollecting(dt) {
    if (this.collecting?.collected) this.collecting = null;
    const harvest = this.keys.has("e") || this.mobileInput.action;
    if (this.nearbyUpgradeMachine()) return;
    if (!harvest || !this.player.grounded || this.player.inTrench || this.lastInputMove > 0.4) return;
    const trophy = this.collecting ?? this.trophiesWorld.find((item) => Math.hypot(item.x - this.player.x, item.z - this.player.z) < 1.45);
    if (!trophy) return;
    this.collecting = trophy;
    trophy.collectedValue += this.currentCollectRate() * dt;
    trophy.progress = clamp(trophy.collectedValue / trophy.collectNeed, 0, 1);
    if (trophy.progress >= 1) {
      trophy.collected = true;
      this.trophies += 1;
      this.lootValue += trophy.value;
      this.money += trophy.value;
      this.disposeTrophy(trophy);
      this.spawnHouseTrophy(trophy.symbol);
      this.callbacks.onStatus?.(`${trophy.symbol} claimed: +$${trophy.value}.`);
      this.collecting = null;
    }
  }

  nearbyUpgradeMachine() {
    if (!this.player.grounded || this.player.inTrench) return null;
    const machines = [
      { kind: "speed", ...this.speedMachine },
      { kind: "collect", ...this.collectMachine },
    ];
    return machines.find((machine) => Math.hypot(this.player.x - machine.x, this.player.z - machine.z) < 4) ?? null;
  }

  updateBaseInteraction() {
    const action = this.keys.has("e") || this.mobileInput.action;
    const machine = this.nearbyUpgradeMachine();
    if (action && !this.wasActionPressed && machine) {
      if (machine.kind === "speed") this.buySpeedUpgrade();
      else this.buyCollectUpgrade();
      this.cancelCollect();
    }
    this.wasActionPressed = action;
  }

  buySpeedUpgrade() {
    if (this.money < this.speedUpgradeCost) {
      this.callbacks.onStatus?.(`Need $${this.speedUpgradeCost} for the next speed upgrade.`);
      return;
    }
    this.money -= this.speedUpgradeCost;
    this.speedLevel += 1;
    this.speedUpgradeCost = Math.round(this.speedUpgradeCost * 1.7 + 45);
    this.refreshMachineLabel("speed", `SPEED $${this.speedUpgradeCost}`, "#63dcff");
    this.callbacks.onStatus?.(`Speed upgraded: ${this.currentMaxSpeed().toFixed(1)}.`);
  }

  buyCollectUpgrade() {
    if (this.money < this.collectUpgradeCost) {
      this.callbacks.onStatus?.(`Need $${this.collectUpgradeCost} for the next harvest upgrade.`);
      return;
    }
    this.money -= this.collectUpgradeCost;
    this.collectRateLevel += 1;
    this.collectUpgradeCost = Math.round(this.collectUpgradeCost * 1.75 + 35);
    this.refreshMachineLabel("collect", `TAKE $${this.collectUpgradeCost}`, "#b7f34a");
    this.callbacks.onStatus?.(`Harvest upgraded: $${this.currentCollectRate()}/s.`);
  }

  refreshMachineLabel(kind, text, color) {
    const holder = kind === "speed" ? this.speedMachine : this.collectMachine;
    this.baseGroup.remove(holder.sign);
    holder.sign.material.map?.dispose();
    holder.sign.material.dispose();
    holder.sign = this.createTextSprite(text, "#171525", color, 2.8, 0.8, holder.x, 3.7, holder.z);
    this.baseGroup.add(holder.sign);
  }

  spawnHouseTrophy(symbol) {
    const sprite = this.createEmojiSprite(symbol, 0.82);
    const index = this.houseTrophyGroup.children.length;
    const column = index % 10;
    const row = Math.floor(index / 10) % 6;
    const shelf = Math.floor(index / 60) % 3;
    sprite.position.set(-15 + column * 1.05, 1.25 + row * 0.72, 2.1 + shelf * 2.1);
    this.houseTrophyGroup.add(sprite);
  }

  cancelCollect() {
    if (!this.collecting) return;
    this.collecting.progress = 0;
    this.collecting.collectedValue = 0;
    this.collecting = null;
  }

  updateWaves(dt) {
    this.nextWaveIn -= dt;
    if (this.nextWaveIn <= 0) this.spawnWave();
    this.playerGroup.position.set(this.player.x, this.player.y, this.player.z);
    this.playerGroup.rotation.y = this.player.angle;
    const playerBox = this.player.box.setFromObject(this.playerGroup);
    for (const wave of this.waves) {
      wave.mesh.position.z -= wave.speed * dt;
      wave.mesh.scale.y = 1 + Math.sin(this.time * 12 + wave.mesh.position.z) * 0.06;
      wave.box.setFromObject(wave.mesh);
      if (wave.box.intersectsBox(playerBox)) {
        if (this.player.z < 12) {
          this.callbacks.onStatus?.("Safe at home.");
        } else if (this.player.inTrench && this.player.y < 0.05) {
          this.callbacks.onStatus?.(`${wave.type.label} wave passed overhead.`);
        } else {
          this.die(wave.type.label);
          break;
        }
      }
    }
    this.waves = this.waves.filter((wave) => {
      if (wave.mesh.position.z < this.player.z - 24) {
        this.waveGroup.remove(wave.mesh);
        wave.mesh.geometry.dispose();
        wave.mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  die(label) {
    this.bestDistance = Math.max(this.bestDistance, this.distance);
    this.callbacks.onStatus?.(`${label} wave hit you. Back to start.`);
    this.deathFlash = 1;
    this.player.x = 0;
    this.player.y = 1.55;
    this.player.z = 5;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.speed = 0;
    this.player.angle = 0;
    this.player.grounded = true;
    this.player.inTrench = false;
    this.collecting = null;
    this.distance = 0;
    for (const wave of this.waves) {
      this.waveGroup.remove(wave.mesh);
      wave.mesh.geometry.dispose();
      wave.mesh.material.dispose();
    }
    this.waves = [];
    this.nextWaveIn = 2.4;
  }

  updateAnimation(dt) {
    const run = this.player.grounded ? Math.abs(this.player.speed) : 0;
    const swing = Math.sin(this.time * (7 + run * 0.7)) * clamp(run / 8, 0, 1);
    this.parts.leftArm.rotation.x = swing * 0.9;
    this.parts.rightArm.rotation.x = -swing * 0.9;
    this.parts.leftLeg.rotation.x = -swing * 0.95;
    this.parts.rightLeg.rotation.x = swing * 0.95;
    this.parts.head.rotation.y = Math.sin(this.time * 2.2) * 0.08;
    for (const trophy of this.trophiesWorld) {
      if (trophy.collected || !trophy.sprite || !trophy.priceSprite) continue;
      const near = Math.hypot(trophy.x - this.player.x, trophy.z - this.player.z) < 3.2;
      trophy.priceSprite.visible = near;
      trophy.sprite.position.y = 1.35 + Math.sin(this.time * 3 + trophy.z) * 0.12;
      trophy.priceSprite.position.y = 2.75 + Math.sin(this.time * 3 + trophy.z) * 0.06;
    }
  }

  updateCamera(dt) {
    this.playerGroup.position.set(this.player.x, this.player.y, this.player.z);
    this.playerGroup.rotation.y = this.player.angle;
    const behind = new THREE.Vector3(-Math.sin(this.player.angle) * 15, 7.1, -Math.cos(this.player.angle) * 15);
    const target = new THREE.Vector3(this.player.x + behind.x, this.player.y + behind.y, this.player.z + behind.z);
    this.camera.position.lerp(target, 1 - Math.exp(-5 * dt));
    this.camera.lookAt(
      this.player.x + Math.sin(this.player.angle) * 14,
      this.player.y + 1.25,
      this.player.z + Math.cos(this.player.angle) * 14,
    );
  }

  updateHud() {
    this.distance = Math.max(this.distance, Math.floor(this.player.z));
    this.distanceEl.textContent = `${Math.floor(this.distance)} m`;
    this.moneyEl.textContent = `$${this.money}`;
    this.speedEl.textContent = this.currentMaxSpeed().toFixed(1);
    this.takeRateEl.textContent = `$${this.currentCollectRate()}/s`;
    this.player.state = this.collecting
      ? PLAYER_STATES.COLLECTING
      : !this.player.grounded
        ? PLAYER_STATES.JUMPING
        : this.player.inTrench
          ? PLAYER_STATES.IN_TRENCH
          : PLAYER_STATES.RUNNING;
    this.stateEl.textContent = this.player.state;
    this.collectEl.hidden = !this.collecting;
    this.collectBar.style.transform = `scaleX(${this.collecting ? clamp(this.collecting.progress, 0, 1) : 0})`;
    this.overlay.style.opacity = String(clamp(this.deathFlash, 0, 0.9));
  }

  loop() {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.deathFlash = Math.max(0, this.deathFlash - dt * 1.8);
    this.updateInput(dt);
    this.updatePhysics(dt);
    this.generateChunksAround(this.player.z);
    this.updateBaseInteraction();
    this.updateCollecting(dt);
    this.updateWaves(dt);
    this.updateAnimation(dt);
    this.updateCamera(dt);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(() => this.loop());
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    this.stickEl.removeEventListener("pointerdown", this.onPointerDown);
    this.stickEl.removeEventListener("pointermove", this.onPointerMove);
    this.stickEl.removeEventListener("pointerup", this.onPointerUp);
    this.stickEl.removeEventListener("pointercancel", this.onPointerUp);
    this.jumpButton.removeEventListener("pointerdown", this.onJumpDown);
    this.jumpButton.removeEventListener("pointerup", this.onJumpUp);
    this.jumpButton.removeEventListener("pointercancel", this.onJumpUp);
    this.actionButton.removeEventListener("pointerdown", this.onActionDown);
    this.actionButton.removeEventListener("pointerup", this.onActionUp);
    this.actionButton.removeEventListener("pointercancel", this.onActionUp);
    this.root.classList.remove("is-active");
    this.renderer?.dispose();
    this.root.replaceChildren();
  }
}
