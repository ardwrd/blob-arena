import { Bot } from "./bot.js";
import { Food } from "./food.js";
import { Player } from "./player.js";
import {
  START_MASS,
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
const finalMass = document.querySelector("#final-mass");
const hud = document.querySelector("#hud");
const massValue = document.querySelector("#mass-value");
const rankValue = document.querySelector("#rank-value");
const leaderboard = document.querySelector("#leaderboard");

const BOT_NAMES = [
  "Byte", "Mochi", "Nova", "Pixel", "Orbit", "Boba", "Mango", "Noodle", "Pico",
  "Ziggy", "Luma", "Taro", "Kiwi", "Echo", "Pebble", "Miso", "Toast", "Comet"
];

const FOOD_COUNT = 650;
const BOT_COUNT = 18;

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = Math.min(2, window.devicePixelRatio || 1);
let running = false;
let lastTime = performance.now();
let zoom = 1;
let leaderboardClock = 0;

const pointer = { x: width / 2, y: height / 2 };
const food = Array.from({ length: FOOD_COUNT }, () => new Food());
const bots = [];
const player = new Player({ name: "Blob", isHuman: true, color: "#9cff57" });

function createBots() {
  bots.length = 0;
  for (let i = 0; i < BOT_COUNT; i += 1) {
    bots.push(new Bot({
      name: BOT_NAMES[i % BOT_NAMES.length],
      mass: randomRange(30, 120),
      color: randomColor()
    }));
  }
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
  createBots();

  const name = (playerNameInput.value || "Blob").trim().slice(0, 18) || "Blob";
  player.reset({ name, mass: START_MASS, color: "#9cff57" });
  zoom = 1;
  pointer.x = width / 2;
  pointer.y = height / 2;
}

function startGame() {
  resetArena();
  running = true;
  startScreen.hidden = true;
  deathScreen.hidden = true;
  hud.hidden = false;
  localStorage.setItem("blob-arena-name", player.name);
}

function endGame() {
  running = false;
  player.alive = false;
  finalMass.textContent = Math.round(player.mass).toLocaleString();
  deathScreen.hidden = false;
}

function respawnBot(bot) {
  bot.reset({
    name: bot.name,
    mass: randomRange(28, 110),
    color: randomColor()
  });
}

function getBlobs() {
  return [player, ...bots];
}

function consumeFood(blob) {
  if (!blob.alive) return;
  const reach = blob.radius + 7;
  const reach2 = reach * reach;

  for (const pellet of food) {
    if (distanceSquared(blob, pellet) <= reach2) {
      blob.grow(pellet.value);
      pellet.reset();
    }
  }
}

function resolveBlobCollisions() {
  const blobs = getBlobs();

  for (let i = 0; i < blobs.length; i += 1) {
    for (let j = i + 1; j < blobs.length; j += 1) {
      const a = blobs[i];
      const b = blobs[j];
      if (!a.alive || !b.alive) continue;

      let eater = null;
      let prey = null;

      if (canEat(a, b)) {
        eater = a;
        prey = b;
      } else if (canEat(b, a)) {
        eater = b;
        prey = a;
      }

      if (!eater || !prey) continue;

      eater.grow(prey.mass * 0.82);
      prey.alive = false;

      if (prey === player) {
        endGame();
        return;
      }

      respawnBot(prey);
    }
  }
}

function update(deltaMs) {
  if (!running) return;

  player.setTargetVector(pointer.x - width / 2, pointer.y - height / 2);
  player.update(deltaMs);

  const blobs = getBlobs();
  for (const bot of bots) bot.updateAI(food, blobs, deltaMs);

  for (const blob of blobs) consumeFood(blob);
  resolveBlobCollisions();

  const targetZoom = clamp(1.12 / Math.pow(player.mass / START_MASS, 0.13), 0.42, 1.08);
  zoom += (targetZoom - zoom) * Math.min(1, deltaMs * 0.0045);

  leaderboardClock += deltaMs;
  if (leaderboardClock >= 180) {
    leaderboardClock = 0;
    updateHud();
  }
}

function updateHud() {
  const ranking = getBlobs()
    .filter((blob) => blob.alive)
    .sort((a, b) => b.mass - a.mass);

  const playerRank = Math.max(1, ranking.indexOf(player) + 1);
  massValue.textContent = Math.round(player.mass).toLocaleString();
  rankValue.textContent = `#${playerRank}`;

  leaderboard.replaceChildren();
  ranking.slice(0, 8).forEach((blob) => {
    const item = document.createElement("li");
    item.textContent = `${blob.name} · ${Math.round(blob.mass)}`;
    if (blob === player) item.classList.add("is-player");
    leaderboard.appendChild(item);
  });
}

function drawBackground() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-player.x, -player.y);

  const left = clamp(player.x - width / (2 * zoom) - 160, 0, WORLD_WIDTH);
  const right = clamp(player.x + width / (2 * zoom) + 160, 0, WORLD_WIDTH);
  const top = clamp(player.y - height / (2 * zoom) - 160, 0, WORLD_HEIGHT);
  const bottom = clamp(player.y + height / (2 * zoom) + 160, 0, WORLD_HEIGHT);

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

  for (const pellet of food) {
    if (pellet.x > left && pellet.x < right && pellet.y > top && pellet.y < bottom) pellet.draw(ctx);
  }

  const drawOrder = getBlobs().filter((blob) => blob.alive).sort((a, b) => a.radius - b.radius);
  for (const blob of drawOrder) blob.draw(ctx, zoom);

  ctx.restore();
}

function drawMinimap() {
  if (!running) return;

  const mapSize = Math.min(104, width * 0.22);
  const margin = 16;
  const x = width - mapSize - margin;
  const y = height - mapSize - margin;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "rgba(13,20,38,.72)";
  ctx.fillRect(x, y, mapSize, mapSize);
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.strokeRect(x, y, mapSize, mapSize);

  const px = x + (player.x / WORLD_WIDTH) * mapSize;
  const py = y + (player.y / WORLD_HEIGHT) * mapSize;
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
  update(deltaMs);
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
updateHud();
requestAnimationFrame(frame);
