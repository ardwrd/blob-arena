import {
  EJECT_COST,
  EJECT_MIN_MASS,
  EJECTED_MASS,
  MAX_CELLS,
  SPLIT_MIN_MASS,
  START_MASS,
  VIRUS_MASS,
  keepInsideWorld,
  massToRadius,
  mergeDelayForMass,
  normalize,
  randomColor,
  randomSpawn,
  speedForMass
} from "./physics.js";

let actorSequence = 0;

export class Cell {
  constructor({ x, y, mass = START_MASS, color = randomColor(), mergeAt = 0, boostX = 0, boostY = 0 } = {}) {
    const spawn = randomSpawn();
    this.x = x ?? spawn.x;
    this.y = y ?? spawn.y;
    this.mass = mass;
    this.color = color;
    this.mergeAt = mergeAt;
    this.boostX = boostX;
    this.boostY = boostY;
  }

  get radius() {
    return massToRadius(this.mass);
  }

  get speed() {
    return speedForMass(this.mass);
  }

  grow(amount) {
    this.mass += Math.max(0, amount);
  }

  update(deltaMs, targetX, targetY) {
    const direction = normalize(targetX, targetY);
    const frameScale = Math.min(2.4, deltaMs / 16.667);

    if (direction.length) {
      const distanceFactor = Math.min(1, direction.length / 110);
      const step = this.speed * distanceFactor * frameScale;
      this.x += direction.x * step;
      this.y += direction.y * step;
    }

    if (Math.abs(this.boostX) > 0.01 || Math.abs(this.boostY) > 0.01) {
      this.x += this.boostX * frameScale;
      this.y += this.boostY * frameScale;
      const damping = Math.pow(0.88, frameScale);
      this.boostX *= damping;
      this.boostY *= damping;
    }

    keepInsideWorld(this);
  }

