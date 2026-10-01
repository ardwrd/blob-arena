import { BlobActor } from "./player.js";
import {
  MAX_CELLS,
  VIRUS_TRIGGER_MASS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  distanceSquared,
  normalize,
  randomRange
} from "./physics.js";

const FOOD_BINS = 12;
const MEMORY_TTL = 1800;

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
    this.state = "forage";
    this.targetActorId = null;
    this.targetLockUntil = 0;
    this.actorMemory = new Map();

    // Each bot gets a small personality variation so the arena does not feel scripted.
    this.aggression = randomRange(0.84, 1.18);
    this.caution = randomRange(0.9, 1.22);
    this.greed = randomRange(0.9, 1.15);
  }

  reset(options = {}) {
    super.reset(options);
    this.decisionTimer = 0;
    this.wanderTimer = 0;
    this.desiredX = 0;
    this.desiredY = 0;
    this.steerX = 0;
    this.steerY = 0;
    this.state = "forage";
    this.targetActorId = null;
    this.targetLockUntil = 0;
    this.actorMemory?.clear();
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

  rememberActor(actor, now) {
    const center = actor.center;
    const previous = this.actorMemory.get(actor.id);
    let vx = 0;
    let vy = 0;

    if (previous) {
      const elapsed = Math.max(16, now - previous.time) / 1000;
      vx = (center.x - previous.x) / elapsed;
      vy = (center.y - previous.y) / elapsed;

      // Damp noisy estimates caused by split boosts and collision corrections.
      vx = previous.vx * 0.45 + vx * 0.55;
      vy = previous.vy * 0.45 + vy * 0.55;
    }

    const observation = { x: center.x, y: center.y, vx, vy, time: now };
    this.actorMemory.set(actor.id, observation);
    return observation;
  }

  pruneMemory(now) {
    for (const [id, memory] of this.actorMemory) {
      if (now - memory.time > MEMORY_TTL) this.actorMemory.delete(id);
    }
  }

  predictActor(actor, observation, horizon = 0.24) {
    const center = actor.center;
    if (!observation) return center;

    return {
      x: center.x + observation.vx * horizon,
      y: center.y + observation.vy * horizon
    };
  }

  getEdgeRepulsion(center) {
    const margin = 420;
    let x = 0;
    let y = 0;

    if (center.x < margin) x += (margin - center.x) / margin;
    if (center.x > WORLD_WIDTH - margin) x -= (center.x - (WORLD_WIDTH - margin)) / margin;
    if (center.y < margin) y += (margin - center.y) / margin;
    if (center.y > WORLD_HEIGHT - margin) y -= (center.y - (WORLD_HEIGHT - margin)) / margin;

    return { x, y, strength: Math.hypot(x, y) };
  }

  evaluateThreats(actors, viruses, observations) {
    const center = this.center;
    const largest = this.largestCell;
    let escapeX = 0;
    let escapeY = 0;
    let dangerScore = 0;
    let nearestThreat = null;
    let nearestThreatDistance = Infinity;

    if (!largest) {
      return { escapeX: 0, escapeY: 0, dangerScore: 0, nearestThreat: null, nearestThreatDistance: Infinity };
    }

    for (const other of actors) {
      if (other === this || !other.alive || !other.largestCell) continue;

      const enemyLargest = other.largestCell;
      const ratio = enemyLargest.mass / Math.max(1, largest.mass);
      if (ratio < 1.12) continue;

      const target = this.predictActor(other, observations.get(other.id), 0.16);
      const dx = center.x - target.x;
      const dy = center.y - target.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance > 1050) continue;

      const proximity = Math.pow(Math.max(0, 1 - distance / 1100), 1.55);
      const weight = proximity * (0.9 + (ratio - 1) * 1.7) * this.caution;
      escapeX += (dx / distance) * weight;
      escapeY += (dy / distance) * weight;
      dangerScore += weight;

      if (distance < nearestThreatDistance) {
        nearestThreat = other;
        nearestThreatDistance = distance;
      }
    }

    // Large cells treat viruses as hazards. At the cell cap, a virus becomes much less dangerous.
    if (largest.mass >= VIRUS_TRIGGER_MASS && this.cells.length < MAX_CELLS) {
      for (const virus of viruses) {
        const dx = center.x - virus.x;
        const dy = center.y - virus.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        if (distance > 520) continue;

        const weight = Math.pow(Math.max(0, 1 - distance / 540), 1.35) * 2.1;
        escapeX += (dx / distance) * weight;
        escapeY += (dy / distance) * weight;
        dangerScore += weight * 0.72;
      }
    }

    const edge = this.getEdgeRepulsion(center);
    if (edge.strength > 0) {
      escapeX += edge.x * 1.45;
      escapeY += edge.y * 1.45;
      dangerScore += edge.strength * 0.55;
    }

    return { escapeX, escapeY, dangerScore, nearestThreat, nearestThreatDistance };
  }

  findVirusCover(viruses, threat) {
    if (!threat || !this.largestCell || this.largestCell.mass >= VIRUS_TRIGGER_MASS) return null;

    const center = this.center;
    const threatCenter = threat.center;
    const awayX = center.x - threatCenter.x;
    const awayY = center.y - threatCenter.y;
    const away = normalize(awayX, awayY);
    let best = null;
    let bestScore = -Infinity;

    for (const virus of viruses) {
      const dx = virus.x - center.x;
      const dy = virus.y - center.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 620 || distance < 30) continue;

      const direction = normalize(dx, dy);
      const alignment = direction.x * away.x + direction.y * away.y;
      const score = alignment * 2.2 + (1 - distance / 620) * 1.4;

      if (score > bestScore) {
        bestScore = score;
        best = virus;
      }
    }

    return bestScore > -0.2 ? best : null;
  }

  findBestPrey(actors, observations, now) {
    const center = this.center;
    const largest = this.largestCell;
    if (!largest) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const other of actors) {
      if (other === this || !other.alive || !other.largestCell) continue;

      const preyCell = other.largestCell;
      const massRatio = largest.mass / Math.max(1, preyCell.mass);
      if (massRatio < 1.18) continue;

      const observation = observations.get(other.id);
      const predicted = this.predictActor(other, observation, 0.24);
      const dx = predicted.x - center.x;
      const dy = predicted.y - center.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 880) continue;

      const sizeValue = Math.min(3.5, massRatio - 1) * 0.9;
      const distanceValue = Math.max(0, 1 - distance / 900) * 2.7;
      const mealValue = Math.min(2, other.totalMass / Math.max(1, this.totalMass)) * 0.65;
      const lockBonus = this.targetActorId === other.id && now < this.targetLockUntil ? 0.8 : 0;
      const score = (sizeValue + distanceValue + mealValue + lockBonus) * this.aggression;

      if (score > bestScore) {
        bestScore = score;
        best = { actor: other, preyCell, predicted, distance, massRatio, score };
      }
    }

    return best;
  }

  canSplitAttack(prey, actors, viruses, now) {
    const largest = this.largestCell;
    if (!largest || !prey?.preyCell) return false;
    if (now < this.splitCooldownUntil || this.cells.length >= Math.min(10, MAX_CELLS)) return false;

    // After splitting, one half must still comfortably be able to eat the target cell.
    if (largest.mass / 2 < prey.preyCell.mass * 1.16) return false;

    const splitReach = Math.min(420, 155 + largest.radius * 4.4);
    if (prey.distance > splitReach) return false;

    const predictedX = prey.predicted.x;
    const predictedY = prey.predicted.y;
    if (predictedX < 120 || predictedX > WORLD_WIDTH - 120 || predictedY < 120 || predictedY > WORLD_HEIGHT - 120) {
      return false;
    }

    // Do not throw half our mass into a nearby larger enemy.
    for (const other of actors) {
      if (other === this || other === prey.actor || !other.alive || !other.largestCell) continue;
      if (other.largestCell.mass < largest.mass * 0.58) continue;
      if (distanceSquared(other.center, prey.predicted) < 430 * 430) return false;
    }

    // Avoid splitting straight into a virus when the resulting cell is large enough to trigger it.
    if (largest.mass / 2 >= VIRUS_TRIGGER_MASS) {
      for (const virus of viruses) {
        if (distanceSquared(virus, prey.predicted) < 210 * 210) return false;
      }
    }

    return true;
  }

  findFoodCluster(food) {
    const center = this.center;
    const bins = Array.from({ length: FOOD_BINS }, () => ({ score: 0, x: 0, y: 0, weight: 0 }));
    const scanRadius = 720;

    for (const pellet of food) {
      const dx = pellet.x - center.x;
      const dy = pellet.y - center.y;
      const distance = Math.hypot(dx, dy);
      if (distance > scanRadius || distance < 1) continue;

      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += Math.PI * 2;
      const index = Math.min(FOOD_BINS - 1, Math.floor((angle / (Math.PI * 2)) * FOOD_BINS));
      const distanceWeight = Math.pow(1 - distance / scanRadius, 1.55);
      const value = Math.max(0.5, pellet.value || 1);
      const weight = distanceWeight * value;
      const bin = bins[index];

      bin.score += weight;
      bin.x += pellet.x * weight;
      bin.y += pellet.y * weight;
      bin.weight += weight;
    }

    let best = null;
    for (const bin of bins) {
      if (!bin.weight) continue;
      const score = bin.score * this.greed;
      if (!best || score > best.score) {
        best = {
          score,
          x: bin.x / bin.weight,
          y: bin.y / bin.weight
        };
      }
    }

    return best;
  }

  chooseDirection(food, actors, viruses, deltaMs, now) {
    const center = this.center;
    const observations = new Map();

    for (const actor of actors) {
      if (actor === this || !actor.alive) continue;
      observations.set(actor.id, this.rememberActor(actor, now));
    }
    this.pruneMemory(now);

    const danger = this.evaluateThreats(actors, viruses, observations);

    if (danger.dangerScore > 0.72) {
      const cover = this.findVirusCover(viruses, danger.nearestThreat);

      if (cover && danger.nearestThreatDistance < 720) {
        this.state = "cover";
        this.targetActorId = null;
        this.setDesiredVector(cover.x - center.x, cover.y - center.y, 360);
        return;
      }

      this.state = "flee";
      this.targetActorId = null;
      this.setDesiredVector(danger.escapeX, danger.escapeY, 390);
      return;
    }

    const prey = this.findBestPrey(actors, observations, now);
    if (prey && prey.score > 1.85) {
      const dx = prey.predicted.x - center.x;
      const dy = prey.predicted.y - center.y;

      this.state = "hunt";
      this.targetActorId = prey.actor.id;
      this.targetLockUntil = now + randomRange(650, 1050);

      if (this.canSplitAttack(prey, actors, viruses, now)) {
        if (this.split(dx, dy, now)) {
          this.splitCooldownUntil = now + randomRange(3000, 4300) / this.aggression;
          this.state = "split-hunt";
        }
      }

      this.setDesiredVector(dx, dy, 330);
      return;
    }

    const foodCluster = this.findFoodCluster(food);
    if (foodCluster && foodCluster.score > 0.08) {
      this.state = "forage";
      this.targetActorId = null;
      this.setDesiredVector(foodCluster.x - center.x, foodCluster.y - center.y, 265);
      return;
    }

    this.state = "wander";
    this.targetActorId = null;
    this.wanderTimer -= deltaMs;

    if (this.wanderTimer <= 0) {
      this.wanderTimer = randomRange(1100, 2600);
      this.wanderX = randomRange(-1, 1);
      this.wanderY = randomRange(-1, 1);
    }

    const edge = this.getEdgeRepulsion(center);
    this.setDesiredVector(
      this.wanderX + edge.x * 1.8,
      this.wanderY + edge.y * 1.8,
      230
    );
  }

  updateAI(food, actors, viruses, deltaMs, now) {
    if (!this.alive) return;

    this.decisionTimer -= deltaMs;
    if (this.decisionTimer <= 0) {
      const urgency = this.state === "flee" || this.state === "hunt" ? 0.72 : 1;
      this.decisionTimer = randomRange(135, 235) * urgency;
      this.chooseDirection(food, actors, viruses, deltaMs, now);
    }

    // Smooth steering gives the bot intent without making movement look robotic.
    const response = this.state === "flee" ? 72 : this.state === "hunt" ? 88 : 125;
    const blend = 1 - Math.exp(-deltaMs / response);
    this.steerX += (this.desiredX - this.steerX) * blend;
    this.steerY += (this.desiredY - this.steerY) * blend;

    this.update(deltaMs, this.steerX, this.steerY, now);
  }
}
