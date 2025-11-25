import * as THREE from "three";
import { createSplitSphere, mapSize, respawnPellet } from "../objects.js";
import { smoothLerp } from "../scene.js";
import { SpatialGrid } from "./spatialGrid.js";
import { emitPelletEaten, emitPelletRespawn } from "../multiplayer.js";

export function checkCellDistanceFromCamera(activeCell, cameraDistance) {
  if (activeCell.position.distanceTo(camera.position) > cameraDistance) {
    hideInstanceAt(activeCell.mesh, index, activeCell);
  }
}

export function calculateDistanceBetweenCells(sourceCell, targetCell) {
  const distance = sourceCell.position.distanceTo(targetCell.position);
  return distance;
}

export function calculateCellMass(playerCell, pelletMinSizeValue) {
  const playerRadius = computeCellRadius(playerCell);
  const pelletRadius = pelletMinSizeValue;
  const mass = volumeFromRadius(playerRadius) / volumeFromRadius(pelletRadius);
  return mass;
}

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

export function convertMassToRadius(mass, pelletMinSizeValue = 1) {
  const pelletVolume = volumeFromRadius(pelletMinSizeValue);
  const cellVolume = mass * pelletVolume;
  const radius = Math.cbrt((3 * cellVolume) / (4 * Math.PI));
  return radius;
}

function canEatCell(predatorRadius, preyRadius) {
  return predatorRadius > preyRadius * 1.15;
}

function hideInstanceAt(mesh, index, dummy) {
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

function respawnPelletAt(
  i,
  {
    dummy,
    sizes,
    mapSize,
    mesh,
    meshPowerup,
    pelletToMeshIndex,
    powerUps,
    positions,
  }
) {
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
    i,
  });

  positions[i].copy(newPos);
  return newPos;
}

function processEatenPellet(i, pelletData, cell, eatenSizes, toggleRef) {
  const {
    mesh,
    meshPowerup,
    positions,
    sizes,
    active,
    dummy,
    powerUps,
    pelletToMeshIndex,
  } = pelletData;

  active[i] = false;
  eatenSizes.push(sizes[i]);

  // Emit pellet eaten event to sync with other players
  emitPelletEaten(i);

  const isPowerUp = powerUps && powerUps[i];
  const meshIndex = pelletToMeshIndex[i];

  if (isPowerUp && !toggleRef.value) {
    toggleRef.value = togglePelletMagnet(cell, pelletData, toggleRef.value);
    cell.pelletMagnetToggle = toggleRef.value;
  }

  if (isPowerUp && meshPowerup) {
    hideInstanceAt(meshPowerup, meshIndex, dummy);
  } else if (mesh) {
    hideInstanceAt(mesh, meshIndex, dummy);
  }

  const oldPos = positions[i].clone();

  const newPos = respawnPelletAt(i, {
    dummy,
    sizes,
    mapSize,
    mesh,
    meshPowerup,
    pelletToMeshIndex,
    powerUps,
    positions,
  });

  if (pelletData.spatialGrid) {
    pelletData.spatialGrid.updateItem(
      i,
      oldPos.x,
      oldPos.y,
      oldPos.z,
      newPos.x,
      newPos.y,
      newPos.z
    );
  }

  active[i] = true;

  // Emit pellet respawn event to sync with other players
  emitPelletRespawn(i, newPos, isPowerUp);
}

export function checkEatCondition(cell, pelletData, onEatCallback) {
  const {
    mesh,
    meshPowerup,
    positions,
    sizes,
    active,
    dummy,
    powerUps,
    pelletToMeshIndex,
    spatialGrid,
  } = pelletData;

  const cellRadius = computeCellRadius(cell);
  const cellPosition = cell.position;

  const eatenSizes = [];
  let eatenCount = 0;
  const toggleRef = { value: cell.pelletMagnetToggle || false };

  const nearbyIndices = spatialGrid
    ? spatialGrid.getItemsInRadius(
        cellPosition.x,
        cellPosition.y,
        cellPosition.z,
        cellRadius + 5
      )
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
    if (onEatCallback) {
      const avgSize = eatenSizes.reduce((a, b) => a + b, 0) / eatenSizes.length;
      const pitch = 1.5 - avgSize * 1.0;
      onEatCallback(pitch);
    }
  }

  return { eatenCount, eatenSizes, pelletMagnetToggle: toggleRef.value };
}

