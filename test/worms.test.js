import test from "node:test";
import assert from "node:assert/strict";

import { WormsGame } from "../js/games/worms.js";

function logicGame(mode = "classic") {
  const game = Object.create(WormsGame.prototype);
  game.gameMode = mode;
  game.networkRole = "solo";
  game.state = "playing";
  game.wind = 0;
  game.blocks = [];
  game.crates = [];
  game.particles = [];
  game.terrainEvents = [];
  game.terrain = new Uint8Array(960 * 540);
  game.updateToolbar = () => {};
  return game;
}

test("classic mode creates 100 HP worms and skips defeated worms on a turn", () => {
  const game = logicGame();
  game.playerTeam = [
    game.createWorm(100, "pink", "P1", "player"),
    game.createWorm(200, "pink", "P2", "player"),
  ];
  game.enemyTeam = [game.createWorm(800, "blue", "B1", "enemy")];
  game.playerTeam[0].alive = false;
  game.playerIndex = 0;
  game.enemyIndex = 0;
  game.turnNumber = 1;

  game.beginTurn("player");

  assert.equal(game.player, game.playerTeam[1]);
  assert.equal(game.player.hp, 100);
  assert.equal(game.turnTime, 35);
});

test("team spawns move away from water-level gaps", () => {
  const game = logicGame();
  game.terrain = game.createTerrain("islands");

  const x = game.findSafeSpawn(280);

  assert.ok(game.groundAt(x) < 505);
});

test("explosions damage and throw every nearby living worm away from the blast", () => {
  const game = logicGame();
  game.playerTeam = [game.createWorm(120, "pink", "P1", "player")];
  game.enemyTeam = [game.createWorm(155, "blue", "B1", "enemy")];
  [game.player, game.enemy] = [game.playerTeam[0], game.enemyTeam[0]];
  game.player.y = game.enemy.y = 120;

  game.explode(120, 120, 60, 40);

  assert.ok(game.player.hp < 100);
  assert.ok(game.enemy.hp < 100);
  assert.ok(game.player.vy < 0);
  assert.ok(game.enemy.vx > 0);
  assert.ok(game.enemy.angularVelocity !== 0);
});

test("bot closes the distance when only melee weapons remain", () => {
  const game = logicGame();
  const bot = game.createWorm(120, "blue", "B1", "enemy");
  const target = game.createWorm(720, "pink", "P1", "player");
  for (const id of ["pistol", "rocket", "grenade", "molotov", "bat"]) bot.ammo[id] = 0;
  game.playerTeam = [target];
  game.enemyTeam = [bot];
  game.player = target;
  game.enemy = bot;
  game.groundAt = () => 380;
  game.hasLineOfSight = () => true;

  const plan = game.makeAIPlan(bot);

  assert.equal(plan.weapon, "finger");
  assert.ok(plan.destinationX > bot.x);
});

test("wind accelerates projectiles horizontally", () => {
  const game = logicGame();
  game.wind = 80;
  game.playerTeam = [game.createWorm(100, "pink", "P1", "player")];
  game.enemyTeam = [game.createWorm(900, "blue", "B1", "enemy")];
  [game.player, game.enemy] = [game.playerTeam[0], game.enemyTeam[0]];
  game.player.y = game.enemy.y = 100;
  game.projectiles = [{
    type: "rocket", owner: game.player, x: 300, y: 80, vx: 100, vy: 0, life: 2, radius: 5,
  }];

  game.updateProjectiles(0.1);

  assert.ok(game.projectiles[0].vx > 100);
});

