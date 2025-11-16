import * as THREE from 'three';

/**
 * Resizes the renderer to match the display size if necessary.
 * @param {THREE.WebGLRenderer} renderer - The renderer to resize.
 * @returns {boolean} - True if the renderer was resized, false otherwise.
 */
export function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const pixelRatio = window.devicePixelRatio;
  const width = Math.floor(canvas.clientWidth * pixelRatio);
  const height = Math.floor(canvas.clientHeight * pixelRatio);
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) renderer.setSize(width, height, false);
  return needResize;
}

/**
 * Updates the opacity of instanced pellets based on distance from the player.
 * @param {Object} pelletData - Pellet information containing instancedMesh, positions, baseColors, opacities.
 * @param {THREE.Vector3} playerPosition - Current position of the player.
 * @param {number} fadeStartDistance - Distance at which pellets start fading.
 * @param {number} fadeEndDistance - Distance at which pellets are fully visible.
 */
export function updateDistanceFadeInstanced(pelletData, playerPosition, fadeStartDistance, fadeEndDistance) {
  const { instancedMesh, positions, baseColors, opacities } = pelletData;
  const updateDistance = fadeStartDistance + 5; // small buffer
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

/**
 * Updates the opacity of border particles based on player's proximity to the box edges.
 * @param {THREE.Points} borderParticles - The particle system representing the box border.
 * @param {THREE.Vector3} playerPosition - Current position of the player.
 * @param {number} fadeStartDistance - Distance at which edges start fading.
 * @param {number} fadeEndDistance - Distance at which edges are fully visible.
 */
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

/**
 * Checks whether the player has eaten any pellets.
 * Uses simple sphere-sphere collision detection.
 * @param {THREE.Mesh} player - The player mesh.
 * @param {Object} pelletData - The instanced pellet data.
 * @param {number} cameraDistanceFromPlayer - Optional: used for debugging camera adjustments.
 * @returns {Object} - Contains eatenCount, totalSize, and eatenSizes array.
 */
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

      cameraDistanceFromPlayer += 1; // optional debug log

      const isPowerUp = powerUps[i];
      if (isPowerUp) {
        newPelletMagnetToggle = togglePelletMagnet(player, pelletData, newPelletMagnetToggle);
        pelletData.pelletMagnetToggle = newPelletMagnetToggle; // Store the state
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

function togglePelletMagnet(player, pelletData, pelletMagnetToggle){
  return !pelletMagnetToggle;
}

/**
 * Attracts pellets within range towards the player when magnet is active
 * @param {THREE.Mesh} player - The player mesh
 * @param {Object} pelletData - The pellet data containing positions, meshes, etc.
 * @param {boolean} pelletMagnetToggle - Whether the magnet is active
 * @param {number} magnetRange - Distance within which pellets are attracted (default 10)
 * @param {number} attractionSpeed - Speed at which pellets move towards player (default 0.15)
 */
export function applyPelletMagnet(player, pelletData, pelletMagnetToggle, magnetRange = 5, attractionSpeed = 0.15) {
  if (!pelletMagnetToggle || !player || !pelletData) return;

  const { mesh, meshPowerup, positions, sizes, active, dummy, powerUps, pelletToMeshIndex } = pelletData;
  if (!mesh || !positions || !active) return;

  const playerPosition = player.position;
  const playerRadius = player.geometry.parameters.radius * Math.max(player.scale.x, player.scale.y, player.scale.z);
  
  // Pre-calculate squared distances to avoid expensive sqrt operations
  const magnetRangeSq = magnetRange * magnetRange;
  const playerRadiusSq = playerRadius * playerRadius;
  
  // Cache these for reuse
  const px = playerPosition.x;
  const py = playerPosition.y;
  const pz = playerPosition.z;
  
  // Track affected pellets to batch matrix updates
  const affectedNormal = [];
  const affectedPowerup = [];

  // First pass: update positions only (fast)
  for (let i = 0; i < positions.length; i++) {
    if (!active[i]) continue;

    const pelletPos = positions[i];
    
    // Calculate squared distance (faster than distanceTo which uses sqrt)
    const dx = px - pelletPos.x;
    const dy = py - pelletPos.y;
    const dz = pz - pelletPos.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    
    // Only attract pellets within magnetRange and outside the player
    if (distanceSq <= magnetRangeSq && distanceSq > playerRadiusSq) {
      // Calculate direction and move pellet (no sqrt needed for small movements)
      const distance = Math.sqrt(distanceSq);
      const factor = attractionSpeed / distance;
      
      pelletPos.x += dx * factor;
      pelletPos.y += dy * factor;
      pelletPos.z += dz * factor;

      // Track which pellets were affected
      const isPowerUp = powerUps && powerUps[i];
      if (isPowerUp) {
        affectedPowerup.push({ i, meshIndex: pelletToMeshIndex[i], size: sizes[i] });
      } else {
        affectedNormal.push({ i, meshIndex: pelletToMeshIndex[i], size: sizes[i] });
      }
    }
  }

  // Second pass: batch update matrices only for affected pellets
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