export function togglePelletMagnet(playerCell, pelletData, currentToggle) {
  if (currentToggle) return;

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
  spatialGrid,
}) {
  const px = playerPos.x;
  const py = playerPos.y;
  const pz = playerPos.z;
  const magnetRange = Math.sqrt(magnetRangeSq);

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

    if (
      distanceSq <= magnetRangeSq &&
      distanceSq > playerCellRadius * playerCellRadius
    ) {
      const distance = Math.sqrt(distanceSq) || 1e-6;
      const factor = attractionSpeed / distance;

      const oldX = pelletPos.x;
      const oldY = pelletPos.y;
      const oldZ = pelletPos.z;

      pelletPos.x += dx * factor;
      pelletPos.y += dy * factor;
      pelletPos.z += dz * factor;

      if (spatialGrid) {
        spatialGrid.updateItem(
          i,
          oldX,
          oldY,
          oldZ,
          pelletPos.x,
          pelletPos.y,
          pelletPos.z
        );
      }

      const isPowerUp = powerUps && powerUps[i];
      if (isPowerUp) {
        affectedPowerup.push({
          i,
          meshIndex: pelletToMeshIndex[i],
          size: sizes[i],
        });
      } else {
        affectedNormal.push({
          i,
          meshIndex: pelletToMeshIndex[i],
          size: sizes[i],
        });
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
  attractionSpeed = 0.3,
  onEatSound = undefined,
  playerPosition = null
) {
  const playerCellRadius = computeCellRadius(playerCell);
  const magnetSphereRadius = playerCellRadius * 4;
  const magnetSphereBaseRadius = 4;

  if (magnetSphere) {
    const targetScale = pelletMagnetToggle
      ? magnetSphereRadius / magnetSphereBaseRadius
      : 0.001;
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
    pelletToMeshIndex,
  } = pelletData;

  if (!mesh || !positions || !active) return;

  const shouldAnimate = !isBot || isWithinViewDistance;

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
      spatialGrid: pelletData.spatialGrid,
    });

    updateInstancedMatricesForAffected(affectedNormal, mesh, dummy, positions);
    if (affectedPowerup.length > 0 && meshPowerup) {
      updateInstancedMatricesForAffected(
        affectedPowerup,
        meshPowerup,
        dummy,
        positions
      );
    }
    return;
  } else {
    if (!magnetSphere) return;

    const magnetCellProxy = {
      position: playerCell.position,
      geometry: {
        parameters: {
          radius: magnetSphereBaseRadius,
        },
      },
      scale: magnetSphere.scale,
      pelletMagnetToggle: playerCell.pelletMagnetToggle,
    };

    return checkEatCondition(
      magnetCellProxy,
      pelletData,
      createSoundCallback(isBot, onEatSound, playerCell, playerPosition, scene)
    );
  }
}

