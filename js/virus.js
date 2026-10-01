import {
  VIRUS_MASS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  clamp,
  massToRadius,
  normalize,
  randomRange,
  randomSpawn
} from "./physics.js";

export class Virus {
  constructor({ x, y, vx = 0, vy = 0 } = {}) {
    const spawn = randomSpawn(280);
    this.x = x ?? spawn.x;
    this.y = y ?? spawn.y;
    this.mass = VIRUS_MASS;
    this.vx = vx;
    this.vy = vy;
    this.feedCount = 0;
    this.rotation = randomRange(0, Math.PI * 2);
    this.spin = randomRange(0.0008, 0.00135) * (Math.random() < 0.5 ? -1 : 1);
  }

  get radius() {
    return massToRadius(this.mass) * 0.98;
  }

  reset() {
    const spawn = randomSpawn(280);
    this.x = spawn.x;
    this.y = spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.feedCount = 0;
    this.rotation = randomRange(0, Math.PI * 2);
    this.spin = randomRange(0.0008, 0.00135) * (Math.random() < 0.5 ? -1 : 1);
  }

  update(deltaMs) {
    const frameScale = Math.min(2.4, deltaMs / 16.667);
    this.x += this.vx * frameScale;
    this.y += this.vy * frameScale;
    const damping = Math.pow(0.92, frameScale);
    this.vx *= damping;
    this.vy *= damping;
    this.rotation += this.spin * deltaMs;

    const r = this.radius;
    this.x = clamp(this.x, r, WORLD_WIDTH - r);
    this.y = clamp(this.y, r, WORLD_HEIGHT - r);
  }

  feed(ejected) {
    this.feedCount += 1;
    if (this.feedCount < 7) return null;
    this.feedCount = 0;

    const direction = normalize(ejected.vx, ejected.vy);
    const angle = direction.length ? Math.atan2(direction.y, direction.x) : randomRange(0, Math.PI * 2);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const offset = this.radius * 2.1;

    return new Virus({
      x: this.x + dx * offset,
      y: this.y + dy * offset,
      vx: dx * 18,
      vy: dy * 18
    });
  }

  draw(ctx, zoom) {
    const spikes = 20;
    const inner = this.radius * 0.82;
    const outer = this.radius;

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = this.rotation + (Math.PI * i) / spikes;
      const x = this.x + Math.cos(angle) * radius;
      const y = this.y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "#36d66b";
    ctx.fill();
    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = "rgba(210,255,223,.72)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x, this.y, inner * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,40,22,.18)";
    ctx.fill();
    ctx.restore();
  }
}
