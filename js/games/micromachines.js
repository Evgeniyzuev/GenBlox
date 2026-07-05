// microMachines.js
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const randomRange = (min, max) => Math.random() * (max - min) + min;

const CARS = [
  { id: "red", color: "#ff668c", label: "Красный" },
  { id: "blue", color: "#63dcff", label: "Синий" },
  { id: "green", color: "#7bed7b", label: "Зелёный" },
  { id: "yellow", color: "#ffd93d", label: "Жёлтый" },
];

const TRACKS = [
  { 
    id: "oval", 
    title: "Овал", 
    subtitle: "Классический скоростной трек",
    difficulty: "★☆☆",
    checkpoints: 4
  },
  { 
    id: "twisty", 
    title: "Петля", 
    subtitle: "Извилистая трасса с крутыми поворотами",
    difficulty: "★★☆",
    checkpoints: 6
  },
  { 
    id: "figure8", 
    title: "Восьмёрка", 
    subtitle: "Перекрёстное движение — осторожно!",
    difficulty: "★★★",
    checkpoints: 8
  },
];

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export class MicroMachinesGame {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "worms-canvas";
    this.canvas.width = 960;
    this.canvas.height = 540;
    this.canvas.setAttribute("aria-label", "Игра Micro Machines");
    this.canvas.setAttribute("role", "application");
    this.context = this.canvas.getContext("2d");
    
    this.toolbar = document.createElement("div");
    this.toolbar.className = "worms-toolbar";
    
    this.mapChoice = document.createElement("div");
    this.mapChoice.className = "worms-map-choice";
    
    this.root.replaceChildren(this.canvas, this.toolbar, this.mapChoice);
    this.root.classList.add("is-active");
    
    this.keys = new Set();
    this.running = true;
    this.state = "maps";
    this.lastTime = performance.now();
    this.selectedCar = "red";
    
    this.bindEvents();
    this.buildMapChoice();
    this.buildToolbar();
    this.toolbar.hidden = true;
    this.frame = requestAnimationFrame((time) => this.loop(time));
  }

  buildMapChoice() {
    const heading = document.createElement("div");
    heading.className = "worms-map-heading";
    heading.innerHTML = "<small>ВЫБЕРИ ТРАССУ</small><strong>Гонка на выживание</strong>";
    this.mapChoice.append(heading);
    
    TRACKS.forEach((track) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "worms-map-button";
      const colors = this.getTrackColors(track.id);
      button.style.setProperty("--map-a", colors[0]);
      button.style.setProperty("--map-b", colors[1]);
      button.innerHTML = `<span></span><strong>${track.title}</strong><small>${track.subtitle}</small><i>${track.difficulty}</i>`;
      button.addEventListener("click", () => this.start(track.id));
      this.mapChoice.append(button);
    });
  }

  getTrackColors(trackId) {
    const colors = {
      oval: ["#ff668c", "#63dcff"],
      twisty: ["#7bed7b", "#ffd93d"],
      figure8: ["#ff8a5c", "#a29bfe"],
    };
    return colors[trackId] || ["#ff668c", "#63dcff"];
  }

  buildToolbar() {
    CARS.forEach((car) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.car = car.id;
      button.title = car.label;
      button.innerHTML = `<b style="color:${car.color}">●</b><span>${car.label}</span>`;
      button.addEventListener("click", () => this.selectCar(car.id));
      this.toolbar.append(button);
    });
  }

  bindEvents() {
    this.onKeyDown = (event) => {
      this.keys.add(event.key.toLowerCase());
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };
    this.onKeyUp = (event) => {
      this.keys.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);

    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  start(trackId) {
    this.state = "playing";
    this.trackId = trackId;
    this.mapChoice.hidden = true;
    this.toolbar.hidden = false;
    this.time = 0;
    this.lap = 0;
    this.maxLaps = 3;
    this.finished = false;
    this.winner = null;
    this.particles = [];
    this.crashes = [];
    this.trail = [];
    
    this.track = this.generateTrack(trackId);
    this.checkpoints = this.generateCheckpoints(trackId);
    this.player = this.createCar(200, 300, this.selectedCar, "Ты");
    this.enemy = this.createCar(200, 350, "blue", "Соперник");
    this.enemy2 = this.createCar(200, 400, "green", "Бот #2");
    
    // Размещаем машины на старте
    const startX = this.track[0]?.x || 200;
    const startY = (this.track[0]?.y || 300) - 50;
    this.player.x = startX;
    this.player.y = startY - 20;
    this.enemy.x = startX;
    this.enemy.y = startY + 20;
    this.enemy2.x = startX;
    this.enemy2.y = startY + 60;
    
    this.player.angle = 0;
    this.enemy.angle = 0;
    this.enemy2.angle = 0;
    
    this.players = [this.player, this.enemy, this.enemy2];
    this.updateToolbar();
    this.callbacks.onStatus?.("3 круга · первым финишируй!");
    
    // Стартовый отсчёт
    this.countdown = 3;
    this.countdownTimer = 0;
    this.message = "3";
    this.messageTime = 1;
  }

  createCar(x, y, carId, name) {
    const car = CARS.find(c => c.id === carId) || CARS[0];
    return {
      x, y,
      vx: 0, vy: 0,
      angle: 0,
      speed: 0,
      maxSpeed: 200 + Math.random() * 30,
      acceleration: 500,
      friction: 0.98,
      turnSpeed: 3.5,
      radius: 14,
      color: car.color,
      name: name,
      carId: carId,
      lap: 0,
      checkpoint: 0,
      finished: false,
      position: 0,
      crashing: 0,
      boost: 0,
      trailTimer: 0,
    };
  }

  generateTrack(trackId) {
    const points = [];
    const segments = trackId === "oval" ? 60 : trackId === "twisty" ? 80 : 100;
    const radius = trackId === "oval" ? 180 : trackId === "twisty" ? 160 : 140;
    const centerX = 480;
    const centerY = 270;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * TAU;
      let r = radius;
      
      if (trackId === "oval") {
        r = radius + Math.sin(angle * 2) * 40;
      } else if (trackId === "twisty") {
        r = radius + Math.sin(angle * 3) * 50 + Math.cos(angle * 2) * 30;
      } else if (trackId === "figure8") {
        r = radius + Math.sin(angle * 2) * 60;
        // Восьмёрка - перекрёсток
        const crossX = Math.cos(angle) * r;
        const crossY = Math.sin(angle * 2) * 40;
        points.push({
          x: centerX + crossX,
          y: centerY + crossY,
          angle: Math.atan2(crossY, crossX),
        });
        continue;
      }
      
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      const nextAngle = Math.atan2(
        Math.sin(angle + 0.02) * r - Math.sin(angle) * r,
        Math.cos(angle + 0.02) * r - Math.cos(angle) * r
      );
      points.push({ x, y, angle: nextAngle });
    }
    return points;
  }

  generateCheckpoints(trackId) {
    const count = TRACKS.find(t => t.id === trackId)?.checkpoints || 4;
    const checkpoints = [];
    const step = Math.floor(this.track.length / count);
    for (let i = 0; i < count; i++) {
      const idx = (i * step) % this.track.length;
      checkpoints.push({
        x: this.track[idx].x,
        y: this.track[idx].y,
        radius: 40,
        index: i,
        passed: false,
      });
    }
    return checkpoints;
  }

  selectCar(id) {
    if (this.state !== "playing") return;
    this.selectedCar = id;
    this.updateToolbar();
  }

  updateToolbar() {
    [...this.toolbar.children].forEach((button) => {
      const carId = button.dataset.car;
      button.classList.toggle("is-selected", carId === this.selectedCar);
    });
  }

  getTrackPosition(car) {
    let closest = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < this.track.length; i++) {
      const d = distance(car, this.track[i]);
      if (d < closest) {
        closest = d;
        closestIdx = i;
      }
    }
    return closestIdx / this.track.length;
  }

  updateCar(car, dt, input = { forward: 0, turn: 0 }) {
    if (car.crashing > 0) {
      car.crashing -= dt;
      car.vx *= 0.9;
      car.vy *= 0.9;
      return;
    }

    // Управление
    const forward = input.forward || 0;
    const turn = input.turn || 0;
    
    // Поворот
    if (Math.abs(car.speed) > 5) {
      car.angle += turn * this.turnSpeed * dt * (car.speed / car.maxSpeed);
    }
    
    // Ускорение/торможение
    if (forward > 0) {
      car.speed = Math.min(car.speed + forward * car.acceleration * dt, car.maxSpeed);
    } else if (forward < 0) {
      car.speed = Math.max(car.speed + forward * car.acceleration * dt, -car.maxSpeed * 0.3);
    } else {
      car.speed *= Math.pow(0.98, dt * 60);
      if (Math.abs(car.speed) < 1) car.speed = 0;
    }
    
    // Движение
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    
    // Трасса — прилипание к дороге
    this.followTrack(car, dt);
    
    // Границы
    car.x = clamp(car.x, 20, 940);
    car.y = clamp(car.y, 20, 520);
    
    // Проверка чекпоинтов
    this.checkCheckpoints(car);
    
    // Следы
    car.trailTimer += dt;
    if (car.trailTimer > 0.1 && Math.abs(car.speed) > 20) {
      car.trailTimer = 0;
      this.trail.push({
        x: car.x,
        y: car.y,
        color: car.color,
        life: 1.5,
        size: 3 + Math.abs(car.speed) / 80,
      });
    }
    
    // Столкновения с другими машинами
    for (const other of this.players) {
      if (other === car || other.crashing > 0) continue;
      const d = distance(car, other);
      const minDist = car.radius + other.radius;
      if (d < minDist && d > 0) {
        const angle = Math.atan2(other.y - car.y, other.x - car.x);
        const overlap = minDist - d;
        const pushX = Math.cos(angle) * overlap * 0.5;
        const pushY = Math.sin(angle) * overlap * 0.5;
        car.x -= pushX;
        car.y -= pushY;
        other.x += pushX;
        other.y += pushY;
        
        // Отскок
        const impact = Math.abs(car.speed - other.speed);
        if (impact > 50) {
          car.crashing = 0.3;
          other.crashing = 0.3;
          this.spawnParticles(car.x, car.y, car.color, 10);
          this.spawnParticles(other.x, other.y, other.color, 10);
          car.speed *= -0.3;
          other.speed *= -0.3;
        }
      }
    }
  }

  followTrack(car, dt) {
    // Находим ближайшую точку на трассе
    let closest = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < this.track.length; i++) {
      const d = distance(car, this.track[i]);
      if (d < closest) {
        closest = d;
        closestIdx = i;
      }
    }
    
    // Если машина слишком далеко от трассы — притягиваем обратно
    if (closest > 60) {
      const target = this.track[closestIdx];
      const angle = Math.atan2(target.y - car.y, target.x - car.x);
      const force = 200 * dt;
      car.x += Math.cos(angle) * force;
      car.y += Math.sin(angle) * force;
      car.speed *= 0.95;
    }
  }

  checkCheckpoints(car) {
    for (const cp of this.checkpoints) {
      if (distance(car, cp) < cp.radius + car.radius) {
        const nextCp = (car.checkpoint + 1) % this.checkpoints.length;
        if (cp.index === nextCp || (cp.index === 0 && car.checkpoint === this.checkpoints.length - 1)) {
          car.checkpoint = cp.index;
          if (cp.index === 0 && car.lap < this.maxLaps) {
            car.lap++;
            if (car.lap >= this.maxLaps && !car.finished) {
              car.finished = true;
              this.finishRace(car);
            }
          }
          this.spawnParticles(cp.x, cp.y, "#ffd93d", 8);
        }
      }
    }
  }

  finishRace(car) {
    if (this.finished) return;
    this.finished = true;
    this.winner = car;
    this.message = `${car.name} ПОБЕДИЛ!`;
    this.messageTime = 999;
    this.state = "finished";
    this.callbacks.onStatus?.(`${car.name} победил в гонке!`);
    
    setTimeout(() => {
      const restart = document.createElement("button");
      restart.type = "button";
      restart.className = "worms-restart";
      restart.textContent = "Выбрать новую трассу";
      restart.addEventListener("click", () => {
        restart.remove();
        this.state = "maps";
        this.mapChoice.hidden = false;
        this.toolbar.hidden = true;
        this.callbacks.onStatus?.("Выбери трассу для гонки");
      });
      this.root.append(restart);
    }, 2000);
  }

  spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = 50 + Math.random() * 150;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        color: color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  updateAI(dt) {
    // Простой AI — следует за трассой
    for (const car of [this.enemy, this.enemy2]) {
      if (car.finished) continue;
      
      // Находим следующую точку на трассе
      let targetIdx = Math.floor(this.getTrackPosition(car) * this.track.length);
      targetIdx = (targetIdx + 5) % this.track.length;
      const target = this.track[targetIdx];
      
      const dx = target.x - car.x;
      const dy = target.y - car.y;
      const targetAngle = Math.atan2(dy, dx);
      
      // Вычисляем разницу углов
      let angleDiff = targetAngle - car.angle;
      while (angleDiff > Math.PI) angleDiff -= TAU;
      while (angleDiff < -Math.PI) angleDiff += TAU;
      
      // Управление
      const turn = clamp(angleDiff * 2, -1, 1);
      const forward = 0.8 + Math.random() * 0.2;
      
      this.updateCar(car, dt, { forward, turn });
    }
  }

  updatePlayer(dt) {
    let forward = 0;
    let turn = 0;
    
    if (this.keys.has("w") || this.keys.has("arrowup")) forward = 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) forward = -1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) turn = -1;
    if (this.keys.has("d") || this.keys.has("arrowright")) turn = 1;
    
    this.updateCar(this.player, dt, { forward, turn });
  }

  updateParticles(dt) {
    this.particles = this.particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      return p.life > 0;
    });
    
    this.trail = this.trail.filter(t => {
      t.life -= dt;
      return t.life > 0;
    });
  }

  update(dt) {
    if (this.state !== "playing") return;
    this.time += dt;
    
    // Обработка ввода
    this.updatePlayer(dt);
    this.updateAI(dt);
    this.updateParticles(dt);
  }

  drawTrack() {
    const ctx = this.context;
    
    // Фон
    const gradient = ctx.createRadialGradient(480, 270, 50, 480, 270, 400);
    gradient.addColorStop(0, "#2d4059");
    gradient.addColorStop(1, "#1a1a2e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 960, 540);
    
    // Трасса
    ctx.shadowColor = "rgba(255,255,255,0.05)";
    ctx.shadowBlur = 20;
    
    // Дорожка
    ctx.strokeStyle = "#3d3d5c";
    ctx.lineWidth = 80;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < this.track.length; i++) {
      if (i === 0) ctx.moveTo(this.track[i].x, this.track[i].y);
      else ctx.lineTo(this.track[i].x, this.track[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    
    // Асфальт
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#2a2a44";
    ctx.lineWidth = 60;
    ctx.beginPath();
    for (let i = 0; i < this.track.length; i++) {
      if (i === 0) ctx.moveTo(this.track[i].x, this.track[i].y);
      else ctx.lineTo(this.track[i].x, this.track[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    
    // Разметка
    ctx.setLineDash([15, 20]);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < this.track.length; i++) {
      if (i === 0) ctx.moveTo(this.track[i].x, this.track[i].y);
      else ctx.lineTo(this.track[i].x, this.track[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Чекпоинты
    for (const cp of this.checkpoints) {
      ctx.strokeStyle = "rgba(255,217,61,0.3)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 10]);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, cp.radius, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = "rgba(255,217,61,0.1)";
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, cp.radius - 5, 0, TAU);
      ctx.fill();
    }
    
    ctx.shadowBlur = 0;
  }

  drawCar(car) {
    const ctx = this.context;
    if (car.crashing > 0 && Math.floor(car.crashing * 20) % 2) return;
    
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    
    // Тень
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(2, 12, 18, 6, 0, 0, TAU);
    ctx.fill();
    
    // Кузов
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 10;
    
    const w = 28;
    const h = 16;
    
    // Основной корпус
    ctx.fillStyle = car.color;
    roundedRect(ctx, -w/2, -h/2, w, h, 4);
    ctx.fill();
    
    // Капот
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundedRect(ctx, -w/2 + 8, -h/2 + 2, 12, h - 4, 3);
    ctx.fill();
    
    // Окна
    ctx.fillStyle = "rgba(100,200,255,0.3)";
    roundedRect(ctx, -w/2 + 2, -h/2 + 2, 6, h - 4, 2);
    ctx.fill();
    roundedRect(ctx, w/2 - 8, -h/2 + 2, 6, h - 4, 2);
    ctx.fill();
    
    // Фары
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.arc(w/2 - 2, -h/2 + 3, 2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w/2 - 2, h/2 - 3, 2, 0, TAU);
    ctx.fill();
    
    // Задние фонари
    ctx.fillStyle = "#ff4757";
    ctx.beginPath();
    ctx.arc(-w/2 + 2, -h/2 + 3, 2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-w/2 + 2, h/2 - 3, 2, 0, TAU);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    
    // Имя
    ctx.rotate(-car.angle);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "800 10px Rubik, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(car.name, 0, -26);
    
    // Счётчик кругов
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "700 9px Rubik, sans-serif";
    ctx.fillText(`Круг ${car.lap}/${this.maxLaps}`, 0, -14);
    
    ctx.restore();
  }

  drawHud() {
    const ctx = this.context;
    
    // Время
    ctx.fillStyle = "rgba(21,20,37,0.75)";
    roundedRect(ctx, 430, 12, 100, 34, 12);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "800 16px Rubik, sans-serif";
    ctx.textAlign = "center";
    const minutes = Math.floor(this.time / 60);
    const seconds = Math.floor(this.time % 60);
    ctx.fillText(`${minutes}:${String(seconds).padStart(2, "0")}`, 480, 36);
    
    // Позиции
    const sorted = [...this.players].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.lap !== b.lap) return b.lap - a.lap;
      return this.getTrackPosition(a) - this.getTrackPosition(b);
    });
    
    const positions = ["🥇", "🥈", "🥉"];
    sorted.forEach((car, idx) => {
      if (idx >= positions.length) return;
      ctx.fillStyle = "rgba(21,20,37,0.7)";
      roundedRect(ctx, 12, 12 + idx * 38, 160, 32, 10);
      ctx.fill();
      
      ctx.fillStyle = car.color;
      ctx.font = "700 12px Rubik, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${positions[idx]} ${car.name}`, 22, 34 + idx * 38);
      
      if (car.finished) {
        ctx.fillStyle = "#7bed7b";
        ctx.fillText("✓", 140, 34 + idx * 38);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "700 10px Rubik, sans-serif";
        ctx.fillText(`круг ${car.lap}/${this.maxLaps}`, 140, 34 + idx * 38);
      }
    });
  }

  drawParticles() {
    const ctx = this.context;
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    for (const t of this.trail) {
      ctx.globalAlpha = t.life / 1.5 * 0.3;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.size * (t.life / 1.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  draw() {
    if (this.state === "maps") return;
    const ctx = this.context;
    
    this.drawTrack();
    
    // Следы
    this.drawParticles();
    
    // Машины
    for (const car of this.players) {
      this.drawCar(car);
    }
    
    this.drawHud();
    
    // Сообщение
    if (this.messageTime > 0) {
      ctx.fillStyle = "rgba(21,20,37,0.75)";
      roundedRect(ctx, 335, 220, 290, 82, 20);
      ctx.fill();
      ctx.fillStyle = this.message.includes("ПОБЕДИЛ") ? "#ffd93d" : "#7bed7b";
      ctx.textAlign = "center";
      ctx.font = "900 38px Rubik, sans-serif";
      ctx.fillText(this.message, 480, 272);
      this.messageTime -= 0.016;
    }
    
    // Управление
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "700 11px Rubik, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("W/↑ - газ  |  S/↓ - тормоз  |  A/← - влево  |  D/→ - вправо", 480, 530);
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