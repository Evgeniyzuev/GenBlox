import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { RealtimeSnapshotChannel, TimedEventQueue } from "../core/realtime-netcode.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const seededRandom = (seed) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
};
const hashString = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const PLAYER_MAX_SPEED = 8.7;
const MAX_GREEN_SURFACE_RUN = 68;
const GREEN_SAFETY_MARGIN = 1.2;
const BASE_COLLECT_RATE = 76;
const COLLECT_RADIUS = 2.175;
const TROPHY_MIN_SPACING = 2.35;
const RUNNER_BUMP_RADIUS = 3.0;
const RUNNER_BUMP_COOLDOWN = 1.1;
const SOUND_STORAGE_KEY = "genblox:wave-runners-muted";
const INITIAL_SPEED_UPGRADE_COST = 90;
const INITIAL_COLLECT_UPGRADE_COST = 70;
const MATCH_TARGETS = [20000, 50000, 100000, 200000, 500000, 1000000];
const MAX_ACTIVE_TROPHIES = 180;
const TROPHY_RESPAWN_INTERVAL = 30;
const WAVE_QUEUE_SECONDS = 30;
const PLAYER_COLORS = [0x4aa7ff, 0xff8a3d];
const PLAYER_HAIR_COLORS = [0x2b1f27, 0x412f18];
const TROPHY_TIERS = [
  { max: 500, items: ["🥦", "🥕", "🧅"] },
  { max: 1000, items: ["🍇", "🍌", "🍓"] },
  { max: 2000, items: ["🍕", "🍔", "🍟"] },
  { max: 3000, items: ["⚽️", "🏀", "🎯"] },
  { max: 5000, items: ["📱", "🎧", "👩‍💻"] },
  { max: 8000, items: ["🦄", "🦊", "🐶"] },
  { max: 12000, items: ["🥇", "💎", "🏆"] },
  { max: Infinity, items: ["💵", "👑", "🎁"] },
];

const PLAYER_STATES = {
  RUNNING: "RUNNING",
  JUMPING: "JUMPING",
  IN_TRENCH: "IN_TRENCH",
  COLLECTING: "COLLECTING",
};

const BOT_STATES = {
  RUNNING: "RUNNING",
  SEEK_TROPHY: "SEEK_TROPHY",
  COLLECTING: "COLLECTING",
  SEEK_TRENCH: "SEEK_TRENCH",
  IN_TRENCH: "IN_TRENCH",
  RETURNING_TO_SURFACE: "RETURNING_TO_SURFACE",
  UPGRADING: "UPGRADING",
  DEAD_RESET: "DEAD_RESET",
};

