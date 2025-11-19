import * as THREE from 'three';
import { mapSize, respawnPellet } from '../objects.js';
import { smoothLerp } from '../scene.js';

export function checkEatCondition(isMagnet, cell, pelletData) {

  const { mesh, meshPowerup, positions, sizes, active, radius, dummy, powerUps, pelletToMeshIndex } = pelletData;

  const cellScale = Math.max(cell.scale.x, cell.scale.y, cell.scale.z);
  const cellRadius = cell.geometry.parameters.radius * cellScale;
  const cellPosition = cell.position;

  

  const eatenSizes = [];
  let eatenCount = 0;
  let newPelletMagnetToggle = pelletData.pelletMagnetToggle || false;

  for (let i = 0; i < positions.length; i++) {
    if (!active[i]) continue;

    const distance = cellPosition.distanceTo(positions[i]);
    if (distance <= cellRadius) {
      active[i] = false;
      eatenCount++;
      eatenSizes.push(sizes[i]);

      const isPowerUp = powerUps[i];
      if (isPowerUp && !newPelletMagnetToggle) {
        newPelletMagnetToggle = togglePelletMagnet(cell, pelletData, newPelletMagnetToggle);
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

      // Respawn pellet using reusable function
      const color = new THREE.Color();
      if (isPowerUp) {
        meshPowerup.getColorAt(meshIndex, color);
      } else {
        mesh.getColorAt(meshIndex, color);
      }
      positions[i].copy(
        respawnPellet({
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
        })
      );
      active[i] = true;
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
  if (currentToggle) return;
    
  setTimeout(() => {
    pelletData.pelletMagnetToggle = false;
  }, 8000);
    
  return true;
  
  return currentToggle;
}

export function applyPelletMagnet(animation, playerCell, pelletData, pelletMagnetToggle, scene, magnetSphere, magnetRange, attractionSpeed = 0.3) {
  if (!playerCell || !pelletData) return;

  const playerCellRadius = playerCell.geometry.parameters.radius * Math.max(playerCell.scale.x, playerCell.scale.y, playerCell.scale.z);
  const magnetSphereRadius = playerCellRadius * 4;
  const magnetSphereBaseRadius = 4;

  if (magnetSphere) {
    const targetScale = pelletMagnetToggle ? magnetSphereRadius / magnetSphereBaseRadius : 0.001;
    const lerpSpeed = 0.1;
    const currentScale = magnetSphere.scale.x;
    const newScale = smoothLerp(currentScale, targetScale, lerpSpeed);
    magnetSphere.scale.setScalar(newScale);
    // Optionally, fade opacity if material supports it
    magnetSphere.visible = newScale > 0.01;
    if (magnetSphere.visible) {
      magnetSphere.position.copy(playerCell.position);
      // Add small rotation for visual effect
      magnetSphere.rotation.y += 0.0025;
    }
  }

  if (!pelletMagnetToggle) return;

  const { mesh, meshPowerup, positions, sizes, active, dummy, powerUps, pelletToMeshIndex } = pelletData;
  if (!mesh || !positions || !active) return;

  const playerCellPosition = playerCell.position;
  
  const magnetRangeSq = magnetSphereRadius * magnetSphereRadius;
  const playerCellRadiusSq = playerCellRadius * playerCellRadius;
  
  const px = playerCellPosition.x;
  const py = playerCellPosition.y;
  const pz = playerCellPosition.z;
  
  const affectedNormal = [];
  const affectedPowerup = [];

  //

  if (animation){
    for (let i = 0; i < positions.length; i++) {
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
  else{
    const magnetEatenCount = checkEatCondition(true, magnetSphere, pelletData);
    return magnetEatenCount;
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

export function updatePlayerGrowth(playerCell, pelletData, scene, magnetSphere) {
  if (!pelletData) return;

  const magnetResult = applyPelletMagnet(true, playerCell, pelletData, pelletData.pelletMagnetToggle, scene, magnetSphere, );

  const { eatenCount, eatenSizes } = checkEatCondition(
    false,
    playerCell,
    pelletData
  );

  let totalEatenSizes = [...eatenSizes];
  if (magnetResult && magnetResult.eatenCount > 0) {
    totalEatenSizes = totalEatenSizes.concat(magnetResult.eatenSizes);
  }

  if (totalEatenSizes.length > 0) {
    const playerCellRadius = playerCell.geometry.parameters.radius * playerCell.scale.x;
    const playerCellVolume = (4 / 3) * Math.PI * Math.pow(playerCellRadius, 3);

    const pelletBaseRadius = pelletData.radius;
    let pelletsVolume = 0;

    for (let i = 0; i < totalEatenSizes.length; i++) {
      const pelletRadius = pelletBaseRadius * totalEatenSizes[i];
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
      
      const followDistance = 10;
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
  const material = new THREE.MeshStandardMaterial({ 
    color: playerCell.material.color.clone(),
    transparent: true,
    opacity: playerCell.material.opacity
  });
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
