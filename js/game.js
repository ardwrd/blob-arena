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
const finalRank = document.querySelector("#final-rank");
const hud = document.querySelector("#hud");
const massValue = document.querySelector("#mass-value");
const rankValue = document.querySelector("#rank-value");
const cellValue = document.querySelector("#cell-value");
const leaderboard = document.querySelector("#leaderboard");
const cheatPanel = document.querySelector("#cheat-panel");
const cheatClose = document.querySelector("#cheat-close");
const cheatButtons = [...document.querySelectorAll("[data-cheat]")];
const graphicsButton = document.querySelector("#graphics-button");
const graphicsPanel = document.querySelector("#graphics-panel");
const graphicsClose = document.querySelector("#graphics-close");
const graphicsQuality = document.querySelector("#graphics-quality");
const graphicsScale = document.querySelector("#graphics-scale");
const graphicsToggles = [...document.querySelectorAll("[data-graphics]")];

const BOT_NAMES = [
  "Byte", "Mochi", "Nova", "Pixel", "Orbit", "Boba", "Mango", "Noodle", "Pico",
  "Ziggy", "Luma", "Taro", "Kiwi", "Echo", "Pebble", "Miso", "Toast", "Comet",
  "Yuzu", "Kumo", "Sora", "Bean", "Puff", "Ringo", "Koda", "Mika"
];

const FOOD_COUNT = 8000;
const BOT_COUNT = 200;
const VIRUS_COUNT = 40;
const MAX_EJECTED = 240;
const MAX_FEED_PARTICLES = 520;
const FOOD_GRID_SIZE = 320;
const BOT_FOOD_SCAN_RADIUS = 760;
const FEED_INTERVAL = 105;
const GRAPHICS_STORAGE_KEY = "blob-arena-graphics";

const GRAPHICS_PRESETS = {
  low: { dprCap: 1, grid: false, particles: false, glow: false, names: true },
  medium: { dprCap: 1.25, grid: true, particles: false, glow: false, names: true },
  high: { dprCap: 1.75, grid: true, particles: true, glow: false, names: true },
  ultra: { dprCap: 2, grid: true, particles: true, glow: true, names: true }
};

function loadGraphicsState() {
  const fallback = { quality: "high", ...GRAPHICS_PRESETS.high };
  try {
    const saved = JSON.parse(localStorage.getItem(GRAPHICS_STORAGE_KEY) || "null");
    if (!saved || !GRAPHICS_PRESETS[saved.quality]) return fallback;
    return { ...fallback, ...saved, dprCap: GRAPHICS_PRESETS[saved.quality].dprCap };
  } catch {
    return fallback;
  }
}

const graphicsState = loadGraphicsState();

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = 1;
let running = false;
let arenaInitialized = false;
let lastTime = performance.now();
let zoom = 1;
let leaderboardClock = 0;
let lastPlayerRank = BOT_COUNT + 1;
let lastPlayerMass = START_MASS;
let feedHeld = false;
let nextFeedAt = 0;

const cheatState = {
  godMode: false,
  freezeBots: false
};

const pointer = { x: width / 2, y: height / 2 };
const food = Array.from({ length: FOOD_COUNT }, () => new Food());
const foodGrid = new SpatialGrid(FOOD_GRID_SIZE);
const bots = [];
const viruses = [];
const ejectedMasses = [];
const feedParticles = [];
const player = new Player({ name: "Blob", isHuman: true, color: "#9cff57" });

foodGrid.rebuild(food);

function saveGraphicsState() {
  localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify({
    quality: graphicsState.quality,
    grid: graphicsState.grid,
    particles: graphicsState.particles,
    glow: graphicsState.glow,
    names: graphicsState.names
  }));
}

function syncGraphicsUi() {
  graphicsQuality.value = graphicsState.quality;
  for (const input of graphicsToggles) {
    input.checked = Boolean(graphicsState[input.dataset.graphics]);
  }
  graphicsScale.textContent = `${dpr.toFixed(2)}×`;
}

function applyGraphicsPreset(name) {
  const preset = GRAPHICS_PRESETS[name] || GRAPHICS_PRESETS.high;
  graphicsState.quality = GRAPHICS_PRESETS[name] ? name : "high";
  Object.assign(graphicsState, preset);
  if (!graphicsState.particles) feedParticles.length = 0;
  saveGraphicsState();
  resize();
  syncGraphicsUi();
}

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
  dpr = Math.min(graphicsState.dprCap, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (graphicsScale) graphicsScale.textContent = `${dpr.toFixed(2)}×`;
}