const WAVE_TYPES = [
  { id: "white", color: 0xf8f7ff, speed: 8.5, interval: 5.8, label: "WHITE", harmless: true },
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
const waveTypeById = (id) => WAVE_TYPES.find((type) => type.id === id) ?? WAVE_TYPES[1];
const WAVE_MAPS = [
  {
    id: "meadow",
    title: "Meadow Run",
    subtitle: "Open grass, shorter sightlines, classic wave timing",
    sky: 0x8fc7e8,
    fog: 0x8fc7e8,
    grass: 0x5ea55d,
    road: 0xb9ac86,
    trench: 0x49352e,
    safe: 0x86b36f,
    seedOffset: 17,
    waveSpeedMultiplier: 1,
    waveIntervalMultiplier: 1,
    waveLeadMultiplier: 1,
    trenchBias: 0,
    trenchShift: 0,
  },
  {
    id: "tidal",
    title: "Tidal Flats",
    subtitle: "Offset ravines, cooler terrain, faster waves with longer gaps",
    sky: 0xa9d6d2,
    fog: 0xa9d6d2,
    grass: 0x3f8a70,
    road: 0xc7b98f,
    trench: 0x31415b,
    safe: 0x75b7a0,
    seedOffset: 4409,
    waveSpeedMultiplier: 1.2,
    waveIntervalMultiplier: 1.2,
    waveLeadMultiplier: 1.2,
    trenchBias: 0.12,
    trenchShift: 0.65,
  },
];
const waveMapById = (id) => WAVE_MAPS.find((map) => map.id === id) ?? WAVE_MAPS[0];

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
    this.phase = "selecting";
    this.targetScore = MATCH_TARGETS[0];
    this.winner = null;
    this.trophies = 0;
    this.lootValue = 0;
    this.totalScore = 0;
    this.bot = callbacks.bot === false ? null : {
      name: "Bot",
      score: 0,
      money: 0,
      x: 3.8,
      y: 1.55,
      z: 5,
      angle: 0,
      speed: 0,
      vy: 0,
      grounded: true,
      inTrench: false,
      targetX: 3.8,
      targetZ: 18,
      state: BOT_STATES.RUNNING,
      collecting: null,
      collectValue: 0,
      targetTrophy: null,
      targetTrench: null,
      speedLevel: 0,
      collectRateLevel: 0,
      speedUpgradeCost: INITIAL_SPEED_UPGRADE_COST,
      collectUpgradeCost: INITIAL_COLLECT_UPGRADE_COST,
      bumpCooldown: 0,
      box: new THREE.Box3(),
    };
    this.network = callbacks.network ?? null;
    this.netcode = new RealtimeSnapshotChannel({ network: this.network, kind: "wave-runners", playerId: "solo" });
    this.networkRole = this.netcode.role;
    this.playerId = this.netcode.playerId;
    this.humanSlots = this.normalizeHumanSlots(this.resolveHumanSlots());
    this.localSlot = this.findLocalSlot();
    this.selectedMap = WAVE_MAPS[0];
    this.money = 0;
    this.speedLevel = 0;
    this.collectRateLevel = 0;
    this.speedUpgradeCost = INITIAL_SPEED_UPGRADE_COST;
    this.collectUpgradeCost = INITIAL_COLLECT_UPGRADE_COST;
    this.wasActionPressed = false;
    this.collecting = null;
    this.deathFlash = 0;
    this.impactState = null;
    this.impacts = [];
    this.victoryShown = false;
    this.victoryConfetti = [];
    this.muted = localStorage.getItem(SOUND_STORAGE_KEY) === "1";
    this.audio = null;
    this.audioReady = false;
    this.ambience = null;
    this.chunkLength = 34;
    this.trackWidth = 34;
    this.chunks = new Map();
    this.trenches = [];
    this.trophiesWorld = [];
    this.trophyStock = new Map();
    this.claimedTrophyIds = new Set();
    this.pendingClaimId = null;
    this.waves = [];
    this.nextWaveIn = 2.8;
    this.waveQueue = new TimedEventQueue({ horizon: WAVE_QUEUE_SECONDS, disconnectGrace: WAVE_QUEUE_SECONDS });
    this.waveSerial = 0;
    this.lastWaveEventAt = 0;
    this.networkQueueExpired = false;
    this.networkClock = 0;
    this.remoteRanking = [];
    this.remotePose = null;
    this.lastNetworkRevision = null;
    this.lastNetworkHostTime = -Infinity;
    this.lastInputMove = 0;
    this.bumpSerial = 0;
    this.pendingBumpTargetId = null;
    this.lastProcessedBumpSeq = new Map();
    this.remoteBumpCooldown = 0;
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
      bumpCooldown: 0,
      box: new THREE.Box3(),
    };

    this.buildShell();
    this.buildScene();
    this.bindEvents();
    this.buildGoalChoice();
    if (this.networkRole === "guest") {
      this.goalChoice.querySelector("strong").textContent = "Waiting for host...";
      this.goalChoice.querySelectorAll("button").forEach((button) => { button.disabled = true; });
      this.callbacks.onStatus?.("The host is choosing a target score.");
    } else {
      this.callbacks.onStatus?.("Choose the target score.");
    }
    this.frame = requestAnimationFrame(() => this.loop());
  }

  buildShell() {
    this.canvasHost = document.createElement("div");
    this.canvasHost.className = "wave-canvas-host";
    this.hud = document.createElement("div");
    this.hud.className = "wave-hud";
    this.hud.innerHTML = `
      <div class="wave-stat is-value"><strong data-wave-distance>0 m</strong></div>
      <div class="wave-stat is-value"><strong data-wave-money>$0</strong></div>
      <div class="wave-stat"><small>S</small><strong data-wave-speed>8.7</strong></div>
      <div class="wave-stat"><small>T</small><strong data-wave-take-rate>$76/s</strong></div>
      <button class="wave-sound-toggle" data-wave-sound type="button" aria-label="Toggle sound">SOUND</button>
      <div class="wave-rank"><strong data-wave-ranking>-</strong></div>
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
    this.victoryOverlay = document.createElement("div");
    this.victoryOverlay.className = "wave-victory";
    this.victoryOverlay.hidden = true;
    this.victoryOverlay.innerHTML = `
      <div class="wave-victory-burst" aria-hidden="true"></div>
      <div class="wave-victory-copy">
        <small>WINNER</small>
        <strong data-wave-victory-name>-</strong>
        <span data-wave-victory-score>$0</span>
        <button data-wave-play-again type="button">NEW RUN</button>
      </div>
    `;
    this.goalChoice = document.createElement("div");
    this.goalChoice.className = "wave-goal-choice";
    this.root.append(this.canvasHost, this.hud, this.touchControls, this.goalChoice, this.overlay, this.victoryOverlay);
    this.distanceEl = this.hud.querySelector("[data-wave-distance]");
    this.moneyEl = this.hud.querySelector("[data-wave-money]");
    this.speedEl = this.hud.querySelector("[data-wave-speed]");
    this.takeRateEl = this.hud.querySelector("[data-wave-take-rate]");
    this.rankingEl = this.hud.querySelector("[data-wave-ranking]");
    this.soundButton = this.hud.querySelector("[data-wave-sound]");
    this.collectEl = this.hud.querySelector("[data-wave-collect]");
    this.collectBar = this.collectEl.querySelector("span");
    this.victoryNameEl = this.victoryOverlay.querySelector("[data-wave-victory-name]");
    this.victoryScoreEl = this.victoryOverlay.querySelector("[data-wave-victory-score]");
    this.playAgainButton = this.victoryOverlay.querySelector("[data-wave-play-again]");
    this.stickEl = this.touchControls.querySelector("[data-wave-stick]");
    this.stickKnob = this.stickEl.querySelector("span");
    this.jumpButton = this.touchControls.querySelector("[data-wave-jump]");
    this.actionButton = this.touchControls.querySelector("[data-wave-action]");
    this.refreshSoundButton();
  }

  buildScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.selectedMap.sky);
    this.scene.fog = new THREE.Fog(this.selectedMap.fog, 70, 230);

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
      grass: new THREE.MeshStandardMaterial({ color: this.selectedMap.grass, roughness: 0.8 }),
      road: new THREE.MeshStandardMaterial({ color: this.selectedMap.road, roughness: 0.85 }),
      trench: new THREE.MeshStandardMaterial({ color: this.selectedMap.trench, roughness: 0.95 }),
      safe: new THREE.MeshStandardMaterial({ color: this.selectedMap.safe, roughness: 0.8 }),
      house: new THREE.MeshStandardMaterial({ color: 0xffd36a, roughness: 0.65 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xff668c, roughness: 0.7 }),
      machine: new THREE.MeshStandardMaterial({ color: 0x63dcff, roughness: 0.45, emissive: 0x174556, emissiveIntensity: 0.25 }),
      playerBody: new THREE.MeshStandardMaterial({ color: 0x4aa7ff, roughness: 0.65 }),
      remoteBody: new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.65 }),
      playerSkin: new THREE.MeshStandardMaterial({ color: 0xf0c18f, roughness: 0.7 }),
      playerHair: new THREE.MeshStandardMaterial({ color: 0x2b1f27, roughness: 0.75 }),
      remoteHair: new THREE.MeshStandardMaterial({ color: 0x412f18, roughness: 0.75 }),
      playerPants: new THREE.MeshStandardMaterial({ color: 0x171525, roughness: 0.72 }),
      playerVest: new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.72 }),
      playerBoot: new THREE.MeshStandardMaterial({ color: 0xd77c2d, roughness: 0.62 }),
      playerSole: new THREE.MeshStandardMaterial({ color: 0x10121b, roughness: 0.76 }),
      playerGlove: new THREE.MeshStandardMaterial({ color: 0x11131d, roughness: 0.68 }),
      face: new THREE.MeshStandardMaterial({ color: 0x141019, roughness: 0.55 }),
      mouth: new THREE.MeshStandardMaterial({ color: 0x6f2630, roughness: 0.58 }),
      trim: new THREE.MeshStandardMaterial({ color: 0xffd36a, roughness: 0.58 }),
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
    this.parts = this.playerGroup.userData.parts;
    this.scene.add(this.playerGroup);
    this.remoteGroup = this.createPlayer({
      body: this.materials.remoteBody,
      hair: this.materials.remoteHair,
    });
    this.remoteParts = this.remoteGroup.userData.parts;
    this.remoteGroup.visible = Boolean(this.bot || this.network);
    this.scene.add(this.remoteGroup);
    this.updatePlayerPalette();

    this.resize();
    this.generateChunksAround(0);
  }

  createPlayer(materials = {}) {
    const group = new THREE.Group();
    const bodyMaterial = materials.body ?? this.materials.playerBody;
    const skinMaterial = materials.skin ?? this.materials.playerSkin;
    const hairMaterial = materials.hair ?? this.materials.playerHair;
    const pantsMaterial = materials.pants ?? this.materials.playerPants;
    const vestMaterial = materials.vest ?? this.materials.playerVest;
    const bootMaterial = materials.boot ?? this.materials.playerBoot;
    const soleMaterial = materials.sole ?? this.materials.playerSole;
    const gloveMaterial = materials.glove ?? this.materials.playerGlove;
    const makeMesh = (geometry, material, position, parent = group, name = "") => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const box = (size) => new THREE.BoxGeometry(size.x, size.y, size.z);
    const sphere = (radius, width = 16, height = 10) => new THREE.SphereGeometry(radius, width, height);
    const cylinder = (radiusTop, radiusBottom, height, radial = 16) => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial);

    const torso = new THREE.Group();
    torso.position.set(0, 0.42, 0);
    group.add(torso);
    makeMesh(box(new THREE.Vector3(0.98, 1.06, 0.48)), bodyMaterial, new THREE.Vector3(0, 0, 0), torso, "hoodie");
    makeMesh(box(new THREE.Vector3(1.08, 1.0, 0.12)), vestMaterial, new THREE.Vector3(0, 0.03, -0.31), torso, "vest-back");
    makeMesh(box(new THREE.Vector3(0.25, 1.0, 0.16)), vestMaterial, new THREE.Vector3(-0.35, 0.03, 0.35), torso, "vest-left");
    makeMesh(box(new THREE.Vector3(0.25, 1.0, 0.16)), vestMaterial, new THREE.Vector3(0.35, 0.03, 0.35), torso, "vest-right");
    makeMesh(cylinder(0.06, 0.06, 0.52, 10), this.materials.trim, new THREE.Vector3(0, -0.6, 0.32), torso, "zipper").rotation.x = Math.PI / 2;
    makeMesh(cylinder(0.08, 0.08, 0.08, 12), this.materials.face, new THREE.Vector3(0, -0.84, 0.31), torso, "zipper-pull");

    const neck = makeMesh(cylinder(0.18, 0.2, 0.18, 16), skinMaterial, new THREE.Vector3(0, 1.03, 0), group, "neck");
    neck.scale.z = 0.82;

    const head = new THREE.Group();
    head.position.set(0, 1.36, 0);
    group.add(head);
    makeMesh(box(new THREE.Vector3(0.72, 0.7, 0.66)), skinMaterial, new THREE.Vector3(0, 0, 0), head, "head-block");
    makeMesh(sphere(0.08, 12, 8), this.materials.face, new THREE.Vector3(-0.18, 0.06, 0.36), head, "eye-left").scale.y = 1.45;
    makeMesh(sphere(0.08, 12, 8), this.materials.face, new THREE.Vector3(0.18, 0.06, 0.36), head, "eye-right").scale.y = 1.45;
    makeMesh(box(new THREE.Vector3(0.22, 0.035, 0.035)), this.materials.mouth, new THREE.Vector3(0, -0.18, 0.37), head, "mouth");

    const hairCap = makeMesh(box(new THREE.Vector3(0.78, 0.22, 0.72)), hairMaterial, new THREE.Vector3(0, 0.42, 0.01), head, "hair-cap");
    hairCap.rotation.x = -0.08;
    [
      [-0.25, 0.41, 0.28, 0.6, 0.2],
      [-0.05, 0.48, 0.32, 0.28, 0.04],
      [0.2, 0.4, 0.29, 0.8, -0.18],
      [0.39, 0.16, -0.05, -0.08, -0.55],
      [-0.43, 0.13, -0.04, 0.08, 0.5],
    ].forEach(([x, y, z, rx, rz], index) => {
      const lock = makeMesh(box(new THREE.Vector3(0.18, 0.52 - index * 0.035, 0.16)), hairMaterial, new THREE.Vector3(x, y, z), head, `hair-lock-${index}`);
      lock.rotation.x = rx;
      lock.rotation.z = rz;
    });

    const makeArm = (side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.67, 0.82, 0);
      group.add(arm);
      makeMesh(sphere(0.18, 14, 8), bodyMaterial, new THREE.Vector3(0, 0.04, 0), arm, `${side < 0 ? "left" : "right"}-shoulder`).scale.set(1, 0.72, 0.9);
      makeMesh(box(new THREE.Vector3(0.3, 0.48, 0.3)), skinMaterial, new THREE.Vector3(0, -0.31, 0), arm, "upper-arm");
      makeMesh(box(new THREE.Vector3(0.32, 0.18, 0.32)), side < 0 ? gloveMaterial : bodyMaterial, new THREE.Vector3(0, -0.66, 0), arm, "wrist");
      makeMesh(sphere(0.18, 14, 10), side < 0 ? gloveMaterial : skinMaterial, new THREE.Vector3(0, -0.86, 0.02), arm, "hand").scale.set(0.85, 1.05, 0.78);
      return arm;
    };

    const makeLeg = (side) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.26, -0.12, 0);
      group.add(leg);
      makeMesh(box(new THREE.Vector3(0.34, 0.82, 0.34)), pantsMaterial, new THREE.Vector3(0, -0.48, 0), leg, "pants");
      makeMesh(box(new THREE.Vector3(0.42, 0.22, 0.42)), bootMaterial, new THREE.Vector3(0, -0.98, 0.02), leg, "boot-top");
      makeMesh(box(new THREE.Vector3(0.46, 0.18, 0.66)), soleMaterial, new THREE.Vector3(0, -1.12, 0.12), leg, "boot-sole");
      makeMesh(cylinder(0.05, 0.05, 0.12, 10), this.materials.trim, new THREE.Vector3(side * 0.08, -0.95, 0.36), leg, "lace").rotation.x = Math.PI / 2;
      return leg;
    };

    const parts = {
      torso,
      head,
      hair: hairCap,
      leftArm: makeArm(-1),
      rightArm: makeArm(1),
      leftLeg: makeLeg(-1),
      rightLeg: makeLeg(1),
    };
    group.scale.setScalar(1.08);
    group.userData.parts = parts;
    return group;
  }

  resolveHumanSlots() {
    if (!this.network) return [{ playerId: "solo", slot: 0, name: "You" }];
    const players = this.network.getPlayers?.() ?? [];
    return players.slice(0, 2).map((player, slot) => ({
      playerId: player.id,
      slot,
      name: player.name ?? (slot === 0 ? "Host" : `Player ${slot + 1}`),
    }));
  }

  normalizeHumanSlots(slots = []) {
    const seen = new Set();
    return slots
      .filter((entry) => entry?.playerId && Number.isInteger(entry.slot) && entry.slot >= 0 && entry.slot < 2)
      .sort((a, b) => a.slot - b.slot)
      .filter((entry) => {
        if (seen.has(entry.playerId) || seen.has(`slot:${entry.slot}`)) return false;
        seen.add(entry.playerId);
        seen.add(`slot:${entry.slot}`);
        return true;
      })
      .map((entry) => ({
        playerId: entry.playerId,
        slot: entry.slot,
        name: entry.name ?? (entry.slot === 0 ? "Host" : `Player ${entry.slot + 1}`),
      }));
  }

  humanSlotsKey(slots = this.humanSlots) {
    return (slots ?? []).map((entry) => `${entry.slot}:${entry.playerId}`).join("|");
  }

  findLocalSlot() {
    const match = this.humanSlots.find((entry) => entry.playerId === this.playerId);
    if (match) return match.slot;
    return this.networkRole === "guest" ? 1 : 0;
  }

  playerName(playerId = this.playerId) {
    const slot = this.humanSlots.find((entry) => entry.playerId === playerId);
    if (slot) return slot.name;
    if (!this.network) return "You";
    return playerId === this.playerId ? "You" : "Player";
  }

  remoteSlot() {
    if (this.bot) return 1;
    const remote = this.humanSlots.find((entry) => entry.playerId !== this.playerId);
    return remote?.slot ?? (this.localSlot === 0 ? 1 : 0);
  }

  updatePlayerPalette() {
    if (!this.materials) return;
    const localSlot = clamp(this.localSlot ?? 0, 0, PLAYER_COLORS.length - 1);
    const remoteSlot = clamp(this.remoteSlot(), 0, PLAYER_COLORS.length - 1);
    this.materials.playerBody.color.setHex(PLAYER_COLORS[localSlot]);
    this.materials.playerHair.color.setHex(PLAYER_HAIR_COLORS[localSlot]);
    this.materials.remoteBody.color.setHex(PLAYER_COLORS[remoteSlot]);
    this.materials.remoteHair.color.setHex(PLAYER_HAIR_COLORS[remoteSlot]);
  }

  refreshHumanSlotsFromNetwork() {
    if (!this.network || this.networkRole !== "host") return;
    const slots = this.normalizeHumanSlots(this.resolveHumanSlots());
    if (slots.length === 0 || this.humanSlotsKey(slots) === this.humanSlotsKey()) return;
    this.humanSlots = slots;
    this.localSlot = this.findLocalSlot();
    this.updatePlayerPalette();
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
    [-1, 1].forEach((xSide) => {
      [-1, 1].forEach((zSide) => {
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 9.7, 12), this.materials.house);
        column.position.set(xSide * 10.15, 5.05, zSide * 7.9);
        column.castShadow = true;
        column.receiveShadow = true;
        house.add(column);
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.45, 1.35), this.materials.house);
        base.position.set(xSide * 10.15, 0.72, zSide * 7.9);
        base.castShadow = true;
        base.receiveShadow = true;
        house.add(base);
        const capital = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.55, 1.45), this.materials.house);
        capital.position.set(xSide * 10.15, 9.68, zSide * 7.9);
        capital.castShadow = true;
        capital.receiveShadow = true;
        house.add(capital);
      });
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

  buildGoalChoice() {
    this.goalChoice.innerHTML = "<strong>CHOOSE RUN</strong>";
    WAVE_MAPS.forEach((map) => {
      const card = document.createElement("article");
      card.className = "wave-map-card";
      const preview = document.createElement("span");
      preview.className = `wave-map-preview is-${map.id}`;
      const title = document.createElement("b");
      title.textContent = map.title;
      const subtitle = document.createElement("small");
      subtitle.textContent = map.subtitle;
      const targets = document.createElement("div");
      targets.className = "wave-targets";
      MATCH_TARGETS.forEach((target) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `$${target.toLocaleString("en-US")}`;
        button.addEventListener("click", () => this.startMatch(target, map.id));
        targets.append(button);
      });
      card.append(preview, title, subtitle, targets);
      this.goalChoice.append(card);
    });
  }

  startMatch(targetScore = MATCH_TARGETS[0], mapId = this.selectedMap.id, publish = true) {
    this.initAudio();
    this.resetRunState();
    this.applyMap(mapId);
    this.targetScore = targetScore;
    this.phase = "playing";
    this.winner = null;
    this.victoryShown = false;
    this.impactState = null;
    this.impacts = [];
    this.victoryOverlay.hidden = true;
    this.goalChoice.hidden = true;
    this.callbacks.onStatus?.(`${this.selectedMap.title}: first to $${targetScore.toLocaleString("en-US")} wins.`);
    if (publish && this.networkRole === "host") this.publishSnapshot(true);
  }

  resetRunState() {
    this.money = 0;
    this.speedLevel = 0;
    this.collectRateLevel = 0;
    this.speedUpgradeCost = INITIAL_SPEED_UPGRADE_COST;
    this.collectUpgradeCost = INITIAL_COLLECT_UPGRADE_COST;
    this.refreshMachineLabel("speed", `SPEED $${this.speedUpgradeCost}`, "#63dcff");
    this.refreshMachineLabel("collect", `TAKE $${this.collectUpgradeCost}`, "#b7f34a");
    this.trophies = 0;
    this.lootValue = 0;
    this.totalScore = 0;
    this.distance = 0;
    this.player.x = 0;
    this.player.y = 1.55;
    this.player.z = 5;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.speed = 0;
    this.player.angle = 0;
    this.player.grounded = true;
    this.player.inTrench = false;
    this.playerGroup.rotation.x = 0;
    this.playerGroup.rotation.z = 0;
    this.impactState = null;
    this.impacts = [];
    this.pendingBumpTargetId = null;
    this.remoteBumpCooldown = 0;
    this.lastProcessedBumpSeq.clear();
    this.collecting = null;
    this.claimedTrophyIds.clear();
    this.pendingClaimId = null;
    this.disposeObject3D(this.houseTrophyGroup);
    this.houseTrophyGroup.clear();
    if (this.bot) {
      this.bot.score = 0;
      this.bot.money = 0;
      this.bot.speedLevel = 0;
      this.bot.collectRateLevel = 0;
      this.bot.speedUpgradeCost = INITIAL_SPEED_UPGRADE_COST;
      this.bot.collectUpgradeCost = INITIAL_COLLECT_UPGRADE_COST;
      this.bot.x = 3.8;
      this.bot.y = 1.55;
      this.bot.z = 5;
      this.bot.angle = 0;
      this.bot.speed = 0;
      this.bot.vy = 0;
      this.bot.grounded = true;
      this.bot.inTrench = false;
      this.bot.targetX = 3.8;
      this.bot.targetZ = 18;
      this.bot.targetTrophy = null;
      this.bot.targetTrench = null;
      this.bot.collecting = null;
      this.bot.collectValue = 0;
      this.setBotState(BOT_STATES.RUNNING);
    }
    this.resetWorldGeometry();
  }

  applyMap(mapId) {
    const map = waveMapById(mapId);
    if (this.selectedMap.id === map.id) return;
    this.selectedMap = map;
    this.scene.background = new THREE.Color(map.sky);
    this.scene.fog = new THREE.Fog(map.fog, 70, 230);
    this.materials.grass.color.setHex(map.grass);
    this.materials.road.color.setHex(map.road);
    this.materials.trench.color.setHex(map.trench);
    this.materials.safe.color.setHex(map.safe);
    this.resetWorldGeometry();
  }

  resetWorldGeometry() {
    for (const group of this.chunks.values()) {
      this.trackGroup.remove(group);
      this.disposeObject3D(group, false);
    }
    this.chunks.clear();
    this.trenches = [];
    this.trophyStock.clear();
    this.trophiesWorld.forEach((trophy) => this.disposeTrophy(trophy));
    this.trophiesWorld = [];
    for (const wave of this.waves) {
      this.waveGroup.remove(wave.mesh);
      wave.mesh.geometry.dispose();
      wave.mesh.material.dispose();
    }
    this.waves = [];
    this.waveQueue = new TimedEventQueue({ horizon: WAVE_QUEUE_SECONDS, disconnectGrace: WAVE_QUEUE_SECONDS });
    this.waveSerial = 0;
    this.lastWaveEventAt = 0;
    this.nextWaveIn = 2.8;
    this.generateChunksAround(this.player.z, this.bot?.z ?? this.player.z);
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
      this.initAudio();
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
      this.initAudio();
      event.preventDefault();
      this.mobileInput.jump = true;
      this.jump();
    };
    this.onJumpUp = (event) => {
      event.preventDefault();
      this.mobileInput.jump = false;
    };
    this.onActionDown = (event) => {
      this.initAudio();
      event.preventDefault();
      this.mobileInput.action = true;
    };
    this.onActionUp = (event) => {
      event.preventDefault();
      this.mobileInput.action = false;
    };
    this.onSoundToggle = (event) => {
      event.preventDefault();
      this.initAudio();
      this.setMuted(!this.muted);
    };
    this.onPlayAgain = (event) => {
      event.preventDefault();
      if (this.networkRole === "guest") {
        this.callbacks.onStatus?.("Waiting for the host to start a new run.");
        return;
      }
      this.victoryOverlay.hidden = true;
      this.goalChoice.hidden = false;
      this.phase = "selecting";
      this.winner = null;
      this.victoryShown = false;
      this.callbacks.onStatus?.("Choose the target score.");
      if (this.networkRole === "host") this.publishSnapshot(true);
    };
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    this.soundButton.addEventListener("click", this.onSoundToggle);
    this.playAgainButton.addEventListener("click", this.onPlayAgain);
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

  initAudio() {
    if (this.audioReady || this.muted) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!this.audio) {
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = 0.22;
      master.connect(context.destination);
      this.audio = { context, master };
    }
    this.audio.context.resume?.();
    this.audioReady = true;
    this.startAmbience();
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem(SOUND_STORAGE_KEY, muted ? "1" : "0");
    if (this.audio?.master) this.audio.master.gain.setTargetAtTime(muted ? 0 : 0.22, this.audio.context.currentTime, 0.02);
    if (!muted) this.initAudio();
    this.refreshSoundButton();
  }

  refreshSoundButton() {
    if (!this.soundButton) return;
    this.soundButton.textContent = this.muted ? "MUTED" : "SOUND";
    this.soundButton.classList.toggle("is-muted", this.muted);
  }

  startAmbience() {
    if (!this.audio || this.ambience || this.muted) return;
    const { context, master } = this.audio;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 88;
    gain.gain.value = 0.018;
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    this.ambience = { oscillator, gain };
  }

  playTone({ frequency = 440, endFrequency = frequency, duration = 0.18, type = "sine", volume = 0.16, delay = 0 }) {
    if (this.muted) return;
    this.initAudio();
    if (!this.audioReady || !this.audio) return;
    const { context, master } = this.audio;
    const now = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  playSound(name) {
    const sounds = {
      jump: () => this.playTone({ frequency: 280, endFrequency: 620, duration: 0.14, type: "triangle", volume: 0.12 }),
      collect: () => {
        this.playTone({ frequency: 660, endFrequency: 990, duration: 0.09, type: "square", volume: 0.08 });
        this.playTone({ frequency: 990, endFrequency: 1320, duration: 0.1, type: "triangle", volume: 0.07, delay: 0.06 });
      },
      upgrade: () => {
        [360, 540, 720].forEach((frequency, index) => this.playTone({ frequency, endFrequency: frequency * 1.12, duration: 0.12, type: "triangle", volume: 0.08, delay: index * 0.07 }));
      },
      wave: () => this.playTone({ frequency: 120, endFrequency: 56, duration: 0.55, type: "sawtooth", volume: 0.08 }),
      pass: () => this.playTone({ frequency: 340, endFrequency: 190, duration: 0.18, type: "sine", volume: 0.08 }),
      hit: () => {
        this.playTone({ frequency: 90, endFrequency: 32, duration: 0.42, type: "sawtooth", volume: 0.2 });
        this.playTone({ frequency: 240, endFrequency: 80, duration: 0.28, type: "square", volume: 0.08 });
      },
      respawn: () => this.playTone({ frequency: 190, endFrequency: 520, duration: 0.22, type: "triangle", volume: 0.1 }),
      victory: () => [523, 659, 784, 1046].forEach((frequency, index) => this.playTone({ frequency, endFrequency: frequency * 1.02, duration: 0.2, type: "triangle", volume: 0.12, delay: index * 0.11 })),
    };
    sounds[name]?.();
  }

  showVictory(winnerName = this.winner, winnerScore = null) {
    if (!winnerName || this.victoryShown) return;
    this.victoryShown = true;
    const score = winnerScore ?? this.rankingEntries().find((entry) => entry.name === winnerName)?.score ?? this.targetScore;
    this.victoryNameEl.textContent = `${winnerName} WINS!`;
    this.victoryScoreEl.textContent = `$${Math.floor(score).toLocaleString("en-US")}`;
    this.playAgainButton.disabled = this.networkRole === "guest";
    this.playAgainButton.textContent = this.networkRole === "guest" ? "WAIT FOR HOST" : "NEW RUN";
    this.victoryOverlay.hidden = false;
    this.spawnVictoryConfetti();
    this.playSound("victory");
  }

  spawnVictoryConfetti() {
    this.victoryOverlay.querySelectorAll(".wave-confetti").forEach((node) => node.remove());
    const colors = ["#b7f34a", "#63dcff", "#ff668c", "#ffd36a", "#f8f7ff"];
    for (let index = 0; index < 72; index += 1) {
      const piece = document.createElement("i");
      piece.className = "wave-confetti";
      piece.style.left = `${rand(4, 96)}%`;
      piece.style.setProperty("--delay", `${rand(0, 0.9).toFixed(2)}s`);
      piece.style.setProperty("--fall", `${rand(2.0, 3.6).toFixed(2)}s`);
      piece.style.setProperty("--spin", `${rand(-540, 540).toFixed(0)}deg`);
      piece.style.background = colors[index % colors.length];
      this.victoryOverlay.append(piece);
    }
  }

  resize() {
    const rect = this.root.getBoundingClientRect();
    const availableWidth = Math.max(320, Math.floor(rect.width || window.innerWidth));
    const availableHeight = Math.max(240, Math.floor(rect.height || window.innerHeight));
    const targetAspect = 16 / 9;
    let width = availableWidth;
    let height = Math.floor(width / targetAspect);
    if (height > availableHeight) {
      height = availableHeight;
      width = Math.floor(height * targetAspect);
    }
    this.canvasHost.style.width = `${width}px`;
    this.canvasHost.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  jump() {
    if (!this.player.grounded || this.isRunnerImpacted(this.player)) return;
    this.player.vy = this.player.inTrench ? 13.8 : 9.4;
    this.player.grounded = false;
    this.player.state = PLAYER_STATES.JUMPING;
    this.cancelCollect();
    this.playSound("jump");
  }

  pointerDown(event) {
    this.initAudio();
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
    this.mobileInput.x = -dx / 52;
    this.mobileInput.y = dy / 52;
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  disposeObject3D(object, disposeMaterials = true) {
    const geometries = new Set();
    const materialsSeen = new Set();
    object.traverse?.((child) => {
      if (child.geometry && !geometries.has(child.geometry)) {
        geometries.add(child.geometry);
        child.geometry.dispose?.();
      }
      if (!disposeMaterials) return;
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      materials.forEach((material) => {
        if (materialsSeen.has(material)) return;
        materialsSeen.add(material);
        material.map?.dispose?.();
        material.dispose?.();
      });
    });
  }

  generateChunksAround(z, extraZ = z) {
    const current = Math.floor(z / this.chunkLength);
    const extraCurrent = Math.floor(extraZ / this.chunkLength);
    [current, extraCurrent].forEach((center) => {
      for (let index = center - 2; index <= center + 14; index += 1) {
        if (!this.chunks.has(index)) this.createChunk(index);
      }
    });
    const earliest = Math.min(current, extraCurrent);
    const latest = Math.max(current, extraCurrent);
    for (const [index, group] of this.chunks.entries()) {
      if (index < earliest - 4 || index > latest + 16) {
        this.trackGroup.remove(group);
        this.disposeObject3D(group, false);
        this.chunks.delete(index);
        this.trenches = this.trenches.filter((trench) => trench.chunk !== index);
        this.trophyStock.delete(index);
      }
    }
    const trailingZ = Math.min(z, extraZ);
    this.trophiesWorld = this.trophiesWorld.filter((trophy) => {
      if (trophy.z < trailingZ - 24 || trophy.collected) {
        this.disposeTrophy(trophy);
        return false;
      }
      return true;
    });
  }

  createChunk(index) {
    const group = new THREE.Group();
    group.position.z = index * this.chunkLength;
    const rng = seededRandom(index * 99991 + this.selectedMap.seedOffset);
    const r = (min, max) => min + rng() * (max - min);
    const difficulty = clamp(index / 28, 0, 1);
    const recentTrench = this.trenches.some((item) => item.chunk >= index - 1 && item.chunk < index);
    const forcedTrench = index > 0 && !recentTrench;
    const hasTrench = index > 0 && (rng() < 0.58 + this.selectedMap.trenchBias + difficulty * 0.22 || forcedTrench);
    const trench = hasTrench ? this.createTrenchSpec(index, forcedTrench, rng) : null;
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
      const baseTrophyCount = 2 + Math.floor(rng() * 4) + (rng() < 0.35 ? 2 : 0);
      const trophyCount = Math.max(2, Math.round(baseTrophyCount * 1.2));
      const rowZ = chunkStart + r(8, this.chunkLength - 8);
      for (let item = 0; item < trophyCount; item += 1) {
        const parallel = item < 5 && rng() < 0.72;
        this.spawnTrophy(index, trench, parallel ? rowZ + r(-1.4, 1.4) : null, rng);
      }
      this.trophyStock.set(index, {
        initial: trophyCount,
        lastRespawn: this.time - TROPHY_RESPAWN_INTERVAL,
      });
    }
    this.trackGroup.add(group);
    this.chunks.set(index, group);
  }

  createTrenchSpec(index, forced = false, rng = Math.random) {
    const r = (min, max) => min + rng() * (max - min);
    const chunkStart = index * this.chunkLength;
    const roll = rng();
    const shiftedRoll = (roll + this.selectedMap.trenchShift) % 1;
    const width = shiftedRoll < 0.28 ? r(26, 32) : shiftedRoll < 0.62 ? r(9, 15) : r(13, 22);
    const sideSpan = this.trackWidth / 2 - width / 2 - 1;
    const laneBias = this.selectedMap.id === "tidal" ? Math.sin(index * 1.9) * sideSpan * 0.45 : 0;
    const x = width > this.trackWidth * 0.72 ? 0 : clamp(r(-sideSpan, sideSpan) + laneBias, -sideSpan, sideSpan);
    const length = forced ? r(9, 14) : shiftedRoll < 0.35 ? r(5.5, 8.5) : shiftedRoll < 0.72 ? r(8.5, 13) : r(12, 18);
    const maxStart = forced ? Math.min(9, this.chunkLength - length - 4) : this.chunkLength - length - 4;
    const z0 = chunkStart + r(5, maxStart);
    return {
      chunk: index,
      x,
      z0,
      z1: z0 + length,
      width,
      depth: r(-1.72, -1.48),
    };
  }

  spawnTrophy(index, trench, preferredZ = null, rng = Math.random, idSuffix = "") {
    if (this.trophiesWorld.length >= MAX_ACTIVE_TROPHIES) return null;
    const r = (min, max) => min + rng() * (max - min);
    const chunkStart = index * this.chunkLength;
    const avoidTrench = (x, z) => {
      if (!trench || z < trench.z0 - 1 || z > trench.z1 + 1) return { x, z };
      if (Math.abs(x - trench.x) < trench.width / 2 + 1.2) {
        return {
          x: trench.x < 0 ? r(2.5, this.trackWidth / 2 - 2.5) : r(-this.trackWidth / 2 + 2.5, -2.5),
          z: rng() < 0.5 ? trench.z0 - 3 : trench.z1 + 3,
        };
      }
      return { x, z };
    };
    const isOpen = (x, z) => !this.trophiesWorld.some((trophy) => {
      if (trophy.collected || trophy.chunk !== index) return false;
      return Math.hypot(trophy.x - x, trophy.z - z) < TROPHY_MIN_SPACING;
    });
    let x = 0;
    let z = preferredZ ?? chunkStart + r(5, this.chunkLength - 5);
    let foundOpenSpot = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidateZ = attempt === 0 && preferredZ !== null ? z : chunkStart + r(5, this.chunkLength - 5);
      const candidateX = r(-this.trackWidth / 2 + 2.5, this.trackWidth / 2 - 2.5);
      const point = avoidTrench(candidateX, candidateZ);
      x = point.x;
      z = point.z;
      if (isOpen(x, z)) {
        foundOpenSpot = true;
        break;
      }
    }
    if (!foundOpenSpot) return null;
    const randomMultiplier = r(1, 5);
    const value = Math.max(5, Math.round((Math.max(3, z) ** 2 * randomMultiplier) / 95));
    const symbol = this.trophySymbolForValue(value, rng);
    const collectNeed = value * r(1, 3);
    const sprite = this.createEmojiSprite(symbol, 1.25 + clamp(value / 300, 0, 0.45));
    sprite.position.set(x, 1.35, z);
    this.trophyGroup.add(sprite);
    const priceSprite = this.createTextSprite(`$${value}`, "#171525", "rgba(183,243,74,.92)", 1.75, 0.55, x, 2.75, z);
    priceSprite.visible = false;
    this.trophyGroup.add(priceSprite);
    const id = `${index}:${Math.round(z * 10)}:${Math.round(x * 10)}:${symbol}${idSuffix}`;
    if (this.claimedTrophyIds.has(id)) {
      this.disposeTrophy({ sprite, priceSprite });
      return null;
    }
    const trophy = { id, chunk: index, sprite, priceSprite, symbol, x: sprite.position.x, z, value, collectNeed, collectedValue: 0, progress: 0, collected: false };
    this.trophiesWorld.push(trophy);
    return trophy;
  }

  trophySymbolForValue(value, rng = Math.random) {
    const tier = TROPHY_TIERS.find((item) => value <= item.max) ?? TROPHY_TIERS[TROPHY_TIERS.length - 1];
    return tier.items[Math.floor(rng() * tier.items.length)];
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

  updateTrophyRespawns() {
    for (const [chunk, stock] of this.trophyStock.entries()) {
      if (!this.chunks.has(chunk) || chunk <= 1 || stock.initial <= 0) continue;
      if (this.time - stock.lastRespawn < TROPHY_RESPAWN_INTERVAL) continue;
      stock.lastRespawn = this.time;
      const active = this.trophiesWorld.filter((trophy) => trophy.chunk === chunk && !trophy.collected).length;
      if (active >= stock.initial || this.trophiesWorld.length >= MAX_ACTIVE_TROPHIES) continue;
      const amount = active < stock.initial / 2 ? 2 : 1;
      const trench = this.trenches.find((item) => item.chunk === chunk) ?? null;
      for (let index = 0; index < amount && this.trophiesWorld.length < MAX_ACTIVE_TROPHIES; index += 1) {
        const seed = hashString(`${this.selectedMap.id}:${chunk}:${Math.floor(this.time / TROPHY_RESPAWN_INTERVAL)}:${index}`);
        const rng = seededRandom(seed);
        const chunkStart = chunk * this.chunkLength;
        const z = chunkStart + 5 + rng() * (this.chunkLength - 10);
        this.spawnTrophy(chunk, trench, z, rng, `:r${seed.toString(36)}`);
      }
    }
  }

  currentTrench(x, z) {
    return this.trenches.find((trench) => z >= trench.z0 && z <= trench.z1 && Math.abs(x - trench.x) <= trench.width / 2) ?? null;
  }

  surfaceY(x, z) {
    return this.currentTrench(x, z)?.depth ?? 1.55;
  }

  makeWaveEvent(at) {
    const frontZ = Math.max(this.player.z, this.bot?.z ?? this.player.z);
    const difficulty = clamp(Math.max(this.distance, frontZ) / 650, 0, 1);
    const roll = Math.random();
    const type = roll < 0.14
      ? WAVE_TYPES[0]
      : roll < 0.5 - difficulty * 0.12
        ? WAVE_TYPES[1]
        : roll < 0.86 - difficulty * 0.08
          ? WAVE_TYPES[2]
          : WAVE_TYPES[3];
    const speed = (type.speed + (type.harmless ? difficulty * 2.5 : difficulty * 7)) * this.selectedMap.waveSpeedMultiplier;
    this.waveSerial += 1;
    return {
      id: `${this.selectedMap.id}:${Math.floor(at * 1000)}:${this.waveSerial}:${type.id}`,
      at: Number(at.toFixed(3)),
      type: type.id,
      speed: Number(speed.toFixed(3)),
      lead: Number((150 * this.selectedMap.waveLeadMultiplier).toFixed(2)),
    };
  }

  nextWaveDelay() {
    const frontZ = Math.max(this.player.z, this.bot?.z ?? this.player.z);
    const difficulty = clamp(Math.max(this.distance, frontZ) / 650, 0, 1);
    const basis = WAVE_TYPES[1 + Math.floor(Math.random() * (WAVE_TYPES.length - 1))];
    return Math.max(1.45, (basis.interval - difficulty * 1.55) * this.selectedMap.waveIntervalMultiplier * rand(0.7, 1.3));
  }

  ensureWaveQueueFilled() {
    if (this.phase !== "playing") return;
    this.waveQueue.fill(
      this.time,
      (at) => this.makeWaveEvent(at),
      () => this.nextWaveDelay(),
    );
  }

  spawnWave(event = null) {
    const waveEvent = event ?? this.makeWaveEvent(this.time);
    const frontZ = Math.max(this.player.z, this.bot?.z ?? this.player.z);
    const type = waveTypeById(waveEvent.type);
    this.createWaveMesh(type, frontZ + (waveEvent.lead ?? 150 * this.selectedMap.waveLeadMultiplier), waveEvent.speed, waveEvent.id);
    this.lastWaveEventAt = Math.max(this.lastWaveEventAt, waveEvent.at ?? this.time);
    this.nextWaveIn = this.nextWaveDelay();
    if (!type.harmless) this.playSound("wave");
  }

  createWaveMesh(type, z, speed, id) {
    const geometry = new THREE.BoxGeometry(42, 2.2, 0.65);
    const material = new THREE.MeshStandardMaterial({
      color: type.color,
      emissive: type.color,
      emissiveIntensity: type.id === "red" ? 0.75 : 0.35,
      transparent: true,
      opacity: 0.72,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 1.35, z);
    mesh.castShadow = true;
    this.waveGroup.add(mesh);
    const wave = { id, mesh, type, speed, box: new THREE.Box3() };
    this.waves.push(wave);
    return wave;
  }

  updateInput(dt) {
    if (this.isRunnerImpacted(this.player)) {
      this.player.speed = 0;
      return;
    }
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
    return PLAYER_MAX_SPEED * (1.12 ** this.speedLevel);
  }

  currentCollectRate() {
    return Math.round(BASE_COLLECT_RATE * (1.3 ** this.collectRateLevel));
  }

  updatePhysics(dt) {
    const groundY = this.surfaceY(this.player.x, this.player.z);
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
    if (this.isRunnerImpacted(this.player)) return;
    if (this.collecting?.collected) this.collecting = null;
    const harvest = this.keys.has("e") || this.mobileInput.action;
    if (this.nearbyUpgradeMachine()) return;
    if (!harvest || !this.player.grounded || this.player.inTrench || this.lastInputMove > 0.4) return;
    const trophy = this.collecting ?? this.trophiesWorld.find((item) => !item.collected && Math.hypot(item.x - this.player.x, item.z - this.player.z) < COLLECT_RADIUS);
    if (!trophy) return;
    this.collecting = trophy;
    trophy.collectedValue += this.currentCollectRate() * dt;
    trophy.progress = clamp(trophy.collectedValue / trophy.collectNeed, 0, 1);
    if (trophy.progress >= 1) {
      trophy.collected = true;
      this.claimedTrophyIds.add(trophy.id);
      this.pendingClaimId = trophy.id;
      this.trophies += 1;
      this.lootValue += trophy.value;
      this.totalScore += trophy.value;
      this.money += trophy.value;
      this.disposeTrophy(trophy);
      this.spawnHouseTrophy(trophy.symbol);
      this.callbacks.onStatus?.(`${trophy.symbol} claimed: +$${trophy.value}.`);
      this.playSound("collect");
      this.collecting = null;
      this.checkWinner();
    }
  }

  updateRunnerBumpCooldowns(dt) {
    this.player.bumpCooldown = Math.max(0, (this.player.bumpCooldown ?? 0) - dt);
    if (this.bot) this.bot.bumpCooldown = Math.max(0, (this.bot.bumpCooldown ?? 0) - dt);
    this.remoteBumpCooldown = Math.max(0, this.remoteBumpCooldown - dt);
  }

  updatePlayerBumpAction() {
    const action = this.keys.has("e") || this.mobileInput.action;
    if (!action || this.nearbyUpgradeMachine()) return;
    if (this.bot && this.remoteGroup?.visible && this.bumpRunner(this.player, this.bot)) {
      this.cancelCollect();
      this.callbacks.onStatus?.(`${this.bot.name} got bumped.`);
      return;
    }
    const remote = this.remoteRunnerEntry();
    if (!remote?.pose || this.remoteBumpCooldown > 0) return;
    if (this.canBumpRunner(this.player, { ...remote.pose, bumpCooldown: this.remoteBumpCooldown })) {
      this.remoteBumpCooldown = RUNNER_BUMP_COOLDOWN;
      this.pendingBumpTargetId = remote.id;
      this.bumpSerial += 1;
      this.cancelCollect();
      this.playSound("jump");
      this.sendNetworkInput(true);
      this.callbacks.onStatus?.(`${remote.name ?? "Player"} got bumped.`);
    }
  }

  remoteRunnerEntry() {
    return this.remoteRanking.find((entry) => entry.id !== this.playerId && entry.pose) ?? null;
  }

  maybeBotBumpPlayer(dangerWave) {
    if (!this.bot || !this.playerGroup) return;
    const playerTrench = this.currentTrench(this.player.x, this.player.z);
    const botTrench = this.currentTrench(this.bot.x, this.bot.z);
    const sameTrenchUnderPressure = dangerWave && dangerWave.timeToWave < 3.8 && playerTrench && playerTrench === botTrench;
    const interruptCollect = this.collecting && Math.hypot(this.bot.x - this.player.x, this.bot.z - this.player.z) < RUNNER_BUMP_RADIUS + 0.8;
    if (!sameTrenchUnderPressure && !interruptCollect) return;
    if (this.bumpRunner(this.bot, this.player)) {
      this.cancelCollect();
      this.callbacks.onStatus?.(`${this.bot.name} bumped you.`);
    }
  }

  sendNetworkInput(force = false) {
    if (!this.network) return;
    const now = performance.now();
    if (!force && now - (this.lastInputSent ?? 0) < 50) return;
    this.lastInputSent = now;
    this.netcode.sendInput({
      score: this.totalScore,
      claimId: this.pendingClaimId,
      phase: this.phase,
      targetScore: this.targetScore,
      mapId: this.selectedMap.id,
      pose: this.playerPose(),
      bumpTargetId: this.pendingBumpTargetId,
      bumpSeq: this.bumpSerial,
    });
    this.pendingClaimId = null;
  }

  processNetworkBumps() {
    if (!this.network) return;
    this.netcode.getInputs().forEach((entry) => {
      const value = entry.value;
      if (!value || entry.playerId === this.playerId || value.bumpTargetId !== this.playerId) return;
      const seq = Number(value.bumpSeq) || 0;
      if (seq <= (this.lastProcessedBumpSeq.get(entry.playerId) ?? 0)) return;
      this.lastProcessedBumpSeq.set(entry.playerId, seq);
      if (this.forceRunnerJump(this.player)) {
        this.cancelCollect();
        this.playSound("jump");
        this.callbacks.onStatus?.(`${this.playerName(entry.playerId)} bumped you.`);
      }
    });
  }

  updateNetworkHost(dt) {
    if (!this.network || this.networkRole !== "host") return;
    this.refreshHumanSlotsFromNetwork();
    const inputs = this.netcode.getInputs();
    this.remoteRanking = inputs
      .filter((entry) => entry.value && entry.playerId !== this.playerId)
      .map((entry, index) => ({
        id: entry.playerId,
        name: this.playerName(entry.playerId) || `Player ${index + 2}`,
        score: Number(entry.value.score) || 0,
        pose: entry.value.pose ?? null,
      }));
    this.remotePose = this.remoteRanking[0]?.pose ?? null;
    inputs.forEach((entry) => {
      const claimId = entry.value?.claimId;
      if (claimId) this.claimedTrophyIds.add(claimId);
    });
    this.reconcileClaimedTrophies();
    this.checkWinner();
    this.networkClock += dt;
    if (this.networkClock >= 0.1) {
      this.networkClock = 0;
      this.publishSnapshot();
    }
  }

  publishSnapshot(force = false) {
    if (!this.network || this.networkRole !== "host") return;
    this.refreshHumanSlotsFromNetwork();
    this.ensureWaveQueueFilled();
    this.netcode.publish({
      phase: this.phase,
      mapId: this.selectedMap.id,
      humanSlots: this.humanSlots,
      targetScore: this.targetScore,
      winner: this.winner,
      claimed: [...this.claimedTrophyIds],
      hostTime: Number(this.time.toFixed(3)),
      wavePlan: this.waveQueue.snapshot(this.time),
      waves: this.waves.map((wave) => ({
        id: wave.id,
        type: wave.type.id,
        z: wave.mesh.position.z,
        speed: wave.speed,
      })),
      ranking: this.rankingEntries(),
      revision: force ? Date.now() : Math.floor(this.time * 1000),
    });
  }

  applyNetworkSnapshot(snapshot) {
    if (!snapshot || snapshot.kind !== "wave-runners" || this.networkRole !== "guest") return;
    const incomingHostTime = Number(snapshot.hostTime) || 0;
    const incomingRevision = snapshot.revision ?? incomingHostTime;
    const isFreshSnapshot = this.lastNetworkRevision !== incomingRevision || incomingHostTime > this.lastNetworkHostTime + 0.001;
    if (isFreshSnapshot) {
      this.lastNetworkRevision = incomingRevision;
      this.lastNetworkHostTime = Math.max(this.lastNetworkHostTime, incomingHostTime);
      this.networkQueueExpired = false;
    }
    this.targetScore = snapshot.targetScore ?? this.targetScore;
    const snapshotSlots = this.normalizeHumanSlots(snapshot.humanSlots ?? []);
    if (snapshotSlots.length > 0 && this.humanSlotsKey(snapshotSlots) !== this.humanSlotsKey()) {
      this.humanSlots = snapshotSlots;
      this.localSlot = this.findLocalSlot();
      this.updatePlayerPalette();
    }
    this.applyMap(snapshot.mapId ?? this.selectedMap.id);
    this.winner = snapshot.winner ?? null;
    this.networkQueueExpired = false;
    this.remoteRanking = snapshot.ranking ?? [];
    this.remotePose = this.remoteRanking.find((entry) => entry.id !== this.playerId)?.pose ?? null;
    if (snapshot.phase === "selecting") {
      this.phase = "selecting";
      this.goalChoice.hidden = false;
      this.callbacks.onStatus?.("The host is choosing a target score.");
      return;
    }
    if (snapshot.phase === "playing" && this.phase !== "playing") {
      this.resetRunState();
      this.phase = "playing";
      this.goalChoice.hidden = true;
      this.victoryOverlay.hidden = true;
      this.victoryShown = false;
      this.callbacks.onStatus?.(`First to $${this.targetScore.toLocaleString("en-US")} wins.`);
    }
    if (snapshot.phase === "finished") {
      this.phase = "finished";
      if (this.winner) this.showVictory(this.winner);
    }
    (snapshot.claimed ?? []).forEach((id) => this.claimedTrophyIds.add(id));
    if (isFreshSnapshot) {
      this.waveQueue.sync(snapshot.wavePlan ?? [], incomingHostTime || this.time);
      this.reconcileNetworkWaves(snapshot.waves ?? []);
    }
    this.reconcileClaimedTrophies();
  }

  reconcileClaimedTrophies() {
    this.trophiesWorld.forEach((trophy) => {
      if (!trophy.collected && this.claimedTrophyIds.has(trophy.id)) {
        trophy.collected = true;
        this.disposeTrophy(trophy);
        if (this.collecting === trophy) this.cancelCollect();
      }
    });
  }

  reconcileNetworkWaves(waves) {
    const liveIds = new Set(waves.map((wave) => wave.id));
    this.waves = this.waves.filter((wave) => {
      if (liveIds.has(wave.id)) return true;
      this.waveGroup.remove(wave.mesh);
      wave.mesh.geometry.dispose();
      wave.mesh.material.dispose();
      return false;
    });
    waves.forEach((snapshot) => {
      let wave = this.waves.find((item) => item.id === snapshot.id);
      if (!wave) {
        wave = this.createWaveMesh(waveTypeById(snapshot.type), snapshot.z, snapshot.speed, snapshot.id);
      }
      wave.type = waveTypeById(snapshot.type);
      wave.speed = snapshot.speed;
      wave.mesh.position.z = snapshot.z;
    });
  }

  updateBot(dt) {
    if (!this.bot || this.phase !== "playing" || this.winner) return;
    if (this.isRunnerImpacted(this.bot)) return;
    if (!this.bot.grounded) {
      this.bot.speed += (0 - this.bot.speed) * (1 - Math.exp(-10 * dt));
      this.updateBotVertical(dt);
      return;
    }
    if (this.bot.z < 13) this.updateBotUpgrades();
    if (this.bot.collecting?.collected) {
      this.bot.collecting = null;
      this.bot.collectValue = 0;
      this.setBotState(BOT_STATES.RUNNING);
    }
    const dangerWave = this.nearestDangerWaveForBot();
    const canFinishCurrentCollect = this.bot.collecting && this.canBotFinishCollectBeforeWave(this.bot.collecting, dangerWave);
    if (dangerWave && this.shouldBotHideFromWave(dangerWave) && !canFinishCurrentCollect) {
      this.bot.collecting = null;
      this.bot.collectValue = 0;
      this.bot.targetTrench = this.findBotSafeTrench(dangerWave);
      if (this.bot.targetTrench) this.setBotState(BOT_STATES.SEEK_TRENCH);
    }
    this.maybeBotBumpPlayer(dangerWave);

    switch (this.bot.state) {
      case BOT_STATES.SEEK_TRENCH:
        this.updateBotSeekingTrench(dt, dangerWave);
        break;
      case BOT_STATES.IN_TRENCH:
        this.updateBotInTrench(dt, dangerWave);
        break;
      case BOT_STATES.RETURNING_TO_SURFACE:
        this.updateBotReturningToSurface(dt);
        break;
      case BOT_STATES.COLLECTING:
        this.updateBotCollecting(dt, dangerWave);
        break;
      case BOT_STATES.UPGRADING:
      case BOT_STATES.DEAD_RESET:
      case BOT_STATES.RUNNING:
      case BOT_STATES.SEEK_TROPHY:
      default:
        this.updateBotRunning(dt, dangerWave);
        break;
    }
    this.updateBotVertical(dt);
  }

  botCollectRate() {
    return Math.round(BASE_COLLECT_RATE * (1.3 ** this.bot.collectRateLevel));
  }

  botMaxSpeed() {
    return PLAYER_MAX_SPEED * (1.12 ** this.bot.speedLevel) * 0.96;
  }

  setBotState(state) {
    if (!this.bot || this.bot.state === state) return;
    this.bot.state = state;
  }

  updateBotRunning(dt, dangerWave) {
    if (!this.bot) return;
    if (dangerWave && this.shouldBotHideFromWave(dangerWave)) {
      this.bot.targetTrench = this.findBotSafeTrench(dangerWave);
      if (this.bot.targetTrench) {
        this.setBotState(BOT_STATES.SEEK_TRENCH);
        this.updateBotSeekingTrench(dt, dangerWave);
        return;
      }
    }
    const trophy = this.findBotTargetTrophy();
    this.bot.targetTrophy = trophy;
    if (trophy) {
      this.setBotState(BOT_STATES.SEEK_TROPHY);
      this.moveBotToward(trophy.x, trophy.z, dt, 0.96);
      if (Math.hypot(trophy.x - this.bot.x, trophy.z - this.bot.z) < COLLECT_RADIUS * 0.9) {
        this.bot.collecting = trophy;
        this.bot.collectValue = 0;
        this.setBotState(BOT_STATES.COLLECTING);
      }
      return;
    }
    this.setBotState(BOT_STATES.RUNNING);
    this.moveBotToward(Math.sin(this.time * 0.7) * 3.2, this.bot.z + 24, dt, 0.78);
  }

  updateBotCollecting(dt, dangerWave) {
    const trophy = this.bot.collecting;
    if (!trophy || trophy.collected || this.surfaceY(this.bot.x, this.bot.z) < 1) {
      this.bot.collecting = null;
      this.bot.collectValue = 0;
      this.setBotState(BOT_STATES.RUNNING);
      return;
    }
    if (dangerWave && !this.canBotFinishCollectBeforeWave(trophy, dangerWave)) {
      this.bot.collecting = null;
      this.bot.collectValue = 0;
      this.bot.targetTrench = this.findBotSafeTrench(dangerWave);
      this.setBotState(this.bot.targetTrench ? BOT_STATES.SEEK_TRENCH : BOT_STATES.RUNNING);
      return;
    }
    this.bot.speed += (0 - this.bot.speed) * (1 - Math.exp(-10 * dt));
    this.bot.collectValue += this.botCollectRate() * dt;
    if (this.bot.collectValue >= trophy.collectNeed) {
      this.claimTrophyForBot(trophy);
      this.bot.collecting = null;
      this.bot.collectValue = 0;
      this.setBotState(BOT_STATES.RUNNING);
    }
  }

  updateBotSeekingTrench(dt, dangerWave) {
    const safe = this.bot.targetTrench ?? (dangerWave ? this.findBotSafeTrench(dangerWave) : null);
    if (!safe) {
      this.setBotState(BOT_STATES.RUNNING);
      this.updateBotRunning(dt, dangerWave);
      return;
    }
    this.bot.targetTrench = safe;
    this.moveBotToward(safe.x, safe.z, dt, 1.08);
    if (this.surfaceY(this.bot.x, this.bot.z) < 1 && Math.hypot(this.bot.x - safe.x, this.bot.z - safe.z) < Math.max(1.6, safe.width * 0.2)) {
      this.bot.speed += (0 - this.bot.speed) * (1 - Math.exp(-8 * dt));
      this.setBotState(BOT_STATES.IN_TRENCH);
    }
  }

  updateBotInTrench(dt, dangerWave) {
    this.bot.speed += (0 - this.bot.speed) * (1 - Math.exp(-8 * dt));
    if (dangerWave && dangerWave.timeToWave > -0.8) return;
    const exitZ = this.bot.targetTrench ? this.bot.targetTrench.z1 + 2.4 : this.bot.z + 6;
    this.bot.targetZ = exitZ;
    this.setBotState(BOT_STATES.RETURNING_TO_SURFACE);
  }

  updateBotReturningToSurface(dt) {
    this.moveBotToward(this.bot.targetTrench?.x ?? 0, this.bot.targetZ, dt, 0.78);
    if (this.surfaceY(this.bot.x, this.bot.z) > 1) {
      this.bot.targetTrench = null;
      this.setBotState(BOT_STATES.RUNNING);
    }
  }

  updateBotVertical(dt) {
    const groundY = this.surfaceY(this.bot.x, this.bot.z);
    this.bot.inTrench = groundY < 1;
    if (!this.bot.grounded) {
      this.bot.vy -= 24 * dt;
      this.bot.y += this.bot.vy * dt;
      if (this.bot.y <= groundY) {
        this.bot.y = groundY;
        this.bot.vy = 0;
        this.bot.grounded = true;
      }
      return;
    }
    this.bot.y += (groundY - this.bot.y) * (1 - Math.exp(-14 * dt));
  }

  moveBotToward(targetX, targetZ, dt, speedScale = 1) {
    const dx = targetX - this.bot.x;
    const dz = targetZ - this.bot.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) {
      this.bot.speed += (0 - this.bot.speed) * (1 - Math.exp(-8 * dt));
      return;
    }
    const desiredSpeed = this.botMaxSpeed() * speedScale;
    this.bot.speed += (desiredSpeed - this.bot.speed) * (1 - Math.exp(-4.5 * dt));
    const step = Math.min(distance, this.bot.speed * dt);
    this.bot.x = clamp(this.bot.x + (dx / distance) * step, -this.trackWidth / 2 + 1.1, this.trackWidth / 2 - 1.1);
    this.bot.z = Math.max(0, this.bot.z + (dz / distance) * step);
    this.bot.angle = Math.atan2(dx, dz);
    this.bot.targetX = targetX;
    this.bot.targetZ = targetZ;
  }

  findBotTargetTrophy() {
    if (!this.bot) return null;
    const wave = this.nearestDangerWaveForBot();
    let best = null;
    let bestScore = -Infinity;
    for (const trophy of this.trophiesWorld) {
      if (trophy.collected || this.surfaceY(trophy.x, trophy.z) < 1) continue;
      if (trophy.z < this.bot.z - 4 || trophy.z > this.bot.z + 58) continue;
      const travelDistance = Math.hypot(trophy.x - this.bot.x, trophy.z - this.bot.z);
      const travelTime = travelDistance / Math.max(1, this.botMaxSpeed());
      const collectTime = trophy.collectNeed / Math.max(1, this.botCollectRate());
      if (wave) {
        const timeToWaveAtTrophy = (wave.mesh.position.z - trophy.z) / wave.speed;
        if (timeToWaveAtTrophy < travelTime + collectTime + 0.35) continue;
      }
      const score = trophy.value / Math.max(1, travelTime + collectTime) - travelDistance * 0.18;
      if (score > bestScore) {
        best = trophy;
        bestScore = score;
      }
    }
    return best;
  }

  findBotSafeTrench(wave) {
    if (!this.bot || !wave) return null;
    let best = null;
    let bestScore = Infinity;
    for (const trench of this.trenches) {
      if (trench.z1 < this.bot.z - 16 || trench.z0 > wave.mesh.position.z + 6) continue;
      const targetZ = clamp(this.bot.z, trench.z0 + 1.2, trench.z1 - 1.2);
      const targetX = trench.x;
      const distance = Math.hypot(targetX - this.bot.x, targetZ - this.bot.z);
      const timeToReach = distance / Math.max(1, this.botMaxSpeed() * 1.08) + 0.45;
      const timeToWave = (wave.mesh.position.z - targetZ) / wave.speed;
      if (timeToWave < timeToReach + 0.45) continue;
      const score = timeToReach + Math.max(0, targetZ - this.bot.z) * 0.015;
      if (score < bestScore) {
        best = { ...trench, x: targetX, z: targetZ, timeToReach, timeToWave };
        bestScore = score;
      }
    }
    return best;
  }

  nearestDangerWaveForBot() {
    if (!this.bot) return null;
    let nearest = null;
    for (const wave of this.waves) {
      if (wave.type.harmless) continue;
      const timeToWave = (wave.mesh.position.z - this.bot.z) / wave.speed;
      if (timeToWave < -1.2 || timeToWave > 9.5) continue;
      if (!nearest || timeToWave < nearest.timeToWave) nearest = { ...wave, timeToWave };
    }
    return nearest;
  }

  shouldBotHideFromWave(wave) {
    if (!wave || this.bot.z < 12 || this.isBotSafeInTrench()) return false;
    const safeTrench = this.findBotSafeTrench(wave);
    if (!safeTrench) return wave.timeToWave < 2.2;
    return wave.timeToWave < safeTrench.timeToReach + 1.05;
  }

  canBotFinishCollectBeforeWave(trophy, wave) {
    if (!wave) return true;
    const remaining = Math.max(0, trophy.collectNeed - this.bot.collectValue);
    const collectTime = remaining / Math.max(1, this.botCollectRate());
    const timeToWorkSpot = (wave.mesh.position.z - trophy.z) / wave.speed;
    return timeToWorkSpot > collectTime + 0.35;
  }

  updateBotUpgrades() {
    if (!this.bot) return;
    let upgraded = false;
    while (this.bot.money >= this.bot.collectUpgradeCost) {
      this.bot.money -= this.bot.collectUpgradeCost;
      this.bot.collectRateLevel += 1;
      this.bot.collectUpgradeCost = Math.round(this.bot.collectUpgradeCost * 1.3 + 18);
      upgraded = true;
    }
    while (this.bot.money >= this.bot.speedUpgradeCost) {
      this.bot.money -= this.bot.speedUpgradeCost;
      this.bot.speedLevel += 1;
      this.bot.speedUpgradeCost = Math.round(this.bot.speedUpgradeCost * 1.32 + 20);
      upgraded = true;
    }
    if (upgraded) {
      this.setBotState(BOT_STATES.UPGRADING);
      this.callbacks.onStatus?.(`${this.bot.name} upgraded: TAKE $${this.botCollectRate()}/s, SPEED ${this.botMaxSpeed().toFixed(1)}.`);
    }
  }

  claimTrophyForBot(trophy) {
    if (!this.bot || trophy.collected) return;
    trophy.collected = true;
    this.claimedTrophyIds.add(trophy.id);
    this.bot.score += trophy.value;
    this.bot.money += trophy.value;
    this.bot.targetTrophy = null;
    this.bot.collecting = null;
    this.bot.collectValue = 0;
    this.disposeTrophy(trophy);
    this.callbacks.onStatus?.(`${this.bot.name} collected ${trophy.symbol}: +$${trophy.value}.`);
    this.checkWinner();
  }

  rankingEntries() {
    const localName = this.playerName(this.playerId);
    const entries = [{ id: this.playerId, name: localName, score: this.totalScore, pose: this.playerPose() }];
    if (this.bot) {
      entries.push({
        id: "bot",
        name: this.bot.name,
        score: this.bot.score,
        pose: {
          x: Number(this.bot.x.toFixed(2)),
          y: Number(this.bot.y.toFixed(2)),
          z: Number(this.bot.z.toFixed(2)),
          angle: Number(this.bot.angle.toFixed(3)),
          speed: Number(this.bot.speed.toFixed(2)),
        },
      });
    }
    if (this.remoteRanking) {
      this.remoteRanking.forEach((entry) => {
        if (entry.id !== this.playerId) entries.push(entry);
      });
    }
    return entries.sort((a, b) => b.score - a.score);
  }

  playerPose() {
    return {
      x: Number(this.player.x.toFixed(2)),
      y: Number(this.player.y.toFixed(2)),
      z: Number(this.player.z.toFixed(2)),
      angle: Number(this.player.angle.toFixed(3)),
      speed: Number(this.player.speed.toFixed(2)),
    };
  }

  updateRemoteVisual(dt) {
    if (!this.remoteGroup) return;
    const source = this.bot ?? this.remotePose;
    this.remoteGroup.visible = Boolean(source);
    if (!source) return;
    const target = new THREE.Vector3(source.x ?? 0, source.y ?? 1.55, source.z ?? 5);
    this.remoteGroup.position.lerp(target, 1 - Math.exp(-12 * dt));
    const angle = source.angle ?? 0;
    const delta = Math.atan2(Math.sin(angle - this.remoteGroup.rotation.y), Math.cos(angle - this.remoteGroup.rotation.y));
    this.remoteGroup.rotation.y += delta * (1 - Math.exp(-12 * dt));
  }

  checkWinner() {
    if (this.winner || this.phase !== "playing") return;
    const winner = this.rankingEntries().find((entry) => entry.score >= this.targetScore);
    if (!winner) return;
    this.winner = winner.name;
    this.phase = "finished";
    this.callbacks.onStatus?.(`${winner.name} wins at $${Math.floor(winner.score).toLocaleString("en-US")}!`);
    this.showVictory(winner.name, winner.score);
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
    this.speedUpgradeCost = Math.round(this.speedUpgradeCost * 1.32 + 20);
    this.refreshMachineLabel("speed", `SPEED $${this.speedUpgradeCost}`, "#63dcff");
    this.callbacks.onStatus?.(`Speed upgraded: ${this.currentMaxSpeed().toFixed(1)}.`);
    this.playSound("upgrade");
  }

  buyCollectUpgrade() {
    if (this.money < this.collectUpgradeCost) {
      this.callbacks.onStatus?.(`Need $${this.collectUpgradeCost} for the next harvest upgrade.`);
      return;
    }
    this.money -= this.collectUpgradeCost;
    this.collectRateLevel += 1;
    this.collectUpgradeCost = Math.round(this.collectUpgradeCost * 1.3 + 18);
    this.refreshMachineLabel("collect", `TAKE $${this.collectUpgradeCost}`, "#b7f34a");
    this.callbacks.onStatus?.(`Harvest upgraded: $${this.currentCollectRate()}/s.`);
    this.playSound("upgrade");
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
    if (this.networkRole !== "guest") {
      this.ensureWaveQueueFilled();
      this.waveQueue.takeDue(this.time).forEach((event) => this.spawnWave(event));
    } else {
      const hostTime = this.waveQueue.estimateHostTime();
      this.waveQueue.takeDue(hostTime).forEach((event) => this.spawnWave(event));
      if (!this.networkQueueExpired && this.waveQueue.isExpired()) {
        this.networkQueueExpired = true;
        this.phase = "finished";
        this.callbacks.onStatus?.("Wave sync queue expired. Reconnect or start a new room run.");
      }
    }
    this.playerGroup.position.set(this.player.x, this.player.y, this.player.z);
    this.playerGroup.rotation.y = this.player.angle;
    const playerBox = this.player.box.setFromObject(this.playerGroup);
    let botBox = null;
    if (this.bot && this.remoteGroup?.visible) {
      this.remoteGroup.position.set(this.bot.x, this.bot.y, this.bot.z);
      this.remoteGroup.rotation.y = this.bot.angle;
      botBox = this.bot.box.setFromObject(this.remoteGroup);
    }
    for (const wave of this.waves) {
      wave.mesh.position.z -= wave.speed * dt;
      wave.mesh.scale.y = 1 + Math.sin(this.time * 12 + wave.mesh.position.z) * 0.06;
      wave.box.setFromObject(wave.mesh);
      if (botBox && wave.box.intersectsBox(botBox)) {
        if (!wave.type.harmless && this.bot.z >= 12 && !this.isBotSafeInTrench()) {
          this.dieBot(wave.type.label);
          botBox = null;
        }
      }
      if (wave.box.intersectsBox(playerBox)) {
        if (wave.type.harmless) {
          this.callbacks.onStatus?.("WHITE wave passed. False alarm.");
          this.playSound("pass");
        } else if (this.player.z < 12) {
          this.callbacks.onStatus?.("Safe at home.");
        } else if (this.player.inTrench && this.player.y < 0.05) {
          this.callbacks.onStatus?.(`${wave.type.label} wave passed overhead.`);
          this.playSound("pass");
        } else {
          this.die(wave.type.label);
          break;
        }
      }
    }
    this.waves = this.waves.filter((wave) => {
      const trailingZ = Math.min(this.player.z, this.bot?.z ?? this.player.z);
      if (wave.mesh.position.z < trailingZ - 24) {
        this.waveGroup.remove(wave.mesh);
        wave.mesh.geometry.dispose();
        wave.mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  isBotSafeInTrench() {
    if (!this.bot) return false;
    return this.surfaceY(this.bot.x, this.bot.z) < 1 && this.bot.y < 0.05;
  }

  spawnImpactParticles(x, y, z, color = 0xf8f7ff) {
    for (let index = 0; index < 24; index += 1) {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.85,
        roughness: 0.45,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(rand(0.06, 0.14), 8, 6), material);
      mesh.position.set(x + rand(-0.55, 0.55), y + rand(-0.2, 0.7), z + rand(-0.55, 0.55));
      mesh.userData.velocity = new THREE.Vector3(rand(-5, 5), rand(2.5, 8), rand(-7, -2));
      mesh.userData.life = rand(0.45, 0.9);
      this.waveGroup.add(mesh);
    }
  }

  updateImpactParticles(dt) {
    const particles = this.waveGroup.children.filter((child) => child.userData?.velocity);
    particles.forEach((particle) => {
      particle.userData.life -= dt;
      particle.userData.velocity.y -= 16 * dt;
      particle.position.addScaledVector(particle.userData.velocity, dt);
      particle.material.opacity = clamp(particle.userData.life, 0, 0.85);
      if (particle.userData.life > 0) return;
      this.waveGroup.remove(particle);
      particle.geometry.dispose();
      particle.material.dispose();
    });
  }

  isRunnerImpacted(actor) {
    return this.impacts.some((state) => state.actor === actor);
  }

  isLocalImpacted() {
    return Boolean(this.impactState);
  }

  updateImpact(dt) {
    this.updateImpactParticles(dt);
    if (this.impacts.length === 0) return;
    this.impacts = this.impacts.filter((state) => {
      state.elapsed += dt;
      const progress = clamp(state.elapsed / state.duration, 0, 1);
      const arc = Math.sin(progress * Math.PI) * state.arc;
      state.actor.x = state.from.x + (state.to.x - state.from.x) * progress;
      state.actor.y = state.from.y + (state.to.y - state.from.y) * progress + arc;
      state.actor.z = state.from.z + (state.to.z - state.from.z) * progress;
      state.actor.angle = state.fromAngle + state.spin * progress;
      state.group.rotation.x = progress * Math.PI * 4.5;
      state.group.rotation.z = Math.sin(progress * Math.PI * 3) * 0.55;
      if (state.local) this.deathFlash = Math.max(this.deathFlash, 0.35 * (1 - progress));
      if (progress < 1) return true;
      state.onFinish?.();
      return false;
    });
  }

  startRunnerImpact({ actor, group, label, to, local = false, blocksWorld = false, duration = 1.05, arc = 9.5, spin = null, onFinish }) {
    if (!actor || !group || this.isRunnerImpacted(actor)) return;
    const type = waveTypeById(label.toLowerCase());
    this.spawnImpactParticles(actor.x, actor.y, actor.z, type.color);
    const state = {
      actor,
      group,
      label,
      local,
      elapsed: 0,
      duration,
      from: { x: actor.x, y: actor.y, z: actor.z },
      to,
      fromAngle: actor.angle,
      spin: spin ?? Math.PI * (actor.x < 0 ? -2.8 : 2.8),
      arc,
      onFinish,
    };
    actor.speed = 0;
    actor.vx = 0;
    actor.vy = 0;
    actor.grounded = false;
    actor.inTrench = false;
    this.impacts.push(state);
    if (local && blocksWorld) this.impactState = state;
  }

  runnerForward(actor) {
    return { x: Math.sin(actor.angle), z: Math.cos(actor.angle) };
  }

  isBehindRunner(source, target) {
    const forward = this.runnerForward(target);
    return ((source.x - target.x) * forward.x + (source.z - target.z) * forward.z) < 0;
  }

  canBumpRunner(source, target) {
    if (!source || !target || source.bumpCooldown > 0 || this.isRunnerImpacted(source) || this.isRunnerImpacted(target)) return false;
    if (Math.hypot(source.x - target.x, source.z - target.z) > RUNNER_BUMP_RADIUS) return false;
    return this.isBehindRunner(source, target);
  }

  forceRunnerJump(target) {
    if (!target || target.grounded === false) return false;
    const groundY = this.surfaceY(target.x, target.z);
    target.inTrench = groundY < 1;
    target.y = Math.max(target.y, groundY);
    target.vy = target.inTrench ? 13.8 : 9.4;
    target.grounded = false;
    return true;
  }

  bumpRunner(source, target) {
    if (!this.canBumpRunner(source, target)) return false;
    if (!this.forceRunnerJump(target)) return false;
    source.bumpCooldown = RUNNER_BUMP_COOLDOWN;
    target.bumpCooldown = Math.max(target.bumpCooldown ?? 0, 0.35);
    target.speed = 0;
    this.playSound("jump");
    return true;
  }

  die(label) {
    if (this.impactState) return;
    this.bestDistance = Math.max(this.bestDistance, this.distance);
    this.callbacks.onStatus?.(`${label} wave smashed you back to start.`);
    this.deathFlash = 1;
    this.playSound("hit");
    this.startRunnerImpact({
      actor: this.player,
      group: this.playerGroup,
      label,
      to: { x: 0, y: 1.55, z: 5 },
      local: true,
      blocksWorld: true,
      onFinish: () => this.finishDeathReset(this.player),
    });
    this.collecting = null;
  }

  finishDeathReset() {
    this.resetRunnerAfterImpact(this.player, this.playerGroup, { x: 0, y: 1.55, z: 5, angle: 0 });
    this.collecting = null;
    this.distance = 0;
    this.impactState = null;
    this.playSound("respawn");
    if (!this.bot) {
      for (const wave of this.waves) {
        this.waveGroup.remove(wave.mesh);
        wave.mesh.geometry.dispose();
        wave.mesh.material.dispose();
      }
      this.waves = [];
      this.nextWaveIn = 2.4;
    }
  }

  dieBot(label) {
    if (!this.bot || this.isRunnerImpacted(this.bot)) return;
    this.callbacks.onStatus?.(`${label} wave smashed ${this.bot.name} back to start.`);
    this.startRunnerImpact({
      actor: this.bot,
      group: this.remoteGroup,
      label,
      to: { x: 3.8, y: 1.55, z: 5 },
      onFinish: () => this.finishBotDeathReset(),
    });
    this.bot.targetX = 3.8;
    this.bot.targetZ = 18;
    this.bot.targetTrophy = null;
    this.bot.targetTrench = null;
    this.bot.collecting = null;
    this.bot.collectValue = 0;
    this.setBotState(BOT_STATES.DEAD_RESET);
    this.updateBotUpgrades();
  }

  resetRunnerAfterImpact(actor, group, pose) {
    actor.x = pose.x;
    actor.y = pose.y;
    actor.z = pose.z;
    actor.vx = 0;
    actor.vy = 0;
    actor.speed = 0;
    actor.angle = pose.angle;
    actor.grounded = true;
    actor.inTrench = this.surfaceY(actor.x, actor.z) < 1;
    group.rotation.x = 0;
    group.rotation.z = 0;
  }

  finishBotDeathReset() {
    if (!this.bot) return;
    this.resetRunnerAfterImpact(this.bot, this.remoteGroup, { x: 3.8, y: 1.55, z: 5, angle: 0 });
    this.bot.targetX = 3.8;
    this.bot.targetZ = 18;
    this.bot.targetTrophy = null;
    this.bot.targetTrench = null;
    this.bot.collecting = null;
    this.bot.collectValue = 0;
    this.setBotState(BOT_STATES.RUNNING);
    this.updateBotUpgrades();
  }

  updateAnimation(dt) {
    if (!this.isRunnerImpacted(this.player)) {
      this.animateCharacter(this.parts, this.player.grounded ? Math.abs(this.player.speed) : 0, 0);
    }
    if (this.remoteGroup?.visible) {
      const remoteSpeed = this.bot?.speed ?? this.remotePose?.speed ?? 0;
      if (!this.bot || !this.isRunnerImpacted(this.bot)) this.animateCharacter(this.remoteParts, Math.abs(remoteSpeed), 0.6);
    }
    for (const trophy of this.trophiesWorld) {
      if (trophy.collected || !trophy.sprite || !trophy.priceSprite) continue;
      const nearPlayer = Math.hypot(trophy.x - this.player.x, trophy.z - this.player.z) < 3.2;
      const nearBot = this.bot && Math.hypot(trophy.x - this.bot.x, trophy.z - this.bot.z) < 3.2;
      const near = nearPlayer || nearBot;
      trophy.priceSprite.visible = near;
      trophy.sprite.position.y = 1.35 + Math.sin(this.time * 3 + trophy.z) * 0.12;
      trophy.priceSprite.position.y = 2.75 + Math.sin(this.time * 3 + trophy.z) * 0.06;
    }
  }

  animateCharacter(parts, run, phase) {
    const swing = Math.sin(this.time * (7 + run * 0.7) + phase) * clamp(run / 8, 0, 1);
    parts.leftArm.rotation.x = swing * 0.9;
    parts.rightArm.rotation.x = -swing * 0.9;
    parts.leftLeg.rotation.x = -swing * 0.95;
    parts.rightLeg.rotation.x = swing * 0.95;
    parts.head.rotation.y = Math.sin(this.time * 2.2 + phase) * 0.08;
  }

  updateCamera(dt) {
    this.playerGroup.position.set(this.player.x, this.player.y, this.player.z);
    this.playerGroup.rotation.y = this.player.angle;
    const behind = new THREE.Vector3(-Math.sin(this.player.angle) * 15, 7.1, -Math.cos(this.player.angle) * 15);
    const target = new THREE.Vector3(this.player.x + behind.x, this.player.y + behind.y, this.player.z + behind.z);
    if (this.impactState) {
      const shake = (1 - clamp(this.impactState.elapsed / this.impactState.duration, 0, 1)) * 0.45;
      target.x += rand(-shake, shake);
      target.y += rand(-shake, shake);
    }
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
    this.rankingEl.textContent = this.rankingEntries()
      .slice(0, 3)
      .map((entry, index) => `${index + 1} ${entry.name} $${Math.floor(entry.score)}`)
      .join(" / ");
    this.player.state = this.collecting
      ? PLAYER_STATES.COLLECTING
      : !this.player.grounded
        ? PLAYER_STATES.JUMPING
        : this.player.inTrench
          ? PLAYER_STATES.IN_TRENCH
          : PLAYER_STATES.RUNNING;
    this.collectEl.hidden = !this.collecting;
    this.collectBar.style.transform = `scaleX(${this.collecting ? clamp(this.collecting.progress, 0, 1) : 0})`;
    this.overlay.style.opacity = String(clamp(this.deathFlash, 0, 0.9));
  }

  loop() {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.deathFlash = Math.max(0, this.deathFlash - dt * 1.8);
    if (this.phase !== "playing") {
      this.updateImpactParticles(dt);
      this.updateCamera(dt);
      this.updateRemoteVisual(dt);
      this.updateHud();
      this.sendNetworkInput();
      this.updateNetworkHost(dt);
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(() => this.loop());
      return;
    }
    this.updateRunnerBumpCooldowns(dt);
    this.processNetworkBumps();
    this.updateInput(dt);
    const wasLocalImpacted = this.isRunnerImpacted(this.player);
    this.updateImpact(dt);
    this.generateChunksAround(this.player.z, this.bot?.z ?? this.player.z);
    this.updateTrophyRespawns();
    if (!wasLocalImpacted && !this.isRunnerImpacted(this.player)) {
      this.updatePhysics(dt);
      this.updateBaseInteraction();
      this.updateCollecting(dt);
      this.updatePlayerBumpAction();
    }
    this.updateBot(dt);
    this.sendNetworkInput();
    this.updateNetworkHost(dt);
    if (!this.impactState) this.updateWaves(dt);
    this.updateRemoteVisual(dt);
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
    window.visualViewport?.removeEventListener("resize", this.onResize);
    this.soundButton.removeEventListener("click", this.onSoundToggle);
    this.playAgainButton.removeEventListener("click", this.onPlayAgain);
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
    this.disposeObject3D(this.scene);
    this.trophiesWorld = [];
    this.trophyStock.clear();
    this.ambience?.oscillator.stop();
    this.audio?.context.close?.();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.root.replaceChildren();
  }
}
