import { Bot } from "./bot.js";
import { EjectedMass } from "./ejected.js";
import { Food } from "./food.js";
import { Player } from "./player.js";
import { SpatialGrid } from "./spatial.js";
import { Virus } from "./virus.js";
import {
  START_MASS,
  VIRUS_TRIGGER_MASS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  canEat,
  clamp,
  distanceSquared,
  randomColor,
  randomRange
} from "./physics.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });

const startScreen = document.querySelector("#start-screen");
const deathScreen = document.querySelector("#death-screen");
const startForm = document.querySelector("#start-form");
const playerNameInput = document.querySelector("#player-name");
const respawnButton = document.querySelector("#respawn-button");
const splitButton = document.querySelector("#split-button");
const feedButton = document.querySelector("#feed-button");
const finalMass = document.querySelector("#final-mass");
const hud = document.querySelector("#hud");
const massValue = document.querySelector("#mass-value");
const rankValue = document.querySelector("#rank-value");
const cellValue = document.querySelector("#cell-value");
const leaderboard = document.querySelector("#leaderboard");

const BOT_NAMES = [
  "Byte", "Mochi", "Nova", "Pixel", "Orbit", "Boba", "Mango", "Noodle", "Pico",
  "Ziggy", "Luma", "Taro", "Kiwi", "Echo", "Pebble", "Miso", "Toast", "Comet",
  "Yuzu", "Kumo", "Sora", "Bean", "Puff", "Ringo", "Koda", "Mika"
];

const FOOD_COUNT = 8000;
const BOT_COUNT = 200;
const VIRUS_COUNT = 40;
const MAX_EJECTED = 240;
const FOOD_GRID_SIZE = 320;
const BOT_FOOD_SCAN_RADIUS = 760;

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = Math.min(2, window.devicePixelRatio || 1);
let running = false;
let lastTime = performance.now();
let zoom = 1;
let leaderboardClock = 0;

const pointer = { x: width / 2, y: height / 2 };
const food = Array.from({ length: FOOD_COUNT }, () => new Food());
const foodGrid = new SpatialGrid(FOOD_GRID_SIZE);
const bots = [];
const viruses = [];
const ejectedMasses = [];
const player = new Player({ name: "Blob", isHuman: true, color: "#9cff57" });

foodGrid.rebuild(food);

function createBots() {
  bots.length = 0;
  for (let i = 0; i < BOT_COUNT; i += 1) {
    const baseName = BOT_NAMES[i % BOT_NAMES.length];
    const cycle = Math.floor(i / BOT_NAMES.length);
    bots.push(new Bot({
      name: cycle ? `${baseName} ${cycle + 1}` : baseName,
      mass: randomRange(30, 120),
      color: randomColor()
    }));
  }
}

