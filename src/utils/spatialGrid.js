/**
 * Simple spatial grid for efficient 3D range queries
 * Divides space into cubic cells for fast neighbor lookups
 */
export class SpatialGrid {
  constructor(worldSize, cellSize) {
    this.worldSize = worldSize;
    this.cellSize = cellSize;
    this.gridSize = Math.ceil(worldSize / cellSize);
    this.grid = new Map();
  }

  /**
   * Convert world position to grid coordinates
   */
  _getGridKey(x, y, z) {
    const gx = Math.floor((x + this.worldSize / 2) / this.cellSize);
    const gy = Math.floor((y + this.worldSize / 2) / this.cellSize);
    const gz = Math.floor((z + this.worldSize / 2) / this.cellSize);
    return `${gx},${gy},${gz}`;
  }

  /**
   * Clear the grid
   */
  clear() {
    this.grid.clear();
  }

  /**
   * Add an item to the grid
   */
  add(x, y, z, item) {
    const key = this._getGridKey(x, y, z);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key).push(item);
  }

  /**
   * Query items within a radius of a point
   * Returns all items in cells that might intersect with the query sphere
   */
  query(x, y, z, radius) {
    const results = [];
    const cellRadius = Math.ceil(radius / this.cellSize);
    
    const gx = Math.floor((x + this.worldSize / 2) / this.cellSize);
    const gy = Math.floor((y + this.worldSize / 2) / this.cellSize);
    const gz = Math.floor((z + this.worldSize / 2) / this.cellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dz = -cellRadius; dz <= cellRadius; dz++) {
          const key = `${gx + dx},${gy + dy},${gz + dz}`;
          const cell = this.grid.get(key);
          if (cell) {
            results.push(...cell);
          }
        }
      }
    }

    return results;
  }
}
