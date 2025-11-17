import * as THREE from 'three';

export function createCameraController(camera, playerSphere) {
  let devMode = false;
  const devCameraPos = new THREE.Vector3();
  const devRotation = { yaw: 0, pitch: 0 };
  const devSpeed = 1;
  
  let smoothFollowDistance = 8;
  const cameraLerpSpeed = 0.005;

  function toggleDeveloperMode() {
    devMode = !devMode;
    console.log(`Developer mode ${devMode ? 'enabled' : 'disabled'}`);
    
    if (devMode) {
      devCameraPos.copy(camera.position);

      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      devRotation.yaw = Math.atan2(direction.x, direction.z);
      devRotation.pitch = Math.asin(-direction.y);
    }
  }

  function updateDevCamera(keys) {
    if (!camera) return;
    const direction = new THREE.Vector3(
      Math.sin(devRotation.yaw) * Math.cos(devRotation.pitch),
      -Math.sin(devRotation.pitch),
      Math.cos(devRotation.yaw) * Math.cos(devRotation.pitch)
    );

    if (keys['w']) devCameraPos.addScaledVector(direction, devSpeed);

    camera.position.copy(devCameraPos);
    camera.lookAt(devCameraPos.clone().add(direction));
  }

  function updatePlayerCamera(playerRotation, keys, playerSpeed) {
    if (!playerSphere || !playerSphere.position) return;

    const playerRadius = playerSphere.geometry.parameters.radius * Math.max(
      playerSphere.scale.x,
      playerSphere.scale.y,
      playerSphere.scale.z
    );
    
    const targetFollowDistance = playerRadius * 8;
    
    smoothFollowDistance += (targetFollowDistance - smoothFollowDistance) * cameraLerpSpeed;
    
    const offset = new THREE.Vector3(
      smoothFollowDistance * Math.sin(playerRotation.yaw) * Math.cos(playerRotation.pitch),
      smoothFollowDistance * Math.sin(playerRotation.pitch),
      smoothFollowDistance * Math.cos(playerRotation.yaw) * Math.cos(playerRotation.pitch)
    );

    const forward = offset.clone().normalize().negate();
    if (keys['w']) {
      const nextPosition = playerSphere.position.clone().addScaledVector(forward, playerSpeed);
      clampToBoxBounds(nextPosition, playerSphere);
      playerSphere.position.copy(nextPosition);
    }

    camera.position.copy(playerSphere.position.clone().add(offset));
    camera.lookAt(playerSphere.position);
  }

  function clampToBoxBounds(position, playerSphere) {
    const BOX_SIZE = 500;
    const BOX_HALF = BOX_SIZE / 2;

    const playerRadius = playerSphere.geometry.parameters.radius * Math.max(
      playerSphere.scale.x,
      playerSphere.scale.y,
      playerSphere.scale.z
    );

    const minBound = -BOX_HALF + playerRadius;
    const maxBound = BOX_HALF - playerRadius;

    position.x = Math.max(minBound, Math.min(maxBound, position.x));
    position.y = Math.max(minBound, Math.min(maxBound, position.y));
    position.z = Math.max(minBound, Math.min(maxBound, position.z));

    return position;
  }

  function updateCamera(playerRotation, keys, playerSpeed) {
    if (devMode) {
      updateDevCamera(keys);
    } else {
      updatePlayerCamera(playerRotation, keys, playerSpeed);
    }
  }

  function updateDevRotation(movementX, movementY, sensitivity) {
    devRotation.yaw -= movementX * sensitivity;
    devRotation.pitch += movementY * sensitivity;
    devRotation.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, devRotation.pitch));
  }

  function isDevMode() {
    return devMode;
  }

  return { updateCamera, toggleDeveloperMode, updateDevRotation, isDevMode };
}
