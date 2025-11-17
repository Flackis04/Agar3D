import * as THREE from 'three';

export function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const pixelRatio = window.devicePixelRatio;
  const width = Math.floor(canvas.clientWidth * pixelRatio);
  const height = Math.floor(canvas.clientHeight * pixelRatio);
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) renderer.setSize(width, height, false);
  return needResize;
}

export function updateDistanceFadeInstanced(pelletData, playerPosition, fadeStartDistance, fadeEndDistance) {
  const { instancedMesh, positions, baseColors, opacities } = pelletData;
  const updateDistance = fadeStartDistance + 5;
  let needsUpdate = false;

  for (let i = 0; i < positions.length; i++) {
    const distance = playerPosition.distanceTo(positions[i]);
    let opacity = 0;

    if (distance < fadeStartDistance) {
      if (distance <= fadeEndDistance) {
        opacity = 1;
      } else {
        opacity = 1 - (distance - fadeEndDistance) / (fadeStartDistance - fadeEndDistance);
      }
    }

    if (Math.abs(opacities[i] - opacity) > 0.01) {
      opacities[i] = opacity;
      needsUpdate = true;
    }
  }

  if (needsUpdate && instancedMesh.instanceColor) {
    const color = new THREE.Color();
    for (let i = 0; i < positions.length; i++) {
      color.copy(baseColors[i]);
      if (opacities[i] < 1) color.multiplyScalar(opacities[i]);
      instancedMesh.setColorAt(i, color);
    }
    instancedMesh.instanceColor.needsUpdate = true;
  }
}

export function updateBorderFade(borderParticles, playerPosition, fadeStartDistance, fadeEndDistance) {
  if (!borderParticles || !borderParticles.material) return;

  const BOX_SIZE = 500;
  const BOX_HALF = BOX_SIZE / 2;

  const px = playerPosition.x;
  const py = playerPosition.y;
  const pz = playerPosition.z;

  const nearestDistance = Math.min(
    Math.abs(px + BOX_HALF), Math.abs(px - BOX_HALF),
    Math.abs(py + BOX_HALF), Math.abs(py - BOX_HALF),
    Math.abs(pz + BOX_HALF), Math.abs(pz - BOX_HALF)
  );

  let opacity = 0;
  if (nearestDistance < fadeStartDistance) {
    if (nearestDistance <= fadeEndDistance) {
      opacity = 1;
    } else {
      opacity = 1 - (nearestDistance - fadeEndDistance) / (fadeStartDistance - fadeEndDistance);
    }
  }

  if (borderParticles.material.uniforms && borderParticles.material.uniforms.opacity) {
    borderParticles.material.uniforms.opacity.value = opacity;
  }
}

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

export function updateProjectiles(projectiles, scene, player, camera, getForwardButtonPressed) {
  const now = performance.now();
  let isSplit = false;
  let splitProjectile = null;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const t = (now - p.userData.startTime) / 1000;

    const playerRadius = player.geometry.parameters.radius * player.scale.x;
    const projRadius = p.geometry.parameters.radius * p.scale.x;
    const surfaceDist = playerRadius + projRadius;

    const toPlayer = player.position.clone().sub(p.position);
    const dist = toPlayer.length();

    /* ---- Space Shot Behavior ---- */

    if (t > 2) {
      isSplit = true;
      splitProjectile = p;

      if (!p.userData.peakDist) {
        p.userData.peakDist = dist;
      }

      const peakDist = p.userData.peakDist;
      const forwardPressed = getForwardButtonPressed();

      if (dist > surfaceDist && !forwardPressed) {
        const step = toPlayer.normalize().multiplyScalar(
          Math.min(dist - surfaceDist, 0.2)
        );
        p.position.add(step);
      } else if (dist > surfaceDist && forwardPressed) {
        p.position.copy(
          player.position.clone().add(
            toPlayer.normalize().multiplyScalar(
              surfaceDist + peakDist
            )
          )
        );
      } 
      if (dist <= surfaceDist) {
        // pass
      }
    } 
    
    else {
      
      const pv = (p.isVector3 ? p.clone() : new THREE.Vector3().copy(p.position || p));
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion);
      const camPos = pv.add(back.multiplyScalar(5));
      camera.position.copy(camPos);
      camera.lookAt(pv);

      if (t > 2) {
        scene.remove(p);
        projectiles.splice(i, 1);
        continue;
      }


      const decay = Math.exp(-2 * t);
      const velocity = p.userData.velocity.clone().multiplyScalar(decay);
      p.position.add(velocity);
    }
  }
  return { isSplit, splitProjectile };
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