import * as THREE from 'three';

export function setupControls(canvas, camera, playerSphere, pointer, scene, projectiles, onShoot) {
  const keys = {};
  const playerRotation = { yaw: 0, pitch: 0 };
  const devRotation = { yaw: 0, pitch: 0 };
  const sensitivity = 0.002;
  const playerSpeed = 0.12;
  const devSpeed = 1;
  const followDistance = 8;
  let forwardBtnIsPressed = false

  let devMode = false;
  const devCameraPos = new THREE.Vector3();
  let lastShot = 0;
  
  let smoothFollowDistance = followDistance;
  const cameraLerpSpeed = 0.005;

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;

    if (key === 'x') toggleDeveloperMode();
    if (key === 'w') forwardBtnIsPressed = true;
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;

    if (key === 'w') forwardBtnIsPressed = false;
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

  // Developer Camera
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

  function updatePlayerCamera() {
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

function tryShoot(isSpaceShot) {
  const now = performance.now();
  if (now - lastShot < 200) return; 
  lastShot = now;

  const baseRadius = playerSphere.geometry.parameters.radius;
  const playerRadius = baseRadius * playerSphere.scale.x;
  const playerVolume = (4/3) * Math.PI * Math.pow(playerRadius, 3);

  let projVolume = isSpaceShot ? playerVolume / 2 : playerVolume / 8;

  if (isSpaceShot) {
    const newPlayerVolume = playerVolume / 2;
    const newPlayerRadius = Math.cbrt((3 * newPlayerVolume) / (4 * Math.PI));
    const scale = newPlayerRadius / baseRadius;
    playerSphere.scale.setScalar(scale);
  }

  const projRadius = Math.cbrt((3 * projVolume) / (4 * Math.PI));

  const geometry = new THREE.SphereGeometry(projRadius, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: playerSphere.material.color.clone() });
  const projectile = new THREE.Mesh(geometry, material);
  projectile.position.copy(playerSphere.position);

  // Forward direction
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.normalize();

  // Set velocity + metadata
  projectile.userData.velocity = forward.multiplyScalar(playerSpeed * 5.5);
  projectile.userData.startTime = now;
  projectile.userData.isSpaceShot = isSpaceShot;

  // Add to world
  scene.add(projectile);
  projectiles.push(projectile);

  if (onShoot) onShoot();
}

function handleShootLoop() {
  if (keys['e']) {
    tryShoot(false);
  }
  requestAnimationFrame(handleShootLoop);
}
handleShootLoop();

window.addEventListener(
  'keydown',
  e => {
    if (e.code === 'Space') {
      e.preventDefault();
      tryShoot(true);
    }
  },
  true
);

return { updateCamera, getForwardButtonPressed: () => forwardBtnIsPressed };
}