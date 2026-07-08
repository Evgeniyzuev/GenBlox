import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);

const PLAYER_STATES = {
  RUNNING: "RUNNING",
  JUMPING: "JUMPING",
  IN_TRENCH: "IN_TRENCH",
  COLLECTING: "COLLECTING",
};

const WAVE_TYPES = [
  { id: "green", color: 0x5cff77, speed: 9, interval: 6.2, label: "GREEN" },
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
    this.collecting = null;
    this.deathFlash = 0;
    this.chunkLength = 34;
    this.trackWidth = 9;
    this.chunks = new Map();
    this.trenches = [];
    this.trophiesWorld = [];
    this.waves = [];
    this.nextWaveIn = 2.8;
    this.lastInputMove = 0;
    this.player = {
      x: 0,
      y: 1.55,
      z: 5,
      vx: 0,
      vy: 0,
      speed: 0,
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
      <div><small>TROPHIES</small><strong data-wave-trophies>0</strong></div>
      <div><small>STATE</small><strong data-wave-state>RUNNING</strong></div>
      <div class="wave-collect" data-wave-collect hidden><span></span></div>
      <div class="wave-controls">WASD / Arrows move, Space jumps, E harvests, S drops into trenches</div>
    `;
    this.overlay = document.createElement("div");
    this.overlay.className = "wave-reset";
    this.root.append(this.canvasHost, this.hud, this.overlay);
    this.distanceEl = this.hud.querySelector("[data-wave-distance]");
    this.trophiesEl = this.hud.querySelector("[data-wave-trophies]");
    this.stateEl = this.hud.querySelector("[data-wave-state]");
    this.collectEl = this.hud.querySelector("[data-wave-collect]");
    this.collectBar = this.collectEl.querySelector("span");
  }

  buildScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc7e8);
    this.scene.fog = new THREE.Fog(0x8fc7e8, 38, 135);

    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 240);
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
      playerBody: new THREE.MeshStandardMaterial({ color: 0x4aa7ff, roughness: 0.65 }),
      playerSkin: new THREE.MeshStandardMaterial({ color: 0xf0c18f, roughness: 0.7 }),
      playerHair: new THREE.MeshStandardMaterial({ color: 0x2b1f27, roughness: 0.75 }),
      trophy: new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0x806000, emissiveIntensity: 0.45, roughness: 0.35 }),
    };

    const ground = new THREE.Mesh(new THREE.BoxGeometry(38, 0.3, 520), this.materials.grass);
    ground.position.set(0, -0.35, 125);
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);
    this.waveGroup = new THREE.Group();
    this.scene.add(this.waveGroup);
    this.trophyGroup = new THREE.Group();
    this.scene.add(this.trophyGroup);
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

  bindEvents() {
    this.onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
      if (event.code === "Space" && this.player.grounded) this.jump();
    };
    this.onKeyUp = (event) => this.keys.delete(event.key.toLowerCase());
    this.onResize = () => this.resize();
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
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
    this.player.vy = this.player.inTrench ? 8.8 : 9.4;
    this.player.grounded = false;
    this.player.state = PLAYER_STATES.JUMPING;
    this.cancelCollect();
  }

  generateChunksAround(z) {
    const current = Math.floor(z / this.chunkLength);
    for (let index = current - 2; index <= current + 9; index += 1) {
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
        this.trophyGroup.remove(trophy.mesh);
        trophy.mesh.geometry.dispose();
        return false;
      }
      return true;
    });
  }

  createChunk(index) {
    const group = new THREE.Group();
    group.position.z = index * this.chunkLength;
    const difficulty = clamp(index / 28, 0, 1);
    const hasTrench = index > 0 && Math.random() < 0.58 + difficulty * 0.22;
    const trench = hasTrench
      ? {
        chunk: index,
        z0: index * this.chunkLength + rand(7, 14),
        z1: index * this.chunkLength + rand(19, 27),
        width: rand(7, 9),
      }
      : null;
    if (trench) {
      if (trench.z1 - trench.z0 < 7) trench.z1 = trench.z0 + 7;
      this.trenches.push(trench);
    }

    const addRoad = (centerZ, length) => {
      if (length <= 0.4) return;
      const road = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth, 0.45, length), this.materials.road);
      road.position.set(0, 0, centerZ - index * this.chunkLength);
      road.receiveShadow = true;
      group.add(road);
    };
    const chunkStart = index * this.chunkLength;
    const chunkEnd = chunkStart + this.chunkLength;
    if (trench) {
      addRoad((chunkStart + trench.z0) / 2, trench.z0 - chunkStart);
      addRoad((trench.z1 + chunkEnd) / 2, chunkEnd - trench.z1);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(trench.width, 0.35, trench.z1 - trench.z0), this.materials.trench);
      floor.position.set(0, -1.8, (trench.z0 + trench.z1) / 2 - chunkStart);
      floor.receiveShadow = true;
      group.add(floor);
      [-1, 1].forEach((side) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, trench.z1 - trench.z0), this.materials.trench);
        wall.position.set(side * trench.width / 2, -0.75, (trench.z0 + trench.z1) / 2 - chunkStart);
        wall.receiveShadow = true;
        group.add(wall);
      });
    } else {
      addRoad(chunkStart + this.chunkLength / 2, this.chunkLength);
    }

    if (index > 1 && Math.random() < 0.45) this.spawnTrophy(index, trench);
    this.trackGroup.add(group);
    this.chunks.set(index, group);
  }

  spawnTrophy(index, trench) {
    const chunkStart = index * this.chunkLength;
    let z = chunkStart + rand(5, this.chunkLength - 5);
    if (trench && z > trench.z0 - 2 && z < trench.z1 + 2) {
      z = Math.random() < 0.5 ? trench.z0 - 3 : trench.z1 + 3;
    }
    const value = 10 + Math.floor(index * 1.7);
    const geometry = new THREE.OctahedronGeometry(0.45, 0);
    const mesh = new THREE.Mesh(geometry, this.materials.trophy);
    mesh.position.set(rand(-3.2, 3.2), 1.1, z);
    mesh.castShadow = true;
    this.trophyGroup.add(mesh);
    this.trophiesWorld.push({ mesh, x: mesh.position.x, z, value, progress: 0, collected: false });
  }

  currentTrench(z) {
    return this.trenches.find((trench) => z >= trench.z0 && z <= trench.z1 && Math.abs(this.player.x) <= trench.width / 2) ?? null;
  }

  surfaceY(z) {
    return this.currentTrench(z) ? 0.15 : 1.55;
  }

  spawnWave() {
    const difficulty = clamp(this.distance / 650, 0, 1);
    const roll = Math.random();
    const type = roll < 0.42 - difficulty * 0.12 ? WAVE_TYPES[0] : roll < 0.82 - difficulty * 0.08 ? WAVE_TYPES[1] : WAVE_TYPES[2];
    const geometry = new THREE.BoxGeometry(19, 2.2, 0.65);
    const material = new THREE.MeshStandardMaterial({
      color: type.color,
      emissive: type.color,
      emissiveIntensity: type.id === "red" ? 0.75 : 0.35,
      transparent: true,
      opacity: 0.72,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 1.35, this.player.z + 82);
    mesh.castShadow = true;
    this.waveGroup.add(mesh);
    this.waves.push({ mesh, type, speed: type.speed + difficulty * 8, box: new THREE.Box3() });
    this.nextWaveIn = Math.max(1.25, type.interval - difficulty * 1.7 + rand(-0.55, 0.55));
  }

  updateInput(dt) {
    const left = this.keys.has("a") || this.keys.has("arrowleft");
    const right = this.keys.has("d") || this.keys.has("arrowright");
    const forward = this.keys.has("w") || this.keys.has("arrowup");
    const back = this.keys.has("s") || this.keys.has("arrowdown");
    const harvest = this.keys.has("e");
    const moveX = (right ? 1 : 0) - (left ? 1 : 0);
    const targetSpeed = forward ? 8.2 : back ? -2.5 : 0;
    this.player.speed += (targetSpeed - this.player.speed) * (1 - Math.exp(-7 * dt));
    this.player.x = clamp(this.player.x + moveX * 8 * dt, -4.1, 4.1);
    this.player.z = Math.max(0, this.player.z + this.player.speed * dt);
    this.lastInputMove = Math.abs(moveX) + Math.abs(this.player.speed);
    if (!harvest || this.lastInputMove > 0.4 || !this.player.grounded || this.player.inTrench) this.cancelCollect();
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
    if (this.player.inTrench && this.keys.has("s")) this.player.y = Math.min(this.player.y, 0.15);
  }

  updateCollecting(dt) {
    if (this.collecting?.collected) this.collecting = null;
    const harvest = this.keys.has("e");
    if (!harvest || !this.player.grounded || this.player.inTrench || this.lastInputMove > 0.4) return;
    const trophy = this.collecting ?? this.trophiesWorld.find((item) => Math.hypot(item.x - this.player.x, item.z - this.player.z) < 1.45);
    if (!trophy) return;
    this.collecting = trophy;
    trophy.progress += dt / 1.5;
    if (trophy.progress >= 1) {
      trophy.collected = true;
      this.trophies += 1;
      this.lootValue += trophy.value;
      this.trophyGroup.remove(trophy.mesh);
      this.callbacks.onStatus?.(`Trophy claimed: +${trophy.value}. Total value ${this.lootValue}.`);
      this.collecting = null;
    }
  }

  cancelCollect() {
    if (!this.collecting) return;
    this.collecting.progress = Math.max(0, this.collecting.progress - 0.02);
    this.collecting = null;
  }

  updateWaves(dt) {
    this.nextWaveIn -= dt;
    if (this.nextWaveIn <= 0) this.spawnWave();
    const playerBox = this.player.box.setFromObject(this.playerGroup);
    for (const wave of this.waves) {
      wave.mesh.position.z -= wave.speed * dt;
      wave.mesh.scale.y = 1 + Math.sin(this.time * 12 + wave.mesh.position.z) * 0.06;
      wave.box.setFromObject(wave.mesh);
      if (wave.box.intersectsBox(playerBox)) {
        if (this.player.inTrench && this.player.y < 0.8) {
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
      trophy.mesh.rotation.y += dt * 2.4;
      trophy.mesh.position.y = 1.1 + Math.sin(this.time * 3 + trophy.z) * 0.12;
    }
  }

  updateCamera(dt) {
    this.playerGroup.position.set(this.player.x, this.player.y, this.player.z);
    const target = new THREE.Vector3(this.player.x * 0.35, this.player.y + 5.8, this.player.z - 12);
    this.camera.position.lerp(target, 1 - Math.exp(-5 * dt));
    this.camera.lookAt(this.player.x * 0.22, this.player.y + 1.15, this.player.z + 10);
  }

  updateHud() {
    this.distance = Math.max(this.distance, Math.floor(this.player.z));
    this.distanceEl.textContent = `${Math.floor(this.distance)} m`;
    this.trophiesEl.textContent = `${this.trophies} / ${this.lootValue}`;
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
    this.root.classList.remove("is-active");
    this.renderer?.dispose();
    this.root.replaceChildren();
  }
}
