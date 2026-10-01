import { Player } from "./player.js";
import { distanceSquared, randomRange } from "./physics.js";

export class Bot extends Player {
  constructor(options = {}) {
    super(options);
    this.thinkTimer = 0;
    this.wanderX = randomRange(-1, 1);
    this.wanderY = randomRange(-1, 1);
  }

  updateAI(food, blobs, deltaMs) {
    if (!this.alive) return;

    let threat = null;
    let threatDistance = Infinity;
    let prey = null;
    let preyDistance = Infinity;

    for (const other of blobs) {
      if (other === this || !other.alive) continue;
      const d2 = distanceSquared(this, other);

      if (other.mass > this.mass * 1.2 && d2 < 700 * 700 && d2 < threatDistance) {
        threat = other;
        threatDistance = d2;
      } else if (this.mass > other.mass * 1.35 && d2 < 520 * 520 && d2 < preyDistance) {
        prey = other;
        preyDistance = d2;
      }
    }

    if (threat) {
      this.setTargetVector(this.x - threat.x, this.y - threat.y);
      super.update(deltaMs);
      return;
    }

    if (prey) {
      this.setTargetVector(prey.x - this.x, prey.y - this.y);
      super.update(deltaMs);
      return;
    }

    let nearestFood = null;
    let nearestFoodDistance = 430 * 430;

    for (const pellet of food) {
      const d2 = distanceSquared(this, pellet);
      if (d2 < nearestFoodDistance) {
        nearestFood = pellet;
        nearestFoodDistance = d2;
      }
    }

    if (nearestFood) {
      this.setTargetVector(nearestFood.x - this.x, nearestFood.y - this.y);
    } else {
      this.thinkTimer -= deltaMs;
      if (this.thinkTimer <= 0) {
        this.thinkTimer = randomRange(700, 2200);
        this.wanderX = randomRange(-1, 1);
        this.wanderY = randomRange(-1, 1);
      }
      this.setTargetVector(this.wanderX * 180, this.wanderY * 180);
    }

    super.update(deltaMs);
  }
}
