import * as THREE from 'three';

export function checkEatCondition(player, pelletData, cameraDistanceFromPlayer) {
  if (!player || !pelletData) return { eatenCount: 0, totalSize: 0, eatenSizes: [] };

  const { mesh, meshPowerup, positions, sizes, active, radius, dummy, powerUps, pelletToMeshIndex } = pelletData;
  if (!mesh || !positions || !active || !sizes) return { eatenCount: 0, totalSize: 0, eatenSizes: [] };

  const playerScale = Math.max(player.scale.x, player.scale.y, player.scale.z);
  const playerRadius = player.geometry.parameters.radius * playerScale;
  const playerPosition = player.position;

  const eatenSizes = [];
  let eatenCount = 0;
  let totalSize = 0;
  let newPelletMagnetToggle = pelletData.pelletMagnetToggle || false;

  for (let i = 0; i < positions.length; i++) {
    if (!active[i]) continue;

    const distance = playerPosition.distanceTo(positions[i]);
    if (distance <= playerRadius) {
      active[i] = false;
      eatenCount++;
      totalSize += sizes[i];
      eatenSizes.push(sizes[i]);

      cameraDistanceFromPlayer += 1;

      const isPowerUp = powerUps[i];
      if (isPowerUp && !newPelletMagnetToggle) {
        newPelletMagnetToggle = togglePelletMagnet(player, pelletData, newPelletMagnetToggle);
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

  return { eatenCount, totalSize, eatenSizes, pelletMagnetToggle: newPelletMagnetToggle };
}

// Pellet Magnet
function togglePelletMagnet(player, pelletData, currentToggle) {
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

export function applyPelletMagnet(player, pelletData, pelletMagnetToggle, magnetRange = 5, attractionSpeed = 0.15) {
  if (!pelletMagnetToggle || !player || !pelletData) return;

  const { mesh, meshPowerup, positions, sizes, active, dummy, powerUps, pelletToMeshIndex } = pelletData;
  if (!mesh || !positions || !active) return;

  const playerPosition = player.position;
  const playerRadius = player.geometry.parameters.radius * Math.max(player.scale.x, player.scale.y, player.scale.z);
  
  const magnetRangeSq = magnetRange * magnetRange;
  const playerRadiusSq = playerRadius * playerRadius;
  
  const px = playerPosition.x;
  const py = playerPosition.y;
  const pz = playerPosition.z;
  
  const affectedNormal = [];
  const affectedPowerup = [];

  for (let i = 0; i < positions.length; i++) {
    if (!active[i]) continue;

    const pelletPos = positions[i];
    
    const dx = px - pelletPos.x;
    const dy = py - pelletPos.y;
    const dz = pz - pelletPos.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    
    if (distanceSq <= magnetRangeSq && distanceSq > playerRadiusSq) {
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

export function updatePlayerFade(player, lastShotTime, playerDefaultOpacity) {
  if (!lastShotTime) return null;

  const now = performance.now();
  const t = (now - lastShotTime) / 1000;
  const duration = 1.2;

  if (t >= duration) {
    player.material.opacity = playerDefaultOpacity;
    return null;
  } else {
    const x = t / duration;
    player.material.opacity = playerDefaultOpacity * Math.pow(x, 5);
    return lastShotTime;
  }
}

export function handlePelletEatingAndGrowth(player, pelletData, cameraDistanceFromPlayer) {
  if (!pelletData) return;

  applyPelletMagnet(player, pelletData, pelletData.pelletMagnetToggle);

  const { eatenCount, eatenSizes } = checkEatCondition(
    player,
    pelletData,
    cameraDistanceFromPlayer
  );

  if (eatenCount > 0) {
    const playerRadius = player.geometry.parameters.radius * player.scale.x;
    const playerVolume = (4 / 3) * Math.PI * Math.pow(playerRadius, 3);

    const pelletBaseRadius = pelletData.radius;
    let pelletsVolume = 0;

    for (let i = 0; i < eatenSizes.length; i++) {
      const pelletRadius = pelletBaseRadius * eatenSizes[i];
      pelletsVolume += (4 / 3) * Math.PI * Math.pow(pelletRadius, 3);
    }

    const newVolume = playerVolume + pelletsVolume;
    const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
    const scale = newRadius / player.geometry.parameters.radius;

    player.scale.setScalar(scale);
  }
}

export function updateProjectiles(projectiles, scene, player, camera, getForwardButtonPressed) {
  const now = performance.now();
  let isSplit = false;
  let splitProjectile = null;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const t = (now - p.userData.startTime) / 1000;

    const playerRadius = player.geometry.parameters.radius * player.scale.x;
    const projRadius   = p.geometry.parameters.radius * p.scale.x;
    const surfaceDist  = playerRadius + projRadius;

    const toPlayer = player.position.clone().sub(p.position);
    const dist     = toPlayer.length();

    if (t <= 2) {
      const pv = (p.isVector3 ? p.clone() : new THREE.Vector3().copy(p.position || p));
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion);
      const camPos = pv.add(back.multiplyScalar(5));
      camera.position.copy(camPos);
      camera.lookAt(pv);

      const decay = Math.exp(-2 * t);
      const velocity = p.userData.velocity.clone().multiplyScalar(decay);
      p.position.add(velocity);

      continue;
    }

    isSplit = true;
    splitProjectile = p;

    if (!p.userData.peakDist) {
      p.userData.peakDist = dist;
    }

    const peakDist = p.userData.peakDist;
    const forwardPressed = getForwardButtonPressed();

    if (dist > surfaceDist && !forwardPressed) {
      const step = toPlayer.normalize()
                           .multiplyScalar(Math.min(dist - surfaceDist, 0.2));
      p.position.add(step);
      continue;
    }

    if (dist > surfaceDist && forwardPressed) {
      p.position.copy(
        player.position.clone().add(
          toPlayer.normalize().multiplyScalar(surfaceDist + peakDist)
        )
      );
      continue;
    }
  }

  return { isSplit, splitProjectile };
}
