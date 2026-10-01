export class SpatialGrid {
  constructor(cellSize = 320) {
    this.cellSize = cellSize;
    this.buckets = new Map();
  }

  keyFor(x, y) {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    return `${gx}:${gy}`;
  }

  add(item) {
    const key = this.keyFor(item.x, item.y);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    bucket.push(item);
  }

  rebuild(items) {
    this.buckets.clear();
    for (const item of items) this.add(item);
  }

  relocate(item, oldX, oldY) {
    const oldKey = this.keyFor(oldX, oldY);
    const newKey = this.keyFor(item.x, item.y);
    if (oldKey === newKey) return;

    const oldBucket = this.buckets.get(oldKey);
    if (oldBucket) {
      const index = oldBucket.indexOf(item);
      if (index >= 0) oldBucket.splice(index, 1);
      if (!oldBucket.length) this.buckets.delete(oldKey);
    }

    this.add(item);
  }

  queryRect(left, top, right, bottom) {
    const minX = Math.floor(left / this.cellSize);
    const maxX = Math.floor(right / this.cellSize);
    const minY = Math.floor(top / this.cellSize);
    const maxY = Math.floor(bottom / this.cellSize);
    const results = [];

    for (let gx = minX; gx <= maxX; gx += 1) {
      for (let gy = minY; gy <= maxY; gy += 1) {
        const bucket = this.buckets.get(`${gx}:${gy}`);
        if (bucket) results.push(...bucket);
      }
    }

    return results;
  }

  queryCircle(x, y, radius) {
    return this.queryRect(x - radius, y - radius, x + radius, y + radius);
  }
}
