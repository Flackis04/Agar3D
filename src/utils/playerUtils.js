import * as THREE from 'three';

export function checkEatCondition(playerCell, pelletData) {
  if (!playerCell || !pelletData) return { eatenCount: 0, eatenSizes: [] };

  const { mesh, meshPowerup, positions, sizes, active, radius, dummy, powerUps, pelletToMeshIndex, spatialGrid } = pelletData;
  if (!mesh || !positions || !active || !sizes) return { eatenCount: 0, eatenSizes: [] };

  const playerCellScale = Math.max(playerCell.scale.x, playerCell.scale.y, playerCell.scale.z);
  const playerCellRadius = playerCell.geometry.parameters.radius * playerCellScale;
  const playerCellPosition = playerCell.position;
  const playerCellRadiusSq = playerCellRadius * playerCellRadius;

  const eatenSizes = [];
  let eatenCount = 0;
  let newPelletMagnetToggle = pelletData.pelletMagnetToggle || false;

  // Use spatial grid if available for efficient neighbor queries
  let candidateIndices;
  if (spatialGrid) {
    candidateIndices = spatialGrid.query(playerCellPosition.x, playerCellPosition.y, playerCellPosition.z, playerCellRadius);
  } else {
    // Fallback: check all pellets (slower)
    candidateIndices = [];
    for (let i = 0; i < positions.length; i++) {
      if (active[i]) candidateIndices.push(i);
    }
  }

  const px = playerCellPosition.x;
  const py = playerCellPosition.y;
  const pz = playerCellPosition.z;

  for (let idx = 0; idx < candidateIndices.length; idx++) {
    const i = candidateIndices[idx];
    if (!active[i]) continue;

    const pelletPos = positions[i];
    const dx = px - pelletPos.x;
    const dy = py - pelletPos.y;
    const dz = pz - pelletPos.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;

    if (distanceSq <= playerCellRadiusSq) {
      active[i] = false;
      eatenCount++;
      eatenSizes.push(sizes[i]);

      const isPowerUp = powerUps[i];
      if (isPowerUp && !newPelletMagnetToggle) {
        newPelletMagnetToggle = togglePelletMagnet(playerCell, pelletData, newPelletMagnetToggle);
        pelletData.pelletMagnetToggle = newPelletMagnetToggle;
      }
      dummy.position.copy(positions[i]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      
      const meshIndex = pelletToMeshIndex[i];
      if (powerUps && powerUps[i]) {
        meshPowerup.setMatrixAt(meshIndex, dummy.matrix);
      } else {
        mesh.setMatrixAt(meshIndex, dummy.matrix);
      }
    }
  }

  if (eatenCount > 0) {
    mesh.instanceMatrix.needsUpdate = true;
    if (meshPowerup) meshPowerup.instanceMatrix.needsUpdate = true;
  }

  return { eatenCount, eatenSizes, pelletMagnetToggle: newPelletMagnetToggle };
}

// Pellet Magnet
function togglePelletMagnet(playerCell, pelletData, currentToggle) {
  if (!currentToggle) {
    console.log('Pellet magnet activated for 8 seconds!');
    
    setTimeout(() => {
      pelletData.pelletMagnetToggle = false;
      console.log('Pellet magnet deactivated!');
    }, 8000);
    
    return true;
  }
  
  return currentToggle;
}

export function applyPelletMagnet(playerCell, pelletData, pelletMagnetToggle, magnetRange = 5, attractionSpeed = 0.3) {
  if (!pelletMagnetToggle || !playerCell || !pelletData) return;

  const { mesh, meshPowerup, positions, sizes, active, dummy, powerUps, pelletToMeshIndex, spatialGrid } = pelletData;
  if (!mesh || !positions || !active) return;

  const playerCellPosition = playerCell.position;
  const playerCellRadius = playerCell.geometry.parameters.radius * Math.max(playerCell.scale.x, playerCell.scale.y, playerCell.scale.z);
  
  const magnetRangeSq = magnetRange * magnetRange;
  const playerCellRadiusSq = playerCellRadius * playerCellRadius;
  
  const px = playerCellPosition.x;
  const py = playerCellPosition.y;
  const pz = playerCellPosition.z;
  
  const affectedNormal = [];
  const affectedPowerup = [];

  // Use spatial grid if available for efficient neighbor queries
  let candidateIndices;
  if (spatialGrid) {
    candidateIndices = spatialGrid.query(px, py, pz, magnetRange);
  } else {
    // Fallback: check all pellets (slower)
    candidateIndices = [];
    for (let i = 0; i < positions.length; i++) {
      if (active[i]) candidateIndices.push(i);
    }
  }

  // Process only nearby pellets
  for (let idx = 0; idx < candidateIndices.length; idx++) {
    const i = candidateIndices[idx];
    if (!active[i]) continue;

    const pelletPos = positions[i];
    
    const dx = px - pelletPos.x;
    const dy = py - pelletPos.y;
    const dz = pz - pelletPos.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    
    if (distanceSq <= magnetRangeSq && distanceSq > playerCellRadiusSq) {
      const distance = Math.sqrt(distanceSq);
      const factor = attractionSpeed / distance;
      
      pelletPos.x += dx * factor;
      pelletPos.y += dy * factor;
      pelletPos.z += dz * factor;

      const isPowerUp = powerUps && powerUps[i];
      if (isPowerUp) {
        affectedPowerup.push({ i, meshIndex: pelletToMeshIndex[i], size: sizes[i] });
      } else {
        affectedNormal.push({ i, meshIndex: pelletToMeshIndex[i], size: sizes[i] });
      } 
    }
  }

  if (affectedNormal.length > 0) {
    for (let j = 0; j < affectedNormal.length; j++) {
      const { i, meshIndex, size } = affectedNormal[j];
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      mesh.setMatrixAt(meshIndex, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  if (affectedPowerup.length > 0 && meshPowerup) {
    for (let j = 0; j < affectedPowerup.length; j++) {
      const { i, meshIndex, size } = affectedPowerup[j];
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      meshPowerup.setMatrixAt(meshIndex, dummy.matrix);
    }
    meshPowerup.instanceMatrix.needsUpdate = true;
  }
}

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

export function handlePelletEatingAndGrowth(playerCell, pelletData) {
  if (!pelletData) return;

  // Rebuild spatial grid periodically or when magnet is active for better performance
  // Only rebuild if pellets have moved significantly (when magnet is active)
  if (pelletData.pelletMagnetToggle && pelletData.spatialGrid) {
    if (!pelletData.lastGridRebuild || performance.now() - pelletData.lastGridRebuild > 100) {
      pelletData.spatialGrid.clear();
      const { positions, active } = pelletData;
      for (let i = 0; i < positions.length; i++) {
        if (active[i]) {
          pelletData.spatialGrid.add(positions[i].x, positions[i].y, positions[i].z, i);
        }
      }
      pelletData.lastGridRebuild = performance.now();
    }
  }

  applyPelletMagnet(playerCell, pelletData, pelletData.pelletMagnetToggle);

  const { eatenCount, eatenSizes } = checkEatCondition(
    playerCell,
    pelletData
  );

  if (eatenCount > 0) {
    const playerCellRadius = playerCell.geometry.parameters.radius * playerCell.scale.x;
    const playerCellVolume = (4 / 3) * Math.PI * Math.pow(playerCellRadius, 3);

    const pelletBaseRadius = pelletData.radius;
    let pelletsVolume = 0;

    for (let i = 0; i < eatenSizes.length; i++) {
      const pelletRadius = pelletBaseRadius * eatenSizes[i];
      pelletsVolume += (4 / 3) * Math.PI * Math.pow(pelletRadius, 3);
    }

    const newVolume = playerCellVolume + pelletsVolume;
    const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
    const scale = newRadius / playerCell.geometry.parameters.radius;

    playerCell.scale.setScalar(scale);
  }
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
    const cellRadius   = otherPlayerCell.geometry.parameters.radius * otherPlayerCell.scale.x;

    const toPlayerCell = playerCell.position.clone().sub(otherPlayerCell.position);
    const dist     = toPlayerCell.length();

    // otherPlayer Cam

    if (t <= 2) {
      const cellPos = otherPlayerCell.position;
      
      const followDistance = 5;
      const offset = new THREE.Vector3(
        followDistance * Math.sin(cellRotation.yaw) * Math.cos(cellRotation.pitch),
        followDistance * Math.sin(cellRotation.pitch),
        followDistance * Math.cos(cellRotation.yaw) * Math.cos(cellRotation.pitch)
      );
      
      camera.position.copy(cellPos).add(offset);
      camera.lookAt(cellPos);

      const decay = Math.exp(-2 * t);
      const velocity = otherPlayerCell.userData.velocity.clone().multiplyScalar(decay);
      otherPlayerCell.position.add(velocity);

      return { isSplit: true, splitCell: otherPlayerCell, viewingCell: true };
    }

    // player Cam

    isSplit = true;
    splitCell = otherPlayerCell;

    if (!otherPlayerCell.userData.peakDist) {
      otherPlayerCell.userData.peakDist = dist;
    }

    const peakDist = otherPlayerCell.userData.peakDist;
    const forwardPressed = getForwardButtonPressed();
    const epsilon = 0.001;

    if (dist > playerCellRadius + epsilon && !forwardPressed) {
      const step = toPlayerCell.normalize()
                           .multiplyScalar(Math.min(dist - playerCellRadius, 0.2));
      otherPlayerCell.position.add(step);
      continue;
    }

    else if (dist > playerCellRadius + epsilon && forwardPressed) {
      otherPlayerCell.position.copy(
        playerCell.position.clone().add(
          toPlayerCell.normalize().multiplyScalar(playerCellRadius + peakDist)
        )
      );
      continue;
    }

    else{
      scene.remove(otherPlayerCell);
      cells.splice(i, 1);

      const otherPlayerCellVolume = (4 / 3) * Math.PI * Math.pow(cellRadius, 3);
      const currentPlayerCellVolume = (4 / 3) * Math.PI * Math.pow(playerCellRadius, 3);

      const newVolume = currentPlayerCellVolume + otherPlayerCellVolume;
      const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
      const scale = newRadius / basePlayerCellRadius;

      playerCell.scale.setScalar(scale);
    }
  }

  return { isSplit, splitCell };
}

export function executeSplit(playerCell, camera, scene, cells, playerCellSpeed, lastSplit, onSplit) {
  const now = performance.now();
  if (now - lastSplit < 200) return lastSplit;

  const basePlayerCellRadius = playerCell.geometry.parameters.radius;
  const playerCellRadius = basePlayerCellRadius * playerCell.scale.x;
  const playerCellVolume = (4/3) * Math.PI * Math.pow(playerCellRadius, 3);

  let cellVolume, cellRadius;

  const geometry = new THREE.SphereGeometry(cellRadius, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: playerCell.material.color.clone() });
  const cell = new THREE.Mesh(geometry, material);
  cell.position.copy(playerCell.position);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);

  cell.userData.velocity = forward.clone().multiplyScalar(playerCellSpeed * 5.5);
  cell.userData.startTime = now;

  scene.add(cell);
  cells.push(cell);

  if (onSplit) onSplit();

  return now;
}
