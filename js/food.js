import { randomColor, randomRange, WORLD_HEIGHT, WORLD_WIDTH } from "./physics.js";

export class Food {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = randomRange(24, WORLD_WIDTH - 24);
    this.y = randomRange(24, WORLD_HEIGHT - 24);
    this.radius = randomRange(3.5, 6.5);
    this.value = randomRange(0.7, 1.35);
    this.color = randomColor();
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}
