import { BlobActor } from "./player.js";
import { VIRUS_TRIGGER_MASS, distanceSquared, normalize, randomRange } from "./physics.js";

export class Bot extends BlobActor {
  constructor(options = {}) {
    super(options);
    this.decisionTimer = 0;
    this.wanderTimer = 0;
    this.wanderX = randomRange(-1, 1);
    this.wanderY = randomRange(-1, 1);
    this.desiredX = 0;
    this.desiredY = 0;
    this.steerX = 0;
    this.steerY = 0;
    this.splitCooldownUntil = 0;
  }

  setDesiredVector(x, y, magnitude = 260) {
    const direction = normalize(x, y);
    if (!direction.length) {
      this.desiredX = 0;
      this.desiredY = 0;
      return;
    }

    this.desiredX = direction.x * magnitude;
    this.desiredY = direction.y * magnitude;
  }

  chooseDirection(food, actors, viruses, deltaMs, now) {
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
      this.setDesiredVector(center.x - dangerVirus.x, center.y - dangerVirus.y, 320);
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
      this.setDesiredVector(center.x - target.x, center.y - target.y, 340);
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
        if (this.split(dx, dy, now)) this.splitCooldownUntil = now + 3800;
      }

      this.setDesiredVector(dx, dy, 300);
      return;
    }

    let nearestFood = null;
    let nearestFoodDistance = 500 * 500;

    for (const pellet of food) {
      const d2 = distanceSquared(center, pellet);
      if (d2 < nearestFoodDistance) {
        nearestFood = pellet;
        nearestFoodDistance = d2;
      }
    }

    if (nearestFood) {
      this.setDesiredVector(nearestFood.x - center.x, nearestFood.y - center.y, 250);
      return;
    }

    this.wanderTimer -= deltaMs;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = randomRange(900, 2200);
      this.wanderX = randomRange(-1, 1);
      this.wanderY = randomRange(-1, 1);
    }

    this.setDesiredVector(this.wanderX, this.wanderY, 220);
  }

  updateAI(food, actors, viruses, deltaMs, now) {
    if (!this.alive) return;

    this.decisionTimer -= deltaMs;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = randomRange(120, 210);
      this.chooseDirection(food, actors, viruses, deltaMs, now);
    }

    // Smooth steering so bots do not snap between food, prey, threats, and viruses.
    const blend = 1 - Math.exp(-deltaMs / 105);
    this.steerX += (this.desiredX - this.steerX) * blend;
    this.steerY += (this.desiredY - this.steerY) * blend;

    this.update(deltaMs, this.steerX, this.steerY, now);
  }
}
