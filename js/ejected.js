import { keepInsideWorld, massToRadius } from "./physics.js";

export class EjectedMass {
  constructor({ x, y, mass, color, vx, vy, ownerId, bornAt }) {
    const speed = Math.hypot(vx, vy) || 1;
    const baseAngle = Math.atan2(vy, vx);
    const jitter = (Math.random() - 0.5) * 0.07;
    const angle = baseAngle + jitter;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const launchSpeed = Math.max(29, speed * 1.48);

    // Start slightly farther outside the source cell so feeding reads as a launch,
    // not as a pellet that is stuck inside the blob for a few frames.
    this.x = x + nx * 13;
    this.y = y + ny * 13;
    this.mass = mass;
    this.color = color;
    this.vx = nx * launchSpeed;
    this.vy = ny * launchSpeed;
    this.ownerId = ownerId;
    this.bornAt = bornAt;
    this.dead = false;
    this.pulseOffset = Math.random() * Math.PI * 2;
  }

  get radius() {
    // Distinct from food, but still compact enough to read as ejected mass.
    return Math.max(10, massToRadius(this.mass) * 0.84);
  }

  update(deltaMs) {
    const frameScale = Math.min(2.4, deltaMs / 16.667);
    this.x += this.vx * frameScale;
    this.y += this.vy * frameScale;

    // Slightly stronger initial glide with a soft stop, closer to Agar-style feeding.
    const damping = Math.pow(0.895, frameScale);
    this.vx *= damping;
    this.vy *= damping;
    keepInsideWorld(this);
  }

  draw(ctx, zoom, effects = {}) {
    const radius = this.radius;
    const pulse = effects.pulse === false ? 1 : 1 + Math.sin(performance.now() * 0.008 + this.pulseOffset) * 0.035;

    ctx.save();
    if (effects.glow) {
      ctx.shadowBlur = Math.min(28, 11 / Math.max(0.08, zoom));
      ctx.shadowColor = this.color;
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, radius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x - radius * 0.28, this.y - radius * 0.3, Math.max(1.4 / zoom, radius * 0.2), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.28)";
    ctx.fill();

    ctx.lineWidth = 1.6 / zoom;
    ctx.strokeStyle = "rgba(255,255,255,.58)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