  draw(ctx, zoom, label = "", showMass = false) {
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

    if (label && r * zoom > 18) {
      ctx.fillStyle = "#081020";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${Math.max(11 / zoom, Math.min(22 / zoom, r * .34))}px Inter, system-ui, sans-serif`;
      ctx.fillText(label, this.x, this.y - 1 / zoom);

      if (showMass && r * zoom > 34) {
        ctx.fillStyle = "rgba(8,16,32,.66)";
        ctx.font = `700 ${Math.max(8 / zoom, 11 / zoom)}px Inter, system-ui, sans-serif`;
        ctx.fillText(Math.round(this.mass), this.x, this.y + 15 / zoom);
      }
    }

    ctx.restore();
  }
}

export class BlobActor {
  constructor({ name = "Blob", mass = START_MASS, color = randomColor(), isHuman = false } = {}) {
    this.id = `actor-${++actorSequence}`;
    this.name = name;
    this.color = color;
    this.isHuman = isHuman;
    this.cells = [];
    this.reset({ name, mass, color });
  }

  get alive() {
    return this.cells.length > 0;
  }

  get totalMass() {
    return this.cells.reduce((sum, cell) => sum + cell.mass, 0);
  }

  get largestCell() {
    return this.cells.reduce((largest, cell) => !largest || cell.mass > largest.mass ? cell : largest, null);
  }

  get center() {
    if (!this.cells.length) return { x: 0, y: 0 };
    const total = Math.max(1, this.totalMass);
    let x = 0;
    let y = 0;
    for (const cell of this.cells) {
      x += cell.x * cell.mass;
      y += cell.y * cell.mass;
    }
    return { x: x / total, y: y / total };
  }

  reset({ name = this.name, mass = START_MASS, color = this.color } = {}) {
    const spawn = randomSpawn(300);
    this.name = name;
    this.color = color;
    this.cells = [new Cell({ x: spawn.x, y: spawn.y, mass, color })];
  }

  update(deltaMs, targetX, targetY, now) {
    for (const cell of this.cells) cell.update(deltaMs, targetX, targetY);
    this.resolveOwnCells(now);
  }

  resolveOwnCells(now) {
    for (let i = this.cells.length - 1; i >= 0; i -= 1) {
      const a = this.cells[i];
      if (!a) continue;

      for (let j = i - 1; j >= 0; j -= 1) {
        const b = this.cells[j];
        if (!b) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        const canMerge = now >= a.mergeAt && now >= b.mergeAt;
        const mergeDistance = Math.max(a.radius, b.radius) * 0.5;

        if (canMerge && distance <= mergeDistance) {
          const total = a.mass + b.mass;
          a.x = (a.x * a.mass + b.x * b.mass) / total;
          a.y = (a.y * a.mass + b.y * b.mass) / total;
          a.mass = total;
          a.mergeAt = 0;
          this.cells.splice(j, 1);
          i -= 1;
          break;
        }

        const minimumDistance = (a.radius + b.radius) * 0.78;
        if (!canMerge && distance < minimumDistance) {
          const overlap = (minimumDistance - distance) * 0.5;
          const nx = dx / distance;
          const ny = dy / distance;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          keepInsideWorld(a);
          keepInsideWorld(b);
        }
      }
    }
  }

  split(targetX, targetY, now) {
    if (this.cells.length >= MAX_CELLS) return 0;
    const direction = normalize(targetX, targetY);
    const dx = direction.length ? direction.x : 1;
    const dy = direction.length ? direction.y : 0;
    const candidates = [...this.cells].sort((a, b) => b.mass - a.mass);
    let created = 0;

    for (const cell of candidates) {
      if (this.cells.length >= MAX_CELLS) break;
      if (cell.mass < SPLIT_MIN_MASS) continue;

      const half = cell.mass / 2;
      cell.mass = half;
      const mergeAt = now + mergeDelayForMass(half);
      cell.mergeAt = mergeAt;
      const offset = cell.radius * 0.7;
      const child = new Cell({
        x: cell.x + dx * offset,
        y: cell.y + dy * offset,
        mass: half,
        color: this.color,
        mergeAt,
        boostX: dx * 18,
        boostY: dy * 18
      });
      keepInsideWorld(child);
      this.cells.push(child);
      created += 1;
    }

    return created;
  }

  eject(targetX, targetY, now) {
    const direction = normalize(targetX, targetY);
    if (!direction.length) return [];
    const masses = [];

    for (const cell of this.cells) {
      if (cell.mass < EJECT_MIN_MASS + EJECT_COST) continue;
      cell.mass -= EJECT_COST;
      const radius = cell.radius;
      masses.push({
        x: cell.x + direction.x * (radius + 12),
        y: cell.y + direction.y * (radius + 12),
        mass: EJECTED_MASS,
        color: this.color,
        vx: direction.x * 20,
        vy: direction.y * 20,
        ownerId: this.id,
        bornAt: now
      });
    }

    return masses;
  }

  explodeOnVirus(cell, now) {
    const index = this.cells.indexOf(cell);
    if (index < 0) return false;

    const available = MAX_CELLS - (this.cells.length - 1);
    if (available <= 1) {
      cell.grow(VIRUS_MASS * 0.35);
      return true;
    }

    const totalMass = cell.mass + VIRUS_MASS * 0.6;
    const pieces = Math.min(available, 8, Math.max(2, Math.floor(totalMass / 18)));
    const pieceMass = totalMass / pieces;
    const mergeAt = now + mergeDelayForMass(pieceMass);
    const generated = [];

    for (let i = 0; i < pieces; i += 1) {
      const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.28;
      const speed = 10 + Math.random() * 8;
      generated.push(new Cell({
        x: cell.x,
        y: cell.y,
        mass: pieceMass,
        color: this.color,
        mergeAt,
        boostX: Math.cos(angle) * speed,
        boostY: Math.sin(angle) * speed
      }));
    }

    this.cells.splice(index, 1, ...generated);
    return true;
  }

  removeCell(cell) {
    const index = this.cells.indexOf(cell);
    if (index >= 0) this.cells.splice(index, 1);
  }
}

export class Player extends BlobActor {}
