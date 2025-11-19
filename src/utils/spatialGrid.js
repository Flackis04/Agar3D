// 3D Spatial Grid for efficient collision detection
export class SpatialGrid {
  constructor(worldSize, cellSize) {
    this.worldSize = worldSize;
    this.cellSize = cellSize;
    this.halfWorld = worldSize / 2;
    this.gridDimension = Math.ceil(worldSize / cellSize);
    this.grid = new Map(); // Use Map for sparse grid
  }

  // Convert world position to grid coordinates
  _getGridCoords(x, y, z) {
    const gx = Math.floor((x + this.halfWorld) / this.cellSize);
    const gy = Math.floor((y + this.halfWorld) / this.cellSize);
    const gz = Math.floor((z + this.halfWorld) / this.cellSize);
    return { gx, gy, gz };
  }

  // Convert grid coordinates to cell key
  _getCellKey(gx, gy, gz) {
    return `${gx},${gy},${gz}`;
  }

  // Get cell key from world position
  getCellKeyFromPosition(x, y, z) {
    const { gx, gy, gz } = this._getGridCoords(x, y, z);
    return this._getCellKey(gx, gy, gz);
  }

  // Clear all cells
  clear() {
    this.grid.clear();
  }

  // Add item to grid
  addItem(index, x, y, z) {
    const key = this.getCellKeyFromPosition(x, y, z);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key).push(index);
  }

  // Get all items in cells within radius of position
  getItemsInRadius(x, y, z, radius) {
    const { gx, gy, gz } = this._getGridCoords(x, y, z);
    const cellRadius = Math.ceil(radius / this.cellSize);
    const items = [];

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dz = -cellRadius; dz <= cellRadius; dz++) {
          const key = this._getCellKey(gx + dx, gy + dy, gz + dz);
          const cellItems = this.grid.get(key);
          if (cellItems) {
            items.push(...cellItems);
          }
        }
      }
    }

    return items;
  }

  // Build grid from pellet data
  buildFromPelletData(pelletData) {
    this.clear();
    const { positions, active } = pelletData;
    
    for (let i = 0; i < positions.length; i++) {
      if (!active[i]) continue;
      const pos = positions[i];
      this.addItem(i, pos.x, pos.y, pos.z);
    }
  }

  // Update single pellet position in grid
  updateItem(index, oldX, oldY, oldZ, newX, newY, newZ) {
    const oldKey = this.getCellKeyFromPosition(oldX, oldY, oldZ);
    const newKey = this.getCellKeyFromPosition(newX, newY, newZ);

    if (oldKey === newKey) return; // Same cell, no update needed

    // Remove from old cell
    const oldCell = this.grid.get(oldKey);
    if (oldCell) {
      const idx = oldCell.indexOf(index);
      if (idx > -1) {
        oldCell.splice(idx, 1);
        if (oldCell.length === 0) {
          this.grid.delete(oldKey);
        }
      }
    }

    // Add to new cell
    if (!this.grid.has(newKey)) {
      this.grid.set(newKey, []);
    }
    this.grid.get(newKey).push(index);
  }
}
