import { BlobActor } from "./player.js";
import {
  MAX_CELLS,
  SPLIT_MIN_MASS,
  VIRUS_TRIGGER_MASS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  distanceSquared,
  normalize,
  randomRange
} from "./physics.js";

const FOOD_BINS = 12;
const MEMORY_TTL = 1800;
const FRIEND_MIN_DURATION = 9000;
const FRIEND_MAX_DURATION = 18000;

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
    this.sociability = randomRange(0.72, 1.28);

    // Social memory. Bots can temporarily ally, orbit one another and perform split dances.
    this.friendActorId = null;
    this.friendUntil = 0;
    this.socialCheckAt = randomRange(1200, 3600);
    this.nextDanceAt = randomRange(3000, 7000);
    this.danceDirection = Math.random() < 0.5 ? -1 : 1;
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
    this.friendActorId = null;
    this.friendUntil = 0;
    this.socialCheckAt = performance.now() + randomRange(1400, 3800);
    this.nextDanceAt = performance.now() + randomRange(2800, 7200);
    this.danceDirection = Math.random() < 0.5 ? -1 : 1;
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

  clearFriend() {
    this.friendActorId = null;
    this.friendUntil = 0;
  }

  isFriendlyWith(actor, now) {
    if (!actor || this.friendActorId !== actor.id || now >= this.friendUntil) return false;
    if (!actor.alive || !this.alive) return false;

    // Alliances naturally break if one side becomes overwhelmingly larger.
    const ratio = this.totalMass / Math.max(1, actor.totalMass);
    return ratio > 0.38 && ratio < 2.65;
  }

  befriend(actor, now, duration = randomRange(FRIEND_MIN_DURATION, FRIEND_MAX_DURATION)) {
    if (!actor || actor === this || !actor.alive) return false;

    this.friendActorId = actor.id;
    this.friendUntil = now + duration;
    this.targetActorId = null;
    this.targetLockUntil = 0;
    this.state = "social";
    this.nextDanceAt = Math.max(this.nextDanceAt, now + randomRange(1800, 4200));

    // Bot-to-bot friendships are reciprocal so both sides stop treating each other as prey.
    if (actor instanceof Bot) {
      const partnerBusy = actor.friendActorId && actor.friendActorId !== this.id && now < actor.friendUntil;
      if (!partnerBusy) {
        actor.friendActorId = this.id;
        actor.friendUntil = Math.max(actor.friendUntil, now + duration);
        actor.targetActorId = null;
        actor.targetLockUntil = 0;
        actor.nextDanceAt = Math.max(actor.nextDanceAt, now + randomRange(2200, 4800));
      }
    }

    return true;
  }

  getFriend(actors, now) {
    if (!this.friendActorId || now >= this.friendUntil) {
      this.clearFriend();
      return null;
    }

    const friend = actors.find((actor) => actor.id === this.friendActorId && actor.alive);
    if (!friend || !this.isFriendlyWith(friend, now)) {
      this.clearFriend();
      return null;
    }

    const distance = Math.hypot(friend.center.x - this.center.x, friend.center.y - this.center.y);
    if (distance > 1650) {
      this.clearFriend();
      return null;
    }

    return friend;
  }

  tryFindFriend(actors, now) {
    if (now < this.socialCheckAt || this.friendActorId) return null;
    this.socialCheckAt = now + randomRange(2600, 5200) / this.sociability;

    let candidate = null;
    let bestScore = -Infinity;

    for (const other of actors) {
      if (!(other instanceof Bot) || other === this || !other.alive || !other.largestCell) continue;

      const dx = other.center.x - this.center.x;
      const dy = other.center.y - this.center.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 150 || distance > 620) continue;

      const ratio = other.totalMass / Math.max(1, this.totalMass);
      if (ratio < 0.58 || ratio > 1.72) continue;

      const massSimilarity = 1 - Math.min(1, Math.abs(Math.log(ratio)) / 0.55);
      const proximity = 1 - distance / 620;
      const otherFree = !other.friendActorId || now >= other.friendUntil;
      const score = massSimilarity * 1.4 + proximity * 1.1 + (otherFree ? 0.45 : -0.5);

      if (score > bestScore) {
        bestScore = score;
        candidate = other;
      }
    }

    if (!candidate) return null;

    // Not every compatible encounter becomes an alliance; personality controls frequency.
    const chance = Math.min(0.72, 0.28 * this.sociability + Math.max(0, bestScore - 1.35) * 0.18);
    if (Math.random() > chance) return null;

    this.befriend(candidate, now);
    return candidate;
  }

  runSocialBehavior(friend, actors, viruses, now) {
    if (!friend || !friend.alive || !this.largestCell) return false;

    const center = this.center;
    const friendCenter = friend.center;
    const dx = friendCenter.x - center.x;
    const dy = friendCenter.y - center.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const direction = normalize(dx, dy);

    // If separated, regroup first. This makes allied bots visibly travel together.
    if (distance > 560) {
      this.state = "rejoin";
      this.setDesiredVector(dx, dy, 290);
      return true;
    }

    const largest = this.largestCell;
    const friendLargest = friend.largestCell;
    const safeSplit =
      friendLargest &&
      largest.mass >= SPLIT_MIN_MASS * 1.45 &&
      this.cells.length <= 2 &&
      now >= this.splitCooldownUntil &&
      now >= this.nextDanceAt &&
      distance > 145 &&
      distance < 390;

    if (safeSplit) {
      // Split tangentially instead of directly into the friend: this creates an Agar-style "split dance".
      const tangentX = -direction.y * this.danceDirection;
      const tangentY = direction.x * this.danceDirection;
      const outwardX = -direction.x * 0.28;
      const outwardY = -direction.y * 0.28;
      const splitX = tangentX + outwardX;
      const splitY = tangentY + outwardY;

      // Do not dance-split into a dangerous virus or a much larger third party.
      let unsafe = false;
      const projected = {
        x: center.x + splitX * 210,
        y: center.y + splitY * 210
      };

      for (const virus of viruses) {
        if (largest.mass / 2 >= VIRUS_TRIGGER_MASS && distanceSquared(projected, virus) < 210 * 210) {
          unsafe = true;
          break;
        }
      }

      if (!unsafe) {
        for (const other of actors) {
          if (other === this || other === friend || !other.alive || !other.largestCell) continue;
          if (other.largestCell.mass < largest.mass * 0.62) continue;
          if (distanceSquared(projected, other.center) < 360 * 360) {
            unsafe = true;
            break;
          }
        }
      }

      if (!unsafe && this.split(splitX, splitY, now)) {
        this.state = "dance-split";
        this.splitCooldownUntil = now + randomRange(3300, 4700);
        this.nextDanceAt = now + randomRange(6500, 11000) / this.sociability;
        this.danceDirection *= -1;

        // Encourage the partner to answer the dance shortly afterward rather than simultaneously.
        if (friend instanceof Bot) {
          friend.nextDanceAt = Math.min(friend.nextDanceAt, now + randomRange(650, 1250));
          friend.danceDirection = -this.danceDirection;
        }
      }
    }

    // Orbit the friend with a soft radial correction. It reads as playful teaming rather than collision jitter.
    const combinedRadius = (largest?.radius || 30) + (friendLargest?.radius || 30);
    const preferredDistance = Math.max(185, Math.min(320, combinedRadius + 95));
    const radialError = (distance - preferredDistance) / preferredDistance;
    const tangentX = -direction.y * this.danceDirection;
    const tangentY = direction.x * this.danceDirection;
    const edge = this.getEdgeRepulsion(center);

    this.state = this.state === "dance-split" ? this.state : "social";
    this.setDesiredVector(
      tangentX * 1.05 + direction.x * radialError * 1.65 + edge.x * 1.4,
      tangentY * 1.05 + direction.y * radialError * 1.65 + edge.y * 1.4,
      245
    );
    return true;
  }

  evaluateThreats(actors, viruses, observations, now) {
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
      if (this.isFriendlyWith(other, now)) continue;

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
      if (this.isFriendlyWith(other, now)) continue;

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
      if (this.isFriendlyWith(other, now)) continue;
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

    const friend = this.getFriend(actors, now) || this.tryFindFriend(actors, now);
    const danger = this.evaluateThreats(actors, viruses, observations, now);

    // Survival still outranks friendship. A dancing bot should stop dancing when danger appears.
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

    if (friend && this.runSocialBehavior(friend, actors, viruses, now)) return;

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
      const urgentStates = new Set(["flee", "hunt", "split-hunt", "dance-split"]);
      const urgency = urgentStates.has(this.state) ? 0.72 : 1;
      this.decisionTimer = randomRange(135, 235) * urgency;
      this.chooseDirection(food, actors, viruses, deltaMs, now);
    }

    // Smooth steering gives the bot intent without making movement look robotic.
    const response = this.state === "flee" ? 72 : this.state === "hunt" || this.state === "dance-split" ? 88 : 125;
    const blend = 1 - Math.exp(-deltaMs / response);
    this.steerX += (this.desiredX - this.steerX) * blend;
    this.steerY += (this.desiredY - this.steerY) * blend;

    this.update(deltaMs, this.steerX, this.steerY, now);
  }
}