function createViruses() {
  viruses.length = 0;
  for (let i = 0; i < VIRUS_COUNT; i += 1) viruses.push(new Virus());
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function resetArena() {
  for (const pellet of food) pellet.reset();
  foodGrid.rebuild(food);
  ejectedMasses.length = 0;
  createBots();
  createViruses();

  const name = (playerNameInput.value || "Blob").trim().slice(0, 18) || "Blob";
  player.reset({ name, mass: START_MASS, color: "#9cff57" });
  zoom = 1;
  pointer.x = width / 2;
  pointer.y = height / 2;
  updateHud();
}

function startGame() {
  resetArena();
  running = true;
  lastTime = performance.now();
  startScreen.hidden = true;
  deathScreen.hidden = true;
  hud.hidden = false;
  localStorage.setItem("blob-arena-name", player.name);
}

function endGame() {
  if (!running) return;
  running = false;
  finalMass.textContent = Math.round(player.totalMass).toLocaleString();
  deathScreen.hidden = false;
}

function respawnBot(bot) {
  bot.reset({
    name: bot.name,
    mass: randomRange(28, 110),
    color: randomColor()
  });
  bot.splitCooldownUntil = performance.now() + 1200;
}

function getActors() {
  return [player, ...bots];
}

function playerTargetVector() {
  return { x: pointer.x - width / 2, y: pointer.y - height / 2 };
}

function splitPlayer() {
  if (!running) return;
  const target = playerTargetVector();
  player.split(target.x, target.y, performance.now());
}

function feedPlayer() {
  if (!running) return;
  const target = playerTargetVector();
  const emitted = player.eject(target.x, target.y, performance.now());
  for (const data of emitted) ejectedMasses.push(new EjectedMass(data));
  if (ejectedMasses.length > MAX_EJECTED) ejectedMasses.splice(0, ejectedMasses.length - MAX_EJECTED);
}

function consumeFood(actor) {
  for (const cell of actor.cells) {
    const reach = cell.radius + 7;
    const reach2 = reach * reach;
    const nearbyFood = foodGrid.queryCircle(cell.x, cell.y, reach);

    for (const pellet of nearbyFood) {
      if (distanceSquared(cell, pellet) <= reach2) {
        const oldX = pellet.x;
        const oldY = pellet.y;
        cell.grow(pellet.value);
        pellet.reset();
        foodGrid.relocate(pellet, oldX, oldY);
      }
    }
  }
}

function updateEjected(deltaMs, now) {
  for (const mass of ejectedMasses) mass.update(deltaMs);

  for (let i = ejectedMasses.length - 1; i >= 0; i -= 1) {
    const mass = ejectedMasses[i];
    let consumed = false;

    for (const virus of viruses) {
      const reach = virus.radius + mass.radius * 0.65;
      if (distanceSquared(virus, mass) <= reach * reach) {
        const spawned = virus.feed(mass);
        ejectedMasses.splice(i, 1);
        if (spawned && viruses.length < 42) viruses.push(spawned);
        consumed = true;
        break;
      }
    }

    if (consumed) continue;

    for (const actor of getActors()) {
      if (!actor.alive) continue;
      if (actor.id === mass.ownerId && now - mass.bornAt < 650) continue;

      for (const cell of actor.cells) {
        const capture = Math.max(5, cell.radius - mass.radius * 0.15);
        if (distanceSquared(cell, mass) <= capture * capture) {
          cell.grow(mass.mass * 0.9);
          ejectedMasses.splice(i, 1);
          consumed = true;
          break;
        }
      }

      if (consumed) break;
    }
  }
}

function resolveVirusCollisions(now) {
  for (const virus of viruses) {
    let triggered = false;

    for (const actor of getActors()) {
      if (!actor.alive) continue;

      for (const cell of [...actor.cells]) {
        if (cell.mass < VIRUS_TRIGGER_MASS) continue;
        const capture = Math.max(8, cell.radius - virus.radius * 0.18);

        if (distanceSquared(cell, virus) <= capture * capture) {
          actor.explodeOnVirus(cell, now);
          virus.reset();
          triggered = true;
          break;
        }
      }

      if (triggered) break;
    }
  }
}

function resolveBlobCollisions() {
  const actors = getActors();

  for (let i = 0; i < actors.length; i += 1) {
    const actorA = actors[i];
    if (!actorA.alive) continue;

    for (let j = i + 1; j < actors.length; j += 1) {
      const actorB = actors[j];
      if (!actorB.alive) continue;

      for (const a of [...actorA.cells]) {
        if (!actorA.cells.includes(a)) continue;

        for (const b of [...actorB.cells]) {
          if (!actorB.cells.includes(b)) continue;

          if (canEat(a, b)) {
            a.grow(b.mass * 0.82);
            actorB.removeCell(b);
          } else if (canEat(b, a)) {
            b.grow(a.mass * 0.82);
            actorA.removeCell(a);
            break;
          }
        }
      }
    }
  }

  if (!player.alive) {
    endGame();
    return;
  }

  for (const bot of bots) {
    if (!bot.alive) respawnBot(bot);
  }
}

function calculateCameraZoom() {
  if (!player.alive) return zoom;
  const massZoom = clamp(1.12 / Math.pow(Math.max(START_MASS, player.totalMass) / START_MASS, 0.13), 0.32, 1.08);
  const center = player.center;
  let spread = 0;

  for (const cell of player.cells) {
    spread = Math.max(spread, Math.hypot(cell.x - center.x, cell.y - center.y) + cell.radius);
  }

  const spreadZoom = clamp(Math.min(width, height) / Math.max(420, spread * 2.8), 0.28, 1.08);
  return Math.min(massZoom, spreadZoom);
}

function update(deltaMs, now) {
  if (!running) return;

  const target = playerTargetVector();
  player.update(deltaMs, target.x, target.y, now);

  const actors = getActors();
  for (const bot of bots) {
    const center = bot.center;
    const nearbyFood = foodGrid.queryCircle(center.x, center.y, BOT_FOOD_SCAN_RADIUS);
    bot.updateAI(nearbyFood, actors, viruses, deltaMs, now);
  }
  for (const virus of viruses) virus.update(deltaMs);

  updateEjected(deltaMs, now);
  for (const actor of actors) consumeFood(actor);
  resolveVirusCollisions(now);
  resolveBlobCollisions();

  const targetZoom = calculateCameraZoom();
  zoom += (targetZoom - zoom) * Math.min(1, deltaMs * 0.0045);

  leaderboardClock += deltaMs;
  if (leaderboardClock >= 160) {
    leaderboardClock = 0;
    updateHud();
  }
}

function updateHud() {
  const ranking = getActors()
    .filter((actor) => actor.alive)
    .sort((a, b) => b.totalMass - a.totalMass);

  const playerRank = Math.max(1, ranking.indexOf(player) + 1);
  massValue.textContent = Math.round(player.totalMass).toLocaleString();
  rankValue.textContent = `#${playerRank}`;
  cellValue.textContent = player.cells.length.toString();

  leaderboard.replaceChildren();
  ranking.slice(0, 8).forEach((actor) => {
    const item = document.createElement("li");
    item.textContent = `${actor.name} · ${Math.round(actor.totalMass)}`;
    if (actor === player) item.classList.add("is-player");
    leaderboard.appendChild(item);
  });
}

function drawBackground() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, width, height);

  const camera = player.alive ? player.center : { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.x, -camera.y);

  const left = clamp(camera.x - width / (2 * zoom) - 180, 0, WORLD_WIDTH);
  const right = clamp(camera.x + width / (2 * zoom) + 180, 0, WORLD_WIDTH);
  const top = clamp(camera.y - height / (2 * zoom) - 180, 0, WORLD_HEIGHT);
  const bottom = clamp(camera.y + height / (2 * zoom) + 180, 0, WORLD_HEIGHT);

  const grid = 120;
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = "rgba(255,255,255,.045)";
  ctx.beginPath();

  for (let x = Math.floor(left / grid) * grid; x <= right; x += grid) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }

  for (let y = Math.floor(top / grid) * grid; y <= bottom; y += grid) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }

  ctx.stroke();

  ctx.lineWidth = 5 / zoom;
  ctx.strokeStyle = "rgba(156,255,87,.28)";
  ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  for (const pellet of foodGrid.queryRect(left, top, right, bottom)) {
    if (pellet.x > left && pellet.x < right && pellet.y > top && pellet.y < bottom) pellet.draw(ctx);
  }

  for (const mass of ejectedMasses) {
    if (mass.x > left && mass.x < right && mass.y > top && mass.y < bottom) mass.draw(ctx, zoom);
  }

  for (const virus of viruses) {
    if (virus.x + virus.radius > left && virus.x - virus.radius < right && virus.y + virus.radius > top && virus.y - virus.radius < bottom) {
      virus.draw(ctx, zoom);
    }
  }

  const cellEntries = [];
  for (const actor of getActors()) {
    const largest = actor.largestCell;
    for (const cell of actor.cells) cellEntries.push({ actor, cell, isLargest: cell === largest });
  }
  cellEntries.sort((a, b) => a.cell.radius - b.cell.radius);

  for (const { actor, cell, isLargest } of cellEntries) {
    cell.draw(ctx, zoom, isLargest ? actor.name : "", isLargest);
  }

  ctx.restore();
}

