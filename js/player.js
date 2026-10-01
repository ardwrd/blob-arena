import {
  START_MASS,
  keepInsideWorld,
  massToRadius,
  normalize,
  randomColor,
  randomSpawn,
  speedForMass
} from "./physics.js";

export class Player {
  constructor({ name = "Blob", x, y, mass = START_MASS, color = randomColor(), isHuman = false } = {}) {
    const spawn = randomSpawn();
    this.name = name;
    this.x = x ?? spawn.x;
    this.y = y ?? spawn.y;
    this.mass = mass;
    this.color = color;
    this.isHuman = isHuman;
    this.alive = true;
    this.targetX = 0;
    this.targetY = 0;
  }

  get radius() {
    return massToRadius(this.mass);
  }

  get speed() {
    return speedForMass(this.mass);
  }

  setTargetVector(x, y) {
    this.targetX = x;
    this.targetY = y;
  }

  update(deltaMs) {
    if (!this.alive) return;

    const direction = normalize(this.targetX, this.targetY);
    if (!direction.length) return;

    const distanceFactor = Math.min(1, direction.length / 120);
    const frameScale = Math.min(2, deltaMs / 16.667);
    const step = this.speed * distanceFactor * frameScale;

    this.x += direction.x * step;
    this.y += direction.y * step;
    keepInsideWorld(this);
  }

  grow(amount) {
    this.mass += Math.max(0, amount);
  }

  reset({ name = this.name, mass = START_MASS, color = this.color } = {}) {
    const spawn = randomSpawn(260);
    this.name = name;
    this.mass = mass;
    this.color = color;
    this.x = spawn.x;
    this.y = spawn.y;
    this.alive = true;
    this.targetX = 0;
    this.targetY = 0;
  }

  draw(ctx, zoom = 1) {
    if (!this.alive) return;

    const r = this.radius;

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = "rgba(255,255,255,.68)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x - r * .3, this.y - r * .32, Math.max(2 / zoom, r * .16), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fill();

    if (r * zoom > 18) {
      ctx.fillStyle = "#081020";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${Math.max(11 / zoom, Math.min(22 / zoom, r * .34))}px Inter, system-ui, sans-serif`;
      ctx.fillText(this.name, this.x, this.y - 1 / zoom);

      if (r * zoom > 34) {
        ctx.fillStyle = "rgba(8,16,32,.66)";
        ctx.font = `700 ${Math.max(8 / zoom, 11 / zoom)}px Inter, system-ui, sans-serif`;
        ctx.fillText(Math.round(this.mass), this.x, this.y + 15 / zoom);
      }
    }

    ctx.restore();
  }
}
