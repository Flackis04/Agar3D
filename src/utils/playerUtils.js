// path: src/logic/playerAndPellets.js
import * as THREE from 'three';
import { createSplitSphere, mapSize, respawnPellet } from '../objects.js';
import { smoothLerp } from '../scene.js';
import { SpatialGrid } from './spatialGrid.js';

/* -----------------------
   Small math & util helpers
   ----------------------- */
function computeCellRadius(cell) {
  const scale = Math.max(cell.scale.x, cell.scale.y, cell.scale.z);
  return cell.geometry.parameters.radius * scale;
}

function vecLengthSq(dx, dy, dz) {
  return dx * dx + dy * dy + dz * dz;
}

function volumeFromRadius(r) {
  return (4 / 3) * Math.PI * Math.pow(r, 3);
}

/* --------------------------
   InstancedMesh matrix helpers
   -------------------------- */
function hideInstanceAt(mesh, index, dummy) {
  // tiny scale to "hide" visually
  dummy.position.set(0, 0, 0);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.setScalar(0.0001);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function updateInstanceFromDummy(mesh, index, dummy, position, size) {
  dummy.position.copy(position);
  dummy.scale.setScalar(size);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

/* --------------------------
   Pellet respawn & handling
   -------------------------- */
function respawnPelletAt(i, {
  dummy,
  sizes,
  mapSize,
  mesh,
  meshPowerup,
  pelletToMeshIndex,
  powerUps,
  positions
}) {
  const meshIndex = pelletToMeshIndex[i];
  const color = new THREE.Color();
  const isPowerUp = powerUps && powerUps[i];

  if (isPowerUp && meshPowerup) {
    meshPowerup.getColorAt(meshIndex, color);
  } else if (mesh) {
    mesh.getColorAt(meshIndex, color);
  }

  const newPos = respawnPellet({
    dummy,
    size: sizes[i],
    mapSize,
    color,
    isPowerUp,
    meshNormal: mesh,
    meshPowerup,
    normalIdx: meshIndex,
    powerupIdx: meshIndex,
    pelletToMeshIndex,
    i
  });

  positions[i].copy(newPos);
  return newPos;
}

/* --------------------------
   Pellet eating / check logic
   -------------------------- */
function processEatenPellet(i, pelletData, cell, eatenSizes, toggleRef) {
  const {
    mesh,
    meshPowerup,
    positions,
    sizes,
    active,
    dummy,
    powerUps,
    pelletToMeshIndex
  } = pelletData;

  active[i] = false; // mark eaten
  eatenSizes.push(sizes[i]);

  const isPowerUp = powerUps && powerUps[i];
  const meshIndex = pelletToMeshIndex[i];

  // Possibly toggle pellet magnet
  if (isPowerUp && !toggleRef.value) {
    toggleRef.value = togglePelletMagnet(cell, pelletData, toggleRef.value);
    cell.pelletMagnetToggle = toggleRef.value;
  }

  // hide instance (tiny scale)
  if (isPowerUp && meshPowerup) {
    hideInstanceAt(meshPowerup, meshIndex, dummy);
  } else if (mesh) {
    hideInstanceAt(mesh, meshIndex, dummy);
  }

  // Store old position for grid update
  const oldPos = positions[i].clone();
  
  // Respawn and reactivate
  const newPos = respawnPelletAt(i, {
    dummy,
    sizes,
    mapSize,
    mesh,
    meshPowerup,
    pelletToMeshIndex,
    powerUps,
    positions
  });

  // Update spatial grid with new position
  if (pelletData.spatialGrid) {
    pelletData.spatialGrid.updateItem(i, oldPos.x, oldPos.y, oldPos.z, newPos.x, newPos.y, newPos.z);
  }

  active[i] = true;
}

export function checkEatCondition(cell, pelletData) {
  const {
    mesh,
    meshPowerup,
    positions,
    sizes,
    active,
    dummy,
    powerUps,
    pelletToMeshIndex,
    spatialGrid
  } = pelletData;

  const cellRadius = computeCellRadius(cell);
  const cellPosition = cell.position;

  const eatenSizes = [];
  let eatenCount = 0;
  const toggleRef = { value: cell.pelletMagnetToggle || false };

  // Use spatial grid to only check nearby pellets
  const nearbyIndices = spatialGrid 
    ? spatialGrid.getItemsInRadius(cellPosition.x, cellPosition.y, cellPosition.z, cellRadius + 5)
    : Array.from({ length: positions.length }, (_, i) => i);

  for (let idx = 0; idx < nearbyIndices.length; idx++) {
    const i = nearbyIndices[idx];
    if (!active[i]) continue;
    const distance = cellPosition.distanceTo(positions[i]);
    if (distance <= cellRadius) {
      eatenCount++;
      processEatenPellet(i, pelletData, cell, eatenSizes, toggleRef);
    }
  }

  if (eatenCount > 0) {
    if (mesh) mesh.instanceMatrix.needsUpdate = true;
    if (meshPowerup) meshPowerup.instanceMatrix.needsUpdate = true;
  }

  return { eatenCount, eatenSizes, pelletMagnetToggle: toggleRef.value };
}

/* --------------------------
   Pellet magnet helpers
   -------------------------- */
export function togglePelletMagnet(playerCell, pelletData, currentToggle) {
  if (currentToggle) return; // already on

  // revert the toggle after 8 seconds (behavior preserved)
  setTimeout(() => {
    playerCell.pelletMagnetToggle = false;
  }, 8000);

  return true;
}

function applyMagnetAttraction({
  playerPos,
  playerCellRadius,
  magnetRangeSq,
  positions,
  powerUps,
  pelletToMeshIndex,
  sizes,
  active,
  attractionSpeed,
  affectedNormal,
  affectedPowerup,
  spatialGrid
}) {
  const px = playerPos.x;
  const py = playerPos.y;
  const pz = playerPos.z;
  const magnetRange = Math.sqrt(magnetRangeSq);

  // Use spatial grid to only check pellets within magnet range
  const nearbyIndices = spatialGrid
    ? spatialGrid.getItemsInRadius(px, py, pz, magnetRange)
    : Array.from({ length: positions.length }, (_, i) => i);

  for (let idx = 0; idx < nearbyIndices.length; idx++) {
    const i = nearbyIndices[idx];
    if (!active[i]) continue;
    const pelletPos = positions[i];
    const dx = px - pelletPos.x;
    const dy = py - pelletPos.y;
    const dz = pz - pelletPos.z;
    const distanceSq = vecLengthSq(dx, dy, dz);

    if (distanceSq <= magnetRangeSq && distanceSq > (playerCellRadius * playerCellRadius)) {
      const distance = Math.sqrt(distanceSq) || 1e-6;
      const factor = attractionSpeed / distance;
      
      // Store old position for grid update
      const oldX = pelletPos.x;
      const oldY = pelletPos.y;
      const oldZ = pelletPos.z;
      
      pelletPos.x += dx * factor;
      pelletPos.y += dy * factor;
      pelletPos.z += dz * factor;

      // Update spatial grid if position changed cells
      if (spatialGrid) {
        spatialGrid.updateItem(i, oldX, oldY, oldZ, pelletPos.x, pelletPos.y, pelletPos.z);
      }

      const isPowerUp = powerUps && powerUps[i];
      if (isPowerUp) {
        affectedPowerup.push({ i, meshIndex: pelletToMeshIndex[i], size: sizes[i] });
      } else {
        affectedNormal.push({ i, meshIndex: pelletToMeshIndex[i], size: sizes[i] });
      }
    }
  }
}

function updateInstancedMatricesForAffected(affected, mesh, dummy, positions) {
  if (!mesh || affected.length === 0) return;
  for (let j = 0; j < affected.length; j++) {
    const { i, meshIndex, size } = affected[j];
    dummy.position.copy(positions[i]);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    mesh.setMatrixAt(meshIndex, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function updatePelletMagnet(
  isBot,
  playerCell,
  pelletData,
  pelletMagnetToggle,
  scene,
  magnetSphere,
  isWithinViewDistance = true,
  attractionSpeed = 0.3
) {
  const playerCellRadius = computeCellRadius(playerCell);
  const magnetSphereRadius = playerCellRadius * 4;
  const magnetSphereBaseRadius = 4;

  // visual magnet sphere scaling
  if (magnetSphere) {
    const targetScale = pelletMagnetToggle ? (magnetSphereRadius / magnetSphereBaseRadius) : 0.001;
    const lerpSpeed = 0.1;
    const currentScale = magnetSphere.scale.x;
    const newScale = smoothLerp(currentScale, targetScale, lerpSpeed);
    magnetSphere.scale.setScalar(newScale);
    magnetSphere.visible = newScale > 0.01;
    if (magnetSphere.visible) {
      magnetSphere.position.copy(playerCell.position);
      magnetSphere.rotation.y += 0.0025;
    }
  }

  if (!pelletMagnetToggle) return;

  const {
    mesh,
    meshPowerup,
    positions,
    sizes,
    active,
    dummy,
    powerUps,
    pelletToMeshIndex
  } = pelletData;

  if (!mesh || !positions || !active) return;

  // For bots not in view distance, skip animation and eat with magnetSphere
  const shouldAnimate = !isBot || isWithinViewDistance;

  // If animation true, pull pellets; otherwise use magnet sphere to eat nearby pellets
  if (shouldAnimate) {
    const playerCellPosition = playerCell.position;
    const magnetRangeSq = magnetSphereRadius * magnetSphereRadius;

    const affectedNormal = [];
    const affectedPowerup = [];

    applyMagnetAttraction({
      playerPos: playerCellPosition,
      playerCellRadius,
      magnetRangeSq,
      positions,
      powerUps,
      pelletToMeshIndex,
      sizes,
      active,
      attractionSpeed,
      affectedNormal,
      affectedPowerup,
      spatialGrid: pelletData.spatialGrid
    });

    updateInstancedMatricesForAffected(affectedNormal, mesh, dummy, positions);
    if (affectedPowerup.length > 0 && meshPowerup) {
      updateInstancedMatricesForAffected(affectedPowerup, meshPowerup, dummy, positions);
    }
    return;
  } else {
    // non-animation: magnet sphere eats pellets based on magnetSphere radius
    // Create a temporary cell-like object with magnetSphere's properties
    if (!magnetSphere) return;
    
    const magnetCellProxy = {
      position: playerCell.position,
      geometry: {
        parameters: {
          radius: magnetSphereBaseRadius
        }
      },
      scale: magnetSphere.scale,
      pelletMagnetToggle: playerCell.pelletMagnetToggle
    };
    
    return checkEatCondition(magnetCellProxy, pelletData);
  }
}

/* --------------------------
   Player fade & growth helpers
   -------------------------- */
export function updatePlayerFade(playerCell, lastSplitTime, playerDefaultOpacity) {
  if (!lastSplitTime) return null;
  const now = performance.now();
  const t = (now - lastSplitTime) / 1000;
  const duration = 1.2;
  if (t >= duration) {
    playerCell.material.opacity = playerDefaultOpacity;
    return null;
  } else {
    const x = t / duration;
    playerCell.material.opacity = playerDefaultOpacity * Math.pow(x, 5);
    return lastSplitTime;
  }
}

function applyGrowthFromPellets(playerCell, totalEatenSizes, pelletBaseRadius) {
  if (!totalEatenSizes || totalEatenSizes.length === 0) return;

  const playerCellRadius = playerCell.geometry.parameters.radius * playerCell.scale.x;
  const playerCellVolume = volumeFromRadius(playerCellRadius);

  let pelletsVolume = 0;
  for (let i = 0; i < totalEatenSizes.length; i++) {
    const pelletRadius = pelletBaseRadius * totalEatenSizes[i];
    pelletsVolume += volumeFromRadius(pelletRadius);
  }

  const newVolume = playerCellVolume + pelletsVolume;
  const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
  const scale = newRadius / playerCell.geometry.parameters.radius;
  playerCell.scale.setScalar(scale);
}

export function updatePlayerGrowth(isBot, playerCell, pelletData, scene, magnetSphere, playerPosition) {
  if (!pelletData) return;

  // Determine if bot is within view distance of player (if bot)
  // Calculate view distance based on fog density (matches fog visibility)
  const playerSize = playerCell.geometry?.parameters?.radius * (playerCell.scale?.x || 1) || 1;
  const fogDensity = scene.fog?.density || 0.04 / playerSize;
  const viewDistance = 3 / fogDensity; // ~75% opacity in exponential fog
  
  let isWithinViewDistance = true;
  if (isBot && playerPosition) {
    const distanceToPlayer = playerCell.position.distanceTo(playerPosition);
    isWithinViewDistance = distanceToPlayer <= viewDistance;
  }

  // run magnet attraction animation pass first (original did this)
  const magnetResult = updatePelletMagnet(
    isBot,
    playerCell,
    pelletData,
    playerCell.pelletMagnetToggle,
    scene,
    magnetSphere,
    isWithinViewDistance
  );

  // Check for eaten pellets by this cell
  const { eatenCount, eatenSizes } = checkEatCondition(playerCell, pelletData);

  let totalEatenSizes = [...eatenSizes];

  // Add magnet-eaten pellets if magnet is active for this cell
  if (magnetResult && magnetResult.eatenCount > 0) {
    totalEatenSizes = totalEatenSizes.concat(magnetResult.eatenSizes);
  }

  applyGrowthFromPellets(playerCell, totalEatenSizes, pelletData.radius);
}

/* --------------------------
   Cells update / split helpers
   -------------------------- */
function cameraFollowOtherCell(camera, otherCell, cellRotation) {
  const cellPos = otherCell.position;
  const followDistance = 10;
  const offset = new THREE.Vector3(
    followDistance * Math.sin(cellRotation.yaw) * Math.cos(cellRotation.pitch),
    followDistance * Math.sin(cellRotation.pitch),
    followDistance * Math.cos(cellRotation.yaw) * Math.cos(cellRotation.pitch)
  );
  camera.position.copy(cellPos).add(offset);
  camera.lookAt(cellPos);
}

function tryMoveOtherCellTowardsPlayer(otherCell, playerCell, playerCellRadius, getForwardButtonPressed, epsilon = 0.001) {
  const toPlayerCell = playerCell.position.clone().sub(otherCell.position);
  const dist = toPlayerCell.length();
  const forwardPressed = getForwardButtonPressed();

  if (dist > playerCellRadius + epsilon && !forwardPressed) {
    const step = toPlayerCell.normalize().multiplyScalar(Math.min(dist - playerCellRadius, 0.2));
    otherCell.position.add(step);
    return { removed: false };
  } else if (dist > playerCellRadius + epsilon && forwardPressed) {
    otherCell.position.copy(
      playerCell.position.clone().add(toPlayerCell.normalize().multiplyScalar(playerCellRadius + (otherCell.userData.peakDist || dist)))
    );
    return { removed: false };
  }
  // otherwise merge into player (removed)
  return { removed: true, dist, toPlayerCell };
}

export function updateCells(cells, scene, playerCell, camera, getForwardButtonPressed, playerRotation, cellRotation) {
  const now = performance.now();
  let isSplit = false;
  let splitCell = null;
  const basePlayerCellRadius = playerCell.geometry.parameters.radius;

  for (let i = cells.length - 1; i >= 0; i--) {
    const otherPlayerCell = cells[i];
    const t = (now - otherPlayerCell.userData.startTime) / 1000;
    const playerCellRadius = basePlayerCellRadius * playerCell.scale.x;
    const cellRadius = otherPlayerCell.geometry.parameters.radius * otherPlayerCell.scale.x;

    // camera-follow other player for first 2s (original behavior)
    if (t <= 2) {
      cameraFollowOtherCell(camera, otherPlayerCell, cellRotation);

      const decay = Math.exp(-2 * t);
      const velocity = otherPlayerCell.userData.velocity.clone().multiplyScalar(decay);
      otherPlayerCell.position.add(velocity);

      return { isSplit: true, splitCell: otherPlayerCell, viewingCell: true };
    }

    // default: treat as split
    isSplit = true;
    splitCell = otherPlayerCell;

    if (!otherPlayerCell.userData.peakDist) {
      const toPlayerCell = playerCell.position.clone().sub(otherPlayerCell.position);
      otherPlayerCell.userData.peakDist = toPlayerCell.length();
    }

    const moveResult = tryMoveOtherCellTowardsPlayer(
      otherPlayerCell, playerCell, playerCellRadius, getForwardButtonPressed
    );

    if (!moveResult.removed) {
      continue;
    } else {
      // merge: remove other cell, increase player size (behavior preserved)
      scene.remove(otherPlayerCell);
      cells.splice(i, 1);

      const otherPlayerCellVolume = volumeFromRadius(cellRadius);
      const currentPlayerCellVolume = volumeFromRadius(playerCellRadius);
      const newVolume = currentPlayerCellVolume + otherPlayerCellVolume;
      const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
      const scale = newRadius / basePlayerCellRadius;
      playerCell.scale.setScalar(scale);
    }
  }

  return { isSplit, splitCell };
}

/* --------------------------
   Split execution
   -------------------------- */
function canSplit(now, lastSplit, cooldown) {
  if (now - lastSplit < cooldown) return lastSplit;
  return null;
}

export function executeSplit(playerCell, camera, scene, cells, playerCellSpeed, lastSplit, onSplit) {
  const now = performance.now();
  const cooldown = 200;

  // preserve original semantics (but if on cooldown, return lastSplit)
  const blocked = canSplit(now, lastSplit, cooldown);
  if (blocked) return blocked;

  const cell = createSplitSphere(playerCell);
  cell.position.copy(playerCell.position);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  cell.userData.velocity = forward.clone().multiplyScalar(playerCellSpeed * 5.5);
  cell.userData.startTime = now;

  scene.add(cell);
  cells.push(cell);

  if (typeof onSplit === 'function') onSplit(cell);
  return now;
}
