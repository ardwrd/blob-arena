import { keepInsideWorld, massToRadius } from "./physics.js";

export class EjectedMass {
  constructor({ x, y, mass, color, vx, vy, ownerId, bornAt }) {
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.color = color;
    this.vx = vx;
    this.vy = vy;
    this.ownerId = ownerId;
    this.bornAt = bornAt;
    this.dead = false;
  }

  get radius() {
    // Keep ejected mass visually distinct from normal food pellets.
    return Math.max(9, massToRadius(this.mass) * 0.78);
  }

  update(deltaMs) {
    const frameScale = Math.min(2.4, deltaMs / 16.667);
    this.x += this.vx * frameScale;
    this.y += this.vy * frameScale;
    const damping = Math.pow(0.9, frameScale);
    this.vx *= damping;
    this.vy *= damping;
    keepInsideWorld(this);
  }

  draw(ctx, zoom) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeStyle = "rgba(255,255,255,.52)";
    ctx.stroke();
    ctx.restore();
  }
}
