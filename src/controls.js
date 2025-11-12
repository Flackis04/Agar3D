import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

export function setupControls(canvas, camera, player, pointer) {
  const keys = {};
  const playerRotation = { yaw: 0, pitch: 0 };
  const devRotation = { yaw: 0, pitch: 0 };
  const sensitivity = 0.002;
  const playerSpeed = 0.12;
  const devSpeed = 1;
  const followDistance = 8;

  let devMode = false;
  const devCameraPos = new THREE.Vector3();

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;
    if (key === 'x') toggleDeveloperMode();
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('click', async () => {
    try {
      await canvas.requestPointerLock();
    } catch (err) {
      if (err.name !== 'SecurityError') console.error(err);
    }
  });

  document.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });

  function onMouseMove(e) {
    if (devMode) {
      devRotation.yaw -= e.movementX * sensitivity;
      devRotation.pitch += e.movementY * sensitivity;
      devRotation.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, devRotation.pitch));
    } else {
      playerRotation.yaw -= e.movementX * sensitivity;
      playerRotation.pitch += e.movementY * sensitivity;
      playerRotation.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, playerRotation.pitch));
    }
  }

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      document.addEventListener('mousemove', onMouseMove);
    } else {
      document.removeEventListener('mousemove', onMouseMove);
    }
  });

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

  function updateCamera() {
    if (devMode) {
      updateDevCamera();
    } else {
      updatePlayerCamera();
    }
  }

  function updateDevCamera() {
    const direction = new THREE.Vector3(
      Math.sin(devRotation.yaw) * Math.cos(devRotation.pitch),
      -Math.sin(devRotation.pitch),
      Math.cos(devRotation.yaw) * Math.cos(devRotation.pitch)
    );

    if (keys['w']) devCameraPos.addScaledVector(direction, devSpeed);

    camera.position.copy(devCameraPos);
    camera.lookAt(devCameraPos.clone().add(direction));
  }

  function clampToBoxBounds(position, player) {
    const BOX_SIZE = 200;
    const BOX_HALF = BOX_SIZE / 2;
    
    const playerRadius = player.geometry.parameters.radius * Math.max(
      player.scale.x,
      player.scale.y,
      player.scale.z
    );
    
    const minBound = -BOX_HALF + playerRadius;
    const maxBound = BOX_HALF - playerRadius;
    
    position.x = Math.max(minBound, Math.min(maxBound, position.x));
    position.y = Math.max(minBound, Math.min(maxBound, position.y));
    position.z = Math.max(minBound, Math.min(maxBound, position.z));
    
    return position;
  }

  function updatePlayerCamera() {
    const offset = new THREE.Vector3(
      followDistance * Math.sin(playerRotation.yaw) * Math.cos(playerRotation.pitch),
      followDistance * Math.sin(playerRotation.pitch),
      followDistance * Math.cos(playerRotation.yaw) * Math.cos(playerRotation.pitch)
    );

    const forward = offset.clone().normalize().negate();
    
    if (keys['w']) {
      const nextPosition = player.position.clone().addScaledVector(forward, playerSpeed);
      clampToBoxBounds(nextPosition, player);
      player.position.copy(nextPosition);
    }

    camera.position.copy(player.position.clone().add(offset));
    camera.lookAt(player.position);
  }

  return { updateCamera };
}
