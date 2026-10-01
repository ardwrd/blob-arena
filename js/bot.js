import { BlobActor } from "./player.js";
import { VIRUS_TRIGGER_MASS, distanceSquared, randomRange } from "./physics.js";

export class Bot extends BlobActor {
  constructor(options = {}) {
    super(options);
    this.thinkTimer = 0;
    this.wanderX = randomRange(-1, 1);
    this.wanderY = randomRange(-1, 1);
    this.splitCooldownUntil = 0;
  }

  updateAI(food, actors, viruses, deltaMs, now) {
    if (!this.alive) return;

    const center = this.center;
    const largest = this.largestCell;
    let dangerVirus = null;
    let dangerVirusDistance = Infinity;

    if (largest && largest.mass >= VIRUS_TRIGGER_MASS) {
      for (const virus of viruses) {
        const d2 = distanceSquared(largest, virus);
        if (d2 < 390 * 390 && d2 < dangerVirusDistance) {
          dangerVirus = virus;
          dangerVirusDistance = d2;
        }
      }
    }

    if (dangerVirus) {
      this.update(deltaMs, center.x - dangerVirus.x, center.y - dangerVirus.y, now);
      return;
    }

    let threat = null;
    let threatDistance = Infinity;
    let prey = null;
    let preyDistance = Infinity;

    for (const other of actors) {
      if (other === this || !other.alive) continue;
      const otherCenter = other.center;
      const d2 = distanceSquared(center, otherCenter);

      if (other.totalMass > this.totalMass * 1.18 && d2 < 820 * 820 && d2 < threatDistance) {
        threat = other;
        threatDistance = d2;
      } else if (this.totalMass > other.totalMass * 1.35 && d2 < 700 * 700 && d2 < preyDistance) {
        prey = other;
        preyDistance = d2;
      }
    }

    if (threat) {
      const target = threat.center;
      this.update(deltaMs, center.x - target.x, center.y - target.y, now);
      return;
    }

    if (prey) {
      const target = prey.center;
      const dx = target.x - center.x;
      const dy = target.y - center.y;
      const preyCell = prey.largestCell;

      if (
        now >= this.splitCooldownUntil &&
        preyCell && largest &&
        largest.mass > preyCell.mass * 2.35 &&
        preyDistance < 330 * 330 &&
        this.cells.length < 8
      ) {
        if (this.split(dx, dy, now)) this.splitCooldownUntil = now + 3200;
      }

      this.update(deltaMs, dx, dy, now);
      return;
    }

    let nearestFood = null;
    let nearestFoodDistance = 440 * 440;

    for (const pellet of food) {
      const d2 = distanceSquared(center, pellet);
      if (d2 < nearestFoodDistance) {
        nearestFood = pellet;
        nearestFoodDistance = d2;
      }
    }

    if (nearestFood) {
      this.update(deltaMs, nearestFood.x - center.x, nearestFood.y - center.y, now);
      return;
    }

    this.thinkTimer -= deltaMs;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = randomRange(700, 2200);
      this.wanderX = randomRange(-1, 1);
      this.wanderY = randomRange(-1, 1);
    }

    this.update(deltaMs, this.wanderX * 180, this.wanderY * 180, now);
  }
}
