export const WORLD_WIDTH = 5200;
export const WORLD_HEIGHT = 5200;
export const START_MASS = 42;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

export function randomSpawn(margin = 120) {
  return {
    x: randomRange(margin, WORLD_WIDTH - margin),
    y: randomRange(margin, WORLD_HEIGHT - margin)
  };
}

export function massToRadius(mass) {
  return Math.sqrt(Math.max(1, mass)) * 4.2;
}

export function speedForMass(mass) {
  return Math.max(1.45, 5.6 / Math.pow(Math.max(1, mass) / START_MASS, 0.18));
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

function isPinnedToWorldEdge(blob, epsilon = 2) {
  const r = blob.radius;
  return (
    blob.x <= r + epsilon ||
    blob.x >= WORLD_WIDTH - r - epsilon ||
    blob.y <= r + epsilon ||
    blob.y >= WORLD_HEIGHT - r - epsilon
  );
}

export function canEat(eater, prey) {
  if (!eater.alive || !prey.alive || eater === prey) return false;
  if (eater.mass < prey.mass * 1.12) return false;

  const d2 = distanceSquared(eater, prey);
  const captureRadius = Math.max(eater.radius * 0.74, eater.radius - prey.radius * 0.28);
  if (d2 < captureRadius * captureRadius) return true;

  // A smaller blob can otherwise become impossible to engulf when both blobs
  // are clamped against the same arena edge/corner. At the boundary, allow a
  // capture once the prey is already substantially overlapped by the eater.
  if (isPinnedToWorldEdge(eater) || isPinnedToWorldEdge(prey)) {
    const edgeCaptureRadius = eater.radius + prey.radius * 0.15;
    return d2 < edgeCaptureRadius * edgeCaptureRadius;
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