export function updatePlayerFade(
  playerCell,
  lastSplitTime,
  playerDefaultOpacity,
  deltaTime = 1 / 60
) {
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

function applyGrowthFromPellets(
  playerCell,
  totalEatenSizes,
  pelletBaseRadius,
  deltaTime = 1 / 60
) {
  if (!totalEatenSizes || totalEatenSizes.length === 0) return;

  const playerCellRadius =
    playerCell.geometry.parameters.radius * playerCell.scale.x;
  const playerCellVolume = volumeFromRadius(playerCellRadius);

  let pelletsVolume = 0;
  for (let i = 0; i < totalEatenSizes.length; i++) {
    const pelletRadius = pelletBaseRadius * totalEatenSizes[i];
    pelletsVolume += volumeFromRadius(pelletRadius);
  }

  const newVolume = playerCellVolume + pelletsVolume * (deltaTime * 60);
  const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
  const scale = newRadius / playerCell.geometry.parameters.radius;
  playerCell.scale.setScalar(scale);
}

export function checkCellEatCondition(
  predatorCell,
  allCells,
  scene,
  onEaten,
  onEatCallback
) {
  const predatorRadius = computeCellRadius(predatorCell);
  const predatorPos = predatorCell.position;

  for (let i = 0; i < allCells.length; i++) {
    const preyCell = allCells[i];
    if (preyCell === predatorCell || preyCell.userData.isEaten) continue;

    const preyRadius = computeCellRadius(preyCell);

    if (!canEatCell(predatorRadius, preyRadius)) continue;

    const distance = predatorPos.distanceTo(preyCell.position);

    if (distance <= predatorRadius) {
      preyCell.userData.isEaten = true;
      scene.remove(preyCell);
      if (preyCell.magnetSphere) {
        scene.remove(preyCell.magnetSphere);
      }

      const preyVolume = volumeFromRadius(preyRadius);
      const predatorVolume = volumeFromRadius(predatorRadius);
      const newVolume = predatorVolume + preyVolume;
      const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
      const scale = newRadius / predatorCell.geometry.parameters.radius;
      predatorCell.scale.setScalar(scale);

      if (onEaten) onEaten(preyCell);
      if (onEatCallback) {
        const sizeRatio = preyRadius / predatorRadius;

        const pitch = 1.5 - sizeRatio * 0.75;
        onEatCallback(pitch);
      }

      return true;
    }
  }

  return false;
}

function getFogFarDistance(scene) {
  if (!scene.fog) {
    console.warn("No fog found, returning default 100");
    return 100;
  }
  const fogFar = scene.fog.far;
  //console.log("Fog far distance:", fogFar);
  return fogFar;
}

function isWithinViewRange(playerCell, playerPosition, fogFar) {
  if (!playerPosition) return true;
  const distanceToPlayer = playerCell.position.distanceTo(playerPosition);
  return distanceToPlayer <= fogFar;
}

export function createSoundCallback(
  isBot,
  onEatSound,
  playerCell,
  playerPosition,
  scene
) {
  if (!onEatSound) {
    return undefined;
  }

  if (!isBot) {
    return (pitch = 1.0) => onEatSound(1.0, pitch);
  }

  if (!playerPosition) {
    return undefined;
  }

  return (pitch = 1.0) => {
    // Recalculate distance and fog far each time sound is played
    const fogFar = getFogFarDistance(scene);
    const distanceToPlayer = playerCell.position.distanceTo(playerPosition);

    // Don't play sound if outside fog far distance
    if (distanceToPlayer > fogFar) {
      return;
    }

    const volume = Math.max(0, 1 - distanceToPlayer / fogFar);
    console.log(
      `[Bot Sound] Distance: ${distanceToPlayer.toFixed(
        2
      )}, FogFar: ${fogFar.toFixed(2)}, Volume: ${volume.toFixed(
        3
      )}, Pitch: ${pitch.toFixed(2)}`
    );
    onEatSound(volume, pitch);
  };
}

function mergeMagnetEatenSizes(eatenSizes, magnetResult) {
  if (!magnetResult || magnetResult.eatenCount === 0) {
    return eatenSizes;
  }
  return eatenSizes.concat(magnetResult.eatenSizes);
}

export function updatePlayerGrowth(
  isBot,
  playerCell,
  pelletData,
  scene,
  magnetSphere,
  playerPosition,
  allCells,
  onCellEaten,
  onEatSound,
  deltaTime = 1 / 60,
  onPelletEaten = false
) {
  if (!pelletData) return;

  const fogFar = getFogFarDistance(scene);
  const isWithinView = isBot
    ? isWithinViewRange(playerCell, playerPosition, fogFar)
    : true;

  const { eatenCount, eatenSizes } = checkEatCondition(
    playerCell,
    pelletData,
    createSoundCallback(isBot, onEatSound, playerCell, playerPosition, scene)
  );

  const magnetResult = updatePelletMagnet(
    isBot,
    playerCell,
    pelletData,
    playerCell.pelletMagnetToggle,
    scene,
    magnetSphere,
    isWithinView,
    0.3,
    onEatSound,
    playerPosition
  );

  const totalEatenSizes = mergeMagnetEatenSizes(eatenSizes, magnetResult);

  applyGrowthFromPellets(
    playerCell,
    totalEatenSizes,
    pelletData.radius,
    deltaTime
  );

  if (
    !isBot &&
    onPelletEaten &&
    (eatenCount > 0 || (magnetResult && magnetResult.eatenCount > 0))
  ) {
    onPelletEaten();
  }
}

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

function tryMoveOtherCellTowardsPlayer(
  otherCell,
  playerCell,
  playerCellRadius,
  getForwardButtonPressed,
  deltaTime = 1 / 60,
  epsilon = 0.001
) {
  const toPlayerCell = playerCell.position.clone().sub(otherCell.position);
  const dist = toPlayerCell.length();
  const forwardPressed = getForwardButtonPressed();

  if (dist > playerCellRadius + epsilon) {
    const t = (performance.now() - otherCell.userData.startTime) / 1000;
    const speedMultiplier = Math.pow(1.5, Math.min(t / 3, 1));
    const step = toPlayerCell
      .normalize()
      .multiplyScalar(
        Math.min(
          dist - playerCellRadius,
          0.55 * speedMultiplier * (deltaTime * 60)
        )
      );
    otherCell.position.add(step);
    return { removed: false };
  }

  return { removed: true, dist, toPlayerCell };
}

export function updateCells(
  cells,
  scene,
  playerCell,
  camera,
  getForwardButtonPressed,
  playerRotation,
  cellRotation,
  deltaTime = 1 / 60
) {
  const now = performance.now();
  let isSplit = false;
  let splitCell = null;
  const basePlayerCellRadius = playerCell.geometry.parameters.radius;

  for (let i = cells.length - 1; i >= 0; i--) {
    const otherPlayerCell = cells[i];
    const t = (now - otherPlayerCell.userData.startTime) / 1000;
    const playerCellRadius = basePlayerCellRadius * playerCell.scale.x;
    const cellRadius =
      otherPlayerCell.geometry.parameters.radius * otherPlayerCell.scale.x;

    if (t <= 2) {
      cameraFollowOtherCell(camera, otherPlayerCell, cellRotation);

      const decay = Math.exp(-2 * t);
      const velocity = otherPlayerCell.userData.velocity
        .clone()
        .multiplyScalar(decay);
      otherPlayerCell.position.add(velocity);

      return { isSplit: true, splitCell: otherPlayerCell, viewingCell: true };
    }

    isSplit = true;
    splitCell = otherPlayerCell;

    if (!otherPlayerCell.userData.peakDist) {
      const toPlayerCell = playerCell.position
        .clone()
        .sub(otherPlayerCell.position);
      otherPlayerCell.userData.peakDist = toPlayerCell.length();
    }

    const moveResult = tryMoveOtherCellTowardsPlayer(
      otherPlayerCell,
      playerCell,
      playerCellRadius,
      getForwardButtonPressed,
      deltaTime
    );

    if (!moveResult.removed) {
      continue;
    } else {
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

function canSplit(now, lastSplit, cooldown) {
  if (now - lastSplit < cooldown) return lastSplit;
  return null;
}

export function executeSplit(
  playerCell,
  cells,
  camera,
  scene,
  playerCellSpeed
) {
  const now = performance.now();
  const cellCap = 16;

  const allPlayerCells = [playerCell, ...cells];

  if (allPlayerCells.length >= cellCap) {
    return cells;
  }

  const maxNewCells = cellCap - allPlayerCells.length;
  const cellsToSplit = Math.min(allPlayerCells.length, maxNewCells);

  const newCells = [...cells];

  for (let i = 0; i < cellsToSplit; i++) {
    const originalCell = allPlayerCells[i];

    const originalRadius = computeCellRadius(originalCell);
    const originalVolume = volumeFromRadius(originalRadius);
    const newVolume = originalVolume / 2;
    const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
    const newScale = newRadius / originalCell.geometry.parameters.radius;

    originalCell.scale.setScalar(newScale);

    const splitCell = createSplitSphere(originalCell);
    splitCell.position.copy(originalCell.position);

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    if (splitCell) {
      splitCell.userData.velocity = forward
        .clone()
        .multiplyScalar(playerCellSpeed * 5.5);
      splitCell.userData.startTime = now;
      scene.add(splitCell);
      newCells.push(splitCell);
    }
  }

  return newCells;
}
