export const WORLD_WIDTH = 7000;
export const WORLD_HEIGHT = 7000;
export const START_MASS = 42;
export const MAX_CELLS = 16;
export const SPLIT_MIN_MASS = 36;
export const EJECT_MIN_MASS = 25;
export const EJECT_COST = 16;
export const EJECTED_MASS = 12;
export const VIRUS_MASS = 100;
export const VIRUS_TRIGGER_MASS = 132;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

export function randomSpawn(margin = 160) {
  return {
    x: randomRange(margin, WORLD_WIDTH - margin),
    y: randomRange(margin, WORLD_HEIGHT - margin)
  };
}

export function massToRadius(mass) {
  return Math.sqrt(Math.max(1, mass)) * 4.2;
}

export function speedForMass(mass) {
  return Math.max(1.25, 5.8 / Math.pow(Math.max(1, mass) / START_MASS, 0.18));
}

export function mergeDelayForMass(mass) {
  return clamp(9000 + mass * 55, 10000, 30000);
}

export function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (!length) return { x: 0, y: 0, length: 0 };
  return { x: x / length, y: y / length, length };
}

export function keepInsideWorld(blob) {
  const r = blob.radius;
  blob.x = clamp(blob.x, r, WORLD_WIDTH - r);
  blob.y = clamp(blob.y, r, WORLD_HEIGHT - r);
}

export function isPinnedToEdge(blob, tolerance = 3) {
  const r = blob.radius;
  return blob.x <= r + tolerance || blob.x >= WORLD_WIDTH - r - tolerance || blob.y <= r + tolerance || blob.y >= WORLD_HEIGHT - r - tolerance;
}

export function canEat(eater, prey) {
  if (!eater || !prey || eater === prey) return false;
  if (eater.mass < prey.mass * 1.12) return false;

  const d2 = distanceSquared(eater, prey);
  const normalCapture = Math.max(eater.radius * 0.74, eater.radius - prey.radius * 0.28);
  if (d2 < normalCapture * normalCapture) return true;

  if (isPinnedToEdge(eater) || isPinnedToEdge(prey)) {
    const edgeCapture = Math.max(normalCapture, eater.radius - prey.radius * 0.08);
    return d2 < edgeCapture * edgeCapture;
  }

  return false;
}

export function randomColor() {
  const palette = [
    "#6c8cff", "#9cff57", "#ff6b78", "#ffd166", "#c77dff",
    "#48cae4", "#ff8fab", "#70e000", "#f77f00", "#4cc9f0"
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}