function drawMinimap() {
  if (!running || !player.alive) return;

  const mapSize = Math.min(104, width * 0.22);
  const margin = 16;
  const x = width - mapSize - margin;
  const y = height - mapSize - margin;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "rgba(13,20,38,.72)";
  ctx.fillRect(x, y, mapSize, mapSize);
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.strokeRect(x, y, mapSize, mapSize);

  const center = player.center;
  const px = x + (center.x / WORLD_WIDTH) * mapSize;
  const py = y + (center.y / WORLD_HEIGHT) * mapSize;
  ctx.beginPath();
  ctx.arc(px, py, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#9cff57";
  ctx.fill();
}

function render() {
  drawBackground();
  drawMinimap();
}

function frame(now) {
  const deltaMs = Math.min(40, now - lastTime || 16.667);
  lastTime = now;
  update(deltaMs, now);
  render();
  requestAnimationFrame(frame);
}

function updatePointer(event) {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
}

window.addEventListener("resize", resize);
canvas.addEventListener("pointermove", updatePointer);
canvas.addEventListener("pointerdown", updatePointer);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

document.addEventListener("keydown", (event) => {
  if (!running || event.repeat) return;

  if (event.code === "Space") {
    event.preventDefault();
    splitPlayer();
  } else if (event.code === "KeyW") {
    event.preventDefault();
    feedPlayer();
  }
});

splitButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  splitPlayer();
});

feedButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  feedPlayer();
});

startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  startGame();
});

respawnButton.addEventListener("click", startGame);

document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
});

const savedName = localStorage.getItem("blob-arena-name");
if (savedName) playerNameInput.value = savedName.slice(0, 18);

resize();
createBots();
createViruses();
updateHud();
requestAnimationFrame(frame);