test("classic team scene renders without depending on a single-worm duel", () => {
  const game = logicGame();
  const gradient = { addColorStop() {} };
  game.context = new Proxy({ createLinearGradient: () => gradient }, {
    get(target, property) {
      if (property in target) return target[property];
      return () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  game.playerTeam = [game.createWorm(120, "pink", "P1", "player"), game.createWorm(260, "pink", "P2", "player")];
  game.enemyTeam = [game.createWorm(840, "blue", "B1", "enemy"), game.createWorm(700, "blue", "B2", "enemy")];
  [game.player, game.enemy] = [game.playerTeam[0], game.enemyTeam[0]];
  game.playerTeam.concat(game.enemyTeam).forEach((worm) => { worm.y = 320; });
  game.terrainCanvas = {};
  game.terrainDirty = false;
  game.projectiles = [];
  game.meleeAttacks = [];
  game.firePatches = [];
  game.pointers = new Map();
  game.time = 0;
  game.turnTeam = "player";
  game.turnTime = 30;
  game.turnNumber = 1;
  game.turnResolving = false;
  game.messageTime = 0;

  assert.doesNotThrow(() => game.draw());
});

test("utility tools keep the turn and the third pistol shot ends it", () => {
  const game = logicGame();
  const worm = game.createWorm(120, "pink", "P1", "player");
  game.playerTeam = [worm];
  game.enemyTeam = [game.createWorm(800, "blue", "B1", "enemy")];
  [game.player, game.enemy] = [worm, game.enemyTeam[0]];
  game.player.y = game.enemy.y = 100;
  game.projectiles = [];
  game.meleeAttacks = [];
  game.firePatches = [];
  game.turnTeam = "player";
  game.turnPistolShots = 0;
  game.turnResolving = false;

  game.useWeapon(worm, "dig", 0);
  game.useWeapon(worm, "block", 0);
  game.useWeapon(worm, "rope", -0.5);
  assert.equal(game.turnResolving, false);

  game.useWeapon(worm, "pistol", 0);
  game.useWeapon(worm, "pistol", 0);
  assert.equal(game.turnResolving, false);
  assert.equal(game.turnPistolShots, 2);

  game.useWeapon(worm, "pistol", 0);
  assert.equal(game.turnResolving, true);
  assert.equal(game.turnPistolShots, 3);
});

test("turn resolution cannot hang on a constantly moving body", () => {
  const game = logicGame();
  game.playerTeam = [game.createWorm(120, "pink", "P1", "player")];
  game.enemyTeam = [game.createWorm(800, "blue", "B1", "enemy")];
  [game.player, game.enemy] = [game.playerTeam[0], game.enemyTeam[0]];
  game.playerIndex = 0;
  game.enemyIndex = 0;
  game.turnTeam = "player";
  game.turnNumber = 1;
  game.turnResolving = true;
  game.turnResolveElapsed = 0;
  game.turnSettleTime = 0;
  game.projectiles = [];
  game.meleeAttacks = [];
  game.player.vx = 100;
  game.player.vy = 100;

  game.updateTurnResolution(3.1);

  assert.equal(game.turnTeam, "enemy");
  assert.equal(game.turnResolving, false);
});

test("bat launches hard while finger shoves by about one worm diameter", () => {
  const batGame = logicGame();
  const batter = batGame.createWorm(100, "pink", "P1", "player");
  const batTarget = batGame.createWorm(140, "blue", "B1", "enemy");
  batGame.playerTeam = [batter];
  batGame.enemyTeam = [batTarget];
  [batGame.player, batGame.enemy] = [batter, batTarget];
  batGame.meleeAttacks = [{ owner: batter, angle: 0, age: 0, duration: 0.4, strikeAt: 0, weapon: "bat", struck: false }];

  batGame.updateMeleeAttacks(0.05);
  assert.ok(batTarget.vx >= 750);
  assert.ok(batTarget.vy <= -380);

  const fingerGame = logicGame();
  const fingerer = fingerGame.createWorm(100, "pink", "P1", "player");
  const fingerTarget = fingerGame.createWorm(140, "blue", "B1", "enemy");
  fingerGame.playerTeam = [fingerer];
  fingerGame.enemyTeam = [fingerTarget];
  [fingerGame.player, fingerGame.enemy] = [fingerer, fingerTarget];
  fingerGame.meleeAttacks = [{ owner: fingerer, angle: 0, age: 0, duration: 0.3, strikeAt: 0, weapon: "finger", struck: false }];
  const startX = fingerTarget.x;

  fingerGame.updateMeleeAttacks(0.05);
  assert.ok(fingerTarget.x - startX >= fingerTarget.radius * 1.8);
  assert.ok(fingerTarget.x - startX <= fingerTarget.radius * 2);
});
