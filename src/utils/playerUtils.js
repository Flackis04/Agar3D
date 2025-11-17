import * as THREE from 'three';

export function checkEatCondition(playerSphere, pelletData) {
  if (!playerSphere || !pelletData) return { eatenCount: 0, eatenSizes: [] };

  const { mesh, meshPowerup, positions, sizes, active, radius, dummy, powerUps, pelletToMeshIndex } = pelletData;
  if (!mesh || !positions || !active || !sizes) return { eatenCount: 0, eatenSizes: [] };

  const playerSphereScale = Math.max(playerSphere.scale.x, playerSphere.scale.y, playerSphere.scale.z);
  const playerSphereRadius = playerSphere.geometry.parameters.radius * playerSphereScale;
  const playerSpherePosition = playerSphere.position;

  const eatenSizes = [];
  let eatenCount = 0;
  let newPelletMagnetToggle = pelletData.pelletMagnetToggle || false;

  for (let i = 0; i < positions.length; i++) {
    if (!active[i]) continue;

    const distance = playerSpherePosition.distanceTo(positions[i]);
    if (distance <= playerSphereRadius) {
      active[i] = false;
      eatenCount++;
      eatenSizes.push(sizes[i]);

      const isPowerUp = powerUps[i];
      if (isPowerUp && !newPelletMagnetToggle) {
        newPelletMagnetToggle = togglePelletMagnet(playerSphere, pelletData, newPelletMagnetToggle);
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
function togglePelletMagnet(playerSphere, pelletData, currentToggle) {
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

export function applyPelletMagnet(playerSphere, pelletData, pelletMagnetToggle, magnetRange = 5, attractionSpeed = 0.15) {
  if (!pelletMagnetToggle || !playerSphere || !pelletData) return;

  const { mesh, meshPowerup, positions, sizes, active, dummy, powerUps, pelletToMeshIndex } = pelletData;
  if (!mesh || !positions || !active) return;

  const playerSpherePosition = playerSphere.position;
  const playerSphereRadius = playerSphere.geometry.parameters.radius * Math.max(playerSphere.scale.x, playerSphere.scale.y, playerSphere.scale.z);
  
  const magnetRangeSq = magnetRange * magnetRange;
  const playerSphereRadiusSq = playerSphereRadius * playerSphereRadius;
  
  const px = playerSpherePosition.x;
  const py = playerSpherePosition.y;
  const pz = playerSpherePosition.z;
  
  const affectedNormal = [];
  const affectedPowerup = [];

  for (let i = 0; i < positions.length; i++) {
    if (!active[i]) continue;

    const pelletPos = positions[i];
    
    const dx = px - pelletPos.x;
    const dy = py - pelletPos.y;
    const dz = pz - pelletPos.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    
    if (distanceSq <= magnetRangeSq && distanceSq > playerSphereRadiusSq) {
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

export function updatePlayerFade(playerSphere, lastShotTime, playerDefaultOpacity) {
  if (!lastShotTime) return null;

  const now = performance.now();
  const t = (now - lastShotTime) / 1000;
  const duration = 1.2;

  if (t >= duration) {
    playerSphere.material.opacity = playerDefaultOpacity;
    return null;
  } else {
    const x = t / duration;
    playerSphere.material.opacity = playerDefaultOpacity * Math.pow(x, 5);
    return lastShotTime;
  }
}

export function handlePelletEatingAndGrowth(playerSphere, pelletData) {
  if (!pelletData) return;

  applyPelletMagnet(playerSphere, pelletData, pelletData.pelletMagnetToggle);

  const { eatenCount, eatenSizes } = checkEatCondition(
    playerSphere,
    pelletData
  );

  if (eatenCount > 0) {
    const playerSphereRadius = playerSphere.geometry.parameters.radius * playerSphere.scale.x;
    const playerSphereVolume = (4 / 3) * Math.PI * Math.pow(playerSphereRadius, 3);

    const pelletBaseRadius = pelletData.radius;
    let pelletsVolume = 0;

    for (let i = 0; i < eatenSizes.length; i++) {
      const pelletRadius = pelletBaseRadius * eatenSizes[i];
      pelletsVolume += (4 / 3) * Math.PI * Math.pow(pelletRadius, 3);
    }

    const newVolume = playerSphereVolume + pelletsVolume;
    const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
    const scale = newRadius / playerSphere.geometry.parameters.radius;

    playerSphere.scale.setScalar(scale);
  }
}

export function updateProjectiles(projectiles, scene, playerSphere, camera, getForwardButtonPressed, playerRotation, projectileRotation) {
  const now = performance.now();
  let isSplit = false;
  let splitProjectile = null;

  const basePlayerSphereRadius = playerSphere.geometry.parameters.radius;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const otherPlayerSphere = projectiles[i];
    const t = (now - otherPlayerSphere.userData.startTime) / 1000;

    const playerSphereRadius = basePlayerSphereRadius * playerSphere.scale.x;
    const projRadius   = otherPlayerSphere.geometry.parameters.radius * otherPlayerSphere.scale.x;

    const toPlayerSphere = playerSphere.position.clone().sub(otherPlayerSphere.position);
    const dist     = toPlayerSphere.length();

    // otherPlayer Cam

    if (t <= 2) {
      const projectilePos = otherPlayerSphere.position;
      
      const followDistance = 5;
      const offset = new THREE.Vector3(
        followDistance * Math.sin(projectileRotation.yaw) * Math.cos(projectileRotation.pitch),
        followDistance * Math.sin(projectileRotation.pitch),
        followDistance * Math.cos(projectileRotation.yaw) * Math.cos(projectileRotation.pitch)
      );
      
      camera.position.copy(projectilePos).add(offset);
      camera.lookAt(projectilePos);

      const decay = Math.exp(-2 * t);
      const velocity = otherPlayerSphere.userData.velocity.clone().multiplyScalar(decay);
      otherPlayerSphere.position.add(velocity);

      return { isSplit: true, splitProjectile: otherPlayerSphere, viewingProjectile: true };
    }

    // player Cam

    isSplit = true;
    splitProjectile = otherPlayerSphere;

    if (!otherPlayerSphere.userData.peakDist) {
      otherPlayerSphere.userData.peakDist = dist;
    }

    const peakDist = otherPlayerSphere.userData.peakDist;
    const forwardPressed = getForwardButtonPressed();
    const epsilon = 0.001;

    if (dist > playerSphereRadius + epsilon && !forwardPressed) {
      const step = toPlayerSphere.normalize()
                           .multiplyScalar(Math.min(dist - playerSphereRadius, 0.2));
      otherPlayerSphere.position.add(step);
      continue;
    }

    else if (dist > playerSphereRadius + epsilon && forwardPressed) {
      otherPlayerSphere.position.copy(
        playerSphere.position.clone().add(
          toPlayerSphere.normalize().multiplyScalar(playerSphereRadius + peakDist)
        )
      );
      continue;
    }

    else{
      scene.remove(otherPlayerSphere);
      projectiles.splice(i, 1);

      const otherPlayerSphereVolume = (4 / 3) * Math.PI * Math.pow(projRadius, 3);
      const currentPlayerSphereVolume = (4 / 3) * Math.PI * Math.pow(playerSphereRadius, 3);

      const newVolume = currentPlayerSphereVolume + otherPlayerSphereVolume;
      const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
      const scale = newRadius / basePlayerSphereRadius;

      playerSphere.scale.setScalar(scale);
    }
  }

  return { isSplit, splitProjectile };
}

export function executeSplit(isSpaceShot, playerSphere, camera, scene, projectiles, playerSphereSpeed, lastShot, onShoot) {
  const now = performance.now();
  if (now - lastShot < 200) return lastShot;

  const basePlayerSphereRadius = playerSphere.geometry.parameters.radius;
  const playerSphereRadius = basePlayerSphereRadius * playerSphere.scale.x;
  const playerSphereVolume = (4/3) * Math.PI * Math.pow(playerSphereRadius, 3);

  let projSphereVolume, projSphereRadius;

  if (isSpaceShot) {
    projSphereVolume = playerSphereVolume / 2;
    const newPlayerSphereRadius = Math.cbrt((3 * projSphereVolume) / (4 * Math.PI));
    const scale = newPlayerSphereRadius / basePlayerSphereRadius;
    playerSphere.scale.setScalar(scale);
    projSphereRadius = newPlayerSphereRadius;
  } else {
    projSphereVolume = playerSphereVolume / 8;
    projSphereRadius = Math.cbrt((3 * projSphereVolume) / (4 * Math.PI));
  }

  const geometry = new THREE.SphereGeometry(projSphereRadius, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: playerSphere.material.color.clone() });
  const projectile = new THREE.Mesh(geometry, material);
  projectile.position.copy(playerSphere.position);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);

  projectile.userData.velocity = forward.clone().multiplyScalar(playerSphereSpeed * 5.5);
  projectile.userData.startTime = now;
  projectile.userData.isSpaceShot = isSpaceShot;

  scene.add(projectile);
  projectiles.push(projectile);

  if (onShoot) onShoot();

  return now;
}
