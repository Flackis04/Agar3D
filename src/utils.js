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
