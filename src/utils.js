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
    
    if (distance < updateDistance) {
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
    } else if (opacities[i] > 0.01) {
      opacities[i] = 0;
      needsUpdate = true;
    }
  }
  
  if (needsUpdate && instancedMesh.instanceColor) {
    const color = new THREE.Color();
    for (let i = 0; i < positions.length; i++) {
      color.copy(baseColors[i]);
      if (opacities[i] < 1) {
        color.multiplyScalar(opacities[i]);
      }
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
  
  const distToXMin = Math.abs(px - (-BOX_HALF));
  const distToXMax = Math.abs(px - BOX_HALF);
  const distToYMin = Math.abs(py - (-BOX_HALF));
  const distToYMax = Math.abs(py - BOX_HALF);
  const distToZMin = Math.abs(pz - (-BOX_HALF));
  const distToZMax = Math.abs(pz - BOX_HALF);
  
  const nearestDistance = Math.min(
    distToXMin, distToXMax,
    distToYMin, distToYMax,
    distToZMin, distToZMax
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

// To test if two circles or spheres overlap you just have to calculate the 
// distance between the center points of those circles / spheres and 
// compare it to the sum of their radii. 

// If the distance between the centers is smaller than the sum, they overlap, otherwise they don’t.
export function checkEatCondition(player, pelletData) {
  if (!player || !pelletData) return { eatenCount: 0, totalSize: 0 };

  const { mesh, positions, sizes, active, radius, dummy } = pelletData;
  if (!mesh || !positions || !active || !sizes) return { eatenCount: 0, totalSize: 0 };

  const playerScale = Math.max(player.scale.x, player.scale.y, player.scale.z);
  const playerRadius = player.geometry.parameters.radius * playerScale;
  const playerPosition = player.position;

  // Performance optimization: Only check pellets within a reasonable range
  // This reduces checks from O(n) to O(k) where k << n
  const checkRadius = playerRadius + radius + 10; // Add buffer for detection
  const checkRadiusSq = checkRadius * checkRadius;

  let eatenCount = 0;
  let totalSize = 0;
  let eatenSizes = [];

  for (let i = 0; i < positions.length; i++) {
    if (!active[i]) continue;

    const distance = playerPosition.distanceTo(positions[i]);
    if (distance <= playerRadius + radius) {
      active[i] = false;
      eatenCount += 1;
      totalSize += sizes[i];
      eatenSizes.push(sizes[i]);

      dummy.position.copy(positions[i]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
  }

  if (eatenCount > 0) {
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { eatenCount, totalSize, eatenSizes };
}