function resetArena() {
  for (const pellet of food) pellet.reset();
  foodGrid.rebuild(food);
  ejectedMasses.length = 0;
  feedParticles.length = 0;
  createBots();
  createViruses();

  const name = (playerNameInput.value || "Blob").trim().slice(0, 18) || "Blob";
  player.reset({ name, mass: START_MASS, color: "#9cff57" });
  arenaInitialized = true;
  lastPlayerMass = START_MASS;
  zoom = 1;
  feedHeld = false;
  pointer.x = width / 2;
  pointer.y = height / 2;
  updateHud();
}

function respawnPlayer() {
  const name = (playerNameInput.value || player.name || "Blob").trim().slice(0, 18) || "Blob";
  player.reset({ name, mass: START_MASS, color: "#9cff57" });
  running = true;
  lastTime = performance.now();
  lastPlayerMass = START_MASS;
  zoom = 1;
  feedHeld = false;
  deathScreen.hidden = true;
  hud.hidden = false;
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
  feedHeld = false;
  finalMass.textContent = Math.round(lastPlayerMass).toLocaleString();
  finalRank.textContent = `#${lastPlayerRank}`;
  massValue.textContent = Math.round(lastPlayerMass).toLocaleString();
  rankValue.textContent = `#${lastPlayerRank}`;
  cellValue.textContent = "0";
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

function spawnFeedParticles(mass) {
  if (!graphicsState.particles) return;
  const count = graphicsState.quality === "ultra" ? 2 : 1;
  const speed = Math.max(1, Math.hypot(mass.vx, mass.vy));
  const nx = mass.vx / speed;
  const ny = mass.vy / speed;

  for (let i = 0; i < count; i += 1) {
    feedParticles.push({
      x: mass.x - nx * randomRange(4, 12),
      y: mass.y - ny * randomRange(4, 12),
      vx: -nx * randomRange(0.8, 2.3) + randomRange(-0.7, 0.7),
      vy: -ny * randomRange(0.8, 2.3) + randomRange(-0.7, 0.7),
      life: randomRange(180, 320),
      maxLife: randomRange(180, 320),
      size: randomRange(1.5, 3.2),
      color: mass.color
    });
  }

  if (feedParticles.length > MAX_FEED_PARTICLES) {
    feedParticles.splice(0, feedParticles.length - MAX_FEED_PARTICLES);
  }
}

function feedPlayer(now = performance.now()) {
  if (!running) return 0;
  const target = playerTargetVector();
  const emitted = player.eject(target.x, target.y, now);

  for (const data of emitted) {
    const mass = new EjectedMass(data);
    ejectedMasses.push(mass);
    spawnFeedParticles(mass);
  }

  if (ejectedMasses.length > MAX_EJECTED) {
    ejectedMasses.splice(0, ejectedMasses.length - MAX_EJECTED);
  }

  return emitted.length;
}

function updateFeedParticles(deltaMs) {
  if (!feedParticles.length) return;
  const frameScale = Math.min(2.4, deltaMs / 16.667);

  for (let i = feedParticles.length - 1; i >= 0; i -= 1) {
    const particle = feedParticles[i];
    particle.life -= deltaMs;
    if (particle.life <= 0) {
      feedParticles.splice(i, 1);
      continue;
    }

    particle.x += particle.vx * frameScale;
    particle.y += particle.vy * frameScale;
    particle.vx *= Math.pow(0.94, frameScale);
    particle.vy *= Math.pow(0.94, frameScale);
  }
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
      if (actor.id === mass.ownerId && now - mass.bornAt < 760) continue;

      for (const cell of actor.cells) {
        const capture = Math.max(5, cell.radius - mass.radius * 0.12);
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

          const canEatB = !(actorB === player && cheatState.godMode) && canEat(a, b);
          const canEatA = !(actorA === player && cheatState.godMode) && canEat(b, a);

          if (canEatB) {
            a.grow(b.mass * 0.82);
            actorB.removeCell(b);
          } else if (canEatA) {
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

  const totalMass = Math.max(START_MASS, player.totalMass);
  const massRatio = totalMass / START_MASS;
  const viewportShort = Math.max(320, Math.min(width, height));
  const largestRadius = Math.max(1, player.largestCell?.radius || 1);
  const center = player.center;
  let spread = largestRadius;

  for (const cell of player.cells) {
    spread = Math.max(spread, Math.hypot(cell.x - center.x, cell.y - center.y) + cell.radius);
  }

  const massZoom = clamp(1.08 / Math.pow(massRatio, 0.22), 0.035, 1.08);
  const cellZoom = clamp((viewportShort * 0.23) / largestRadius, 0.035, 1.08);
  const spreadZoom = clamp(viewportShort / Math.max(420, spread * 3.15), 0.035, 1.08);

  return Math.min(massZoom, cellZoom, spreadZoom);
}

function update(deltaMs, now) {
  if (!running) return;

  if (feedHeld && now >= nextFeedAt) {
    feedPlayer(now);
    nextFeedAt = now + FEED_INTERVAL;
  }

  const target = playerTargetVector();
  player.update(deltaMs, target.x, target.y, now);

  const actors = getActors();
  if (!cheatState.freezeBots) {
    for (const bot of bots) {
      const center = bot.center;
      const nearbyFood = foodGrid.queryCircle(center.x, center.y, BOT_FOOD_SCAN_RADIUS);
      bot.updateAI(nearbyFood, actors, viruses, deltaMs, now);
    }
  }
  for (const virus of viruses) virus.update(deltaMs);

  updateEjected(deltaMs, now);
  updateFeedParticles(deltaMs);
  for (const actor of actors) consumeFood(actor);
  resolveVirusCollisions(now);
  resolveBlobCollisions();

  if (!player.alive) return;

  const targetZoom = calculateCameraZoom();
  const zoomResponse = targetZoom < zoom ? 0.011 : 0.0045;
  zoom += (targetZoom - zoom) * Math.min(1, deltaMs * zoomResponse);

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

  if (player.alive) {
    lastPlayerRank = Math.max(1, ranking.indexOf(player) + 1);
    lastPlayerMass = player.totalMass;
    massValue.textContent = Math.round(player.totalMass).toLocaleString();
    rankValue.textContent = `#${lastPlayerRank}`;
    cellValue.textContent = player.cells.length.toString();
  } else {
    massValue.textContent = Math.round(lastPlayerMass).toLocaleString();
    rankValue.textContent = `#${lastPlayerRank}`;
    cellValue.textContent = "0";
  }

  leaderboard.replaceChildren();
  ranking.slice(0, 8).forEach((actor) => {
    const item = document.createElement("li");
    item.textContent = `${actor.name} · ${Math.round(actor.totalMass)}`;
    if (actor === player) item.classList.add("is-player");
    leaderboard.appendChild(item);
  });
}

function drawFeedParticles(left, top, right, bottom) {
  if (!graphicsState.particles) return;

  for (const particle of feedParticles) {
    if (particle.x < left || particle.x > right || particle.y < top || particle.y > bottom) continue;
    const alpha = Math.max(0, particle.life / particle.maxLife);
    ctx.globalAlpha = alpha * 0.52;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size / Math.max(0.25, zoom), 0, Math.PI * 2);
    ctx.fillStyle = particle.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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

  if (graphicsState.grid) {
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
  }

  ctx.lineWidth = 5 / zoom;
  ctx.strokeStyle = "rgba(156,255,87,.28)";
  ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  for (const pellet of foodGrid.queryRect(left, top, right, bottom)) {
    if (pellet.x > left && pellet.x < right && pellet.y > top && pellet.y < bottom) pellet.draw(ctx);
  }

  drawFeedParticles(left, top, right, bottom);

  for (const mass of ejectedMasses) {
    if (mass.x > left && mass.x < right && mass.y > top && mass.y < bottom) {
      mass.draw(ctx, zoom, { glow: graphicsState.glow, pulse: graphicsState.quality !== "low" });
    }
  }

  for (const virus of viruses) {
    if (virus.x + virus.radius > left && virus.x - virus.radius < right && virus.y + virus.radius > top && virus.y - virus.radius < bottom) {
      if (graphicsState.glow) {
        ctx.save();
        ctx.shadowBlur = Math.min(24, 9 / Math.max(0.08, zoom));
        ctx.shadowColor = "rgba(112,224,0,.72)";
        virus.draw(ctx, zoom);
        ctx.restore();
      } else {
        virus.draw(ctx, zoom);
      }
    }
  }

  const cellEntries = [];
  for (const actor of getActors()) {
    const largest = actor.largestCell;
    for (const cell of actor.cells) {
      if (cell.x + cell.radius < left || cell.x - cell.radius > right || cell.y + cell.radius < top || cell.y - cell.radius > bottom) continue;
      cellEntries.push({ actor, cell, isLargest: cell === largest });
    }
  }
  cellEntries.sort((a, b) => a.cell.radius - b.cell.radius);

  for (const { actor, cell, isLargest } of cellEntries) {
    const label = graphicsState.names && isLargest ? actor.name : "";
    const showMass = graphicsState.names && isLargest;

    if (graphicsState.glow) {
      ctx.save();
      ctx.shadowBlur = Math.min(24, 9 / Math.max(0.08, zoom));
      ctx.shadowColor = cell.color;
      cell.draw(ctx, zoom, label, showMass);
      ctx.restore();
    } else {
      cell.draw(ctx, zoom, label, showMass);
    }
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

function setCheatToggle(name, active) {
  cheatState[name] = active;
  const button = cheatButtons.find((item) => item.dataset.cheat === name);
  if (!button) return;
  button.classList.toggle("is-active", active);
  const status = button.querySelector("[data-state]");
  if (status) status.textContent = active ? "ON" : "OFF";
}

function toggleCheatPanel(force) {
  const shouldOpen = typeof force === "boolean" ? force : cheatPanel.hidden;
  cheatPanel.hidden = !shouldOpen;
  if (shouldOpen) toggleGraphicsPanel(false);
}

function toggleGraphicsPanel(force) {
  const shouldOpen = typeof force === "boolean" ? force : graphicsPanel.hidden;
  graphicsPanel.hidden = !shouldOpen;
  graphicsButton.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) cheatPanel.hidden = true;
}

function addMass(amount) {
  if (!player.alive || !player.largestCell) return;
  player.largestCell.grow(amount);
  lastPlayerMass = player.totalMass;
  updateHud();
}

function teleportPlayerToCenter() {
  if (!player.alive || !player.cells.length) return;
  const center = player.center;
  const dx = WORLD_WIDTH / 2 - center.x;
  const dy = WORLD_HEIGHT / 2 - center.y;
  for (const cell of player.cells) {
    cell.x += dx;
    cell.y += dy;
  }
}

function runCheat(action) {
  if (action === "mass100") addMass(100);
  else if (action === "mass1000") addMass(1000);
  else if (action === "mass10000") addMass(10000);
  else if (action === "godMode") setCheatToggle("godMode", !cheatState.godMode);
  else if (action === "freezeBots") setCheatToggle("freezeBots", !cheatState.freezeBots);
  else if (action === "center") teleportPlayerToCenter();
}

window.addEventListener("resize", resize);
canvas.addEventListener("pointermove", updatePointer);
canvas.addEventListener("pointerdown", updatePointer);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

document.addEventListener("keydown", (event) => {
  if (event.code === "Insert" || event.key === "Insert") {
    if (event.repeat) return;
    event.preventDefault();
    toggleCheatPanel();
    return;
  }

  if (event.code === "KeyG") {
    if (event.repeat) return;
    event.preventDefault();
    toggleGraphicsPanel();
    return;
  }

  if (event.code === "Escape") {
    if (!graphicsPanel.hidden) {
      event.preventDefault();
      toggleGraphicsPanel(false);
      return;
    }
    if (!cheatPanel.hidden) {
      event.preventDefault();
      toggleCheatPanel(false);
      return;
    }
  }

  if (!running) return;

  if (event.code === "Space") {
    if (event.repeat) return;
    event.preventDefault();
    splitPlayer();
  } else if (event.code === "KeyW") {
    event.preventDefault();
    if (!feedHeld) {
      feedHeld = true;
      const now = performance.now();
      feedPlayer(now);
      nextFeedAt = now + FEED_INTERVAL;
    }
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") feedHeld = false;
});

splitButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  splitPlayer();
});

feedButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!feedHeld) {
    feedHeld = true;
    const now = performance.now();
    feedPlayer(now);
    nextFeedAt = now + FEED_INTERVAL;
  }
});

window.addEventListener("pointerup", () => { feedHeld = false; });
window.addEventListener("pointercancel", () => { feedHeld = false; });
window.addEventListener("blur", () => { feedHeld = false; });

cheatClose.addEventListener("click", () => toggleCheatPanel(false));
cheatPanel.addEventListener("pointerdown", (event) => event.stopPropagation());
for (const button of cheatButtons) {
  button.addEventListener("click", () => runCheat(button.dataset.cheat));
}

graphicsButton.addEventListener("click", () => toggleGraphicsPanel());
graphicsClose.addEventListener("click", () => toggleGraphicsPanel(false));
graphicsPanel.addEventListener("pointerdown", (event) => event.stopPropagation());
graphicsQuality.addEventListener("change", () => applyGraphicsPreset(graphicsQuality.value));
for (const input of graphicsToggles) {
  input.addEventListener("change", () => {
    graphicsState[input.dataset.graphics] = input.checked;
    if (!graphicsState.particles) feedParticles.length = 0;
    saveGraphicsState();
    syncGraphicsUi();
  });
}

startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  startGame();
});

respawnButton.addEventListener("click", () => {
  if (!arenaInitialized) resetArena();
  respawnPlayer();
});

document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
  if (document.hidden) feedHeld = false;
});

const savedName = localStorage.getItem("blob-arena-name");
if (savedName) playerNameInput.value = savedName.slice(0, 18);

resize();
syncGraphicsUi();
createBots();
createViruses();
updateHud();
requestAnimationFrame(frame);
