
export class SpatialGrid {
  constructor(worldSize, voxelSize) {
    this.worldSize = worldSize;
    this.voxelSize = voxelSize;
    this.halfWorld = worldSize / 2;
    this.gridDimension = Math.ceil(worldSize / voxelSize);
    this.grid = new Map(); 
  }

  
  _getGridCoords(x, y, z) {
    const gx = Math.floor((x + this.halfWorld) / this.voxelSize);
    const gy = Math.floor((y + this.halfWorld) / this.voxelSize);
    const gz = Math.floor((z + this.halfWorld) / this.voxelSize);
    return { gx, gy, gz };
  }

  
  _getVoxelKey(gx, gy, gz) {
    return `${gx},${gy},${gz}`;
  }

  
  getVoxelKeyFromPosition(x, y, z) {
    const { gx, gy, gz } = this._getGridCoords(x, y, z);
    return this._getVoxelKey(gx, gy, gz);
  }

  
  clear() {
    this.grid.clear();
  }

  
  addItem(index, x, y, z) {
    const key = this.getVoxelKeyFromPosition(x, y, z);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key).push(index);
  }

  
  getItemsInRadius(x, y, z, radius) {
    const { gx, gy, gz } = this._getGridCoords(x, y, z);
    const voxelRadius = Math.ceil(radius / this.voxelSize);
    const items = [];

    for (let dx = -voxelRadius; dx <= voxelRadius; dx++) {
      for (let dy = -voxelRadius; dy <= voxelRadius; dy++) {
        for (let dz = -voxelRadius; dz <= voxelRadius; dz++) {
          const key = this._getVoxelKey(gx + dx, gy + dy, gz + dz);
          const voxelItems = this.grid.get(key);
          if (voxelItems) {
            items.push(...voxelItems);
          }
        }
      }
    }

    return items;
  }

  
  buildFromPelletData(pelletData) {
    this.clear();
    const { positions, active } = pelletData;
    
    for (let i = 0; i < positions.length; i++) {
      if (!active[i]) continue;
      const pos = positions[i];
      this.addItem(i, pos.x, pos.y, pos.z);
    }
  }

  
  updateItem(index, oldX, oldY, oldZ, newX, newY, newZ) {
    const oldKey = this.getVoxelKeyFromPosition(oldX, oldY, oldZ);
    const newKey = this.getVoxelKeyFromPosition(newX, newY, newZ);

    if (oldKey === newKey) return; 

    
    const oldVoxel = this.grid.get(oldKey);
    if (oldVoxel) {
      const idx = oldVoxel.indexOf(index);
      if (idx > -1) {
        oldVoxel.splice(idx, 1);
        if (oldVoxel.length === 0) {
          this.grid.delete(oldKey);
        }
      }
    }

    
    if (!this.grid.has(newKey)) {
      this.grid.set(newKey, []);
    }
    this.grid.get(newKey).push(index);
  }
}
