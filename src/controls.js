import * as THREE from 'three';

/**
 * Sets up camera and player controls, including optional developer (free) camera mode.
 * @param {HTMLCanvasElement} canvas - The canvas element to attach controls to.
 * @param {THREE.PerspectiveCamera} camera - The main camera to control.
 * @param {THREE.Mesh} player - The player mesh to move and rotate.
 * @param {THREE.Vector2} pointer - Normalized pointer coordinates for mouse tracking.
 * @param {THREE.Scene} scene - The scene to add projectiles to.
 * @param {Array} projectiles - The array to store projectile references.
 * @param {Function} onShoot - Callback function to trigger when shooting.
 * @returns {Object} - Contains `updateCamera` function to be called each frame.
 */
export function setupControls(canvas, camera, player, pointer, scene, projectiles, onShoot) {
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
  
  // Smooth camera distance tracking
  let smoothFollowDistance = followDistance;
  const cameraLerpSpeed = 0.005; // Lower = smoother but slower, higher = faster but more jittery

  /**
   * Keyboard input handling
   */
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;

    // Toggle developer mode with 'X'
    if (key === 'x') toggleDeveloperMode();
    if (key === 'w') forwardBtnIsPressed = true;
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;

    if (key === 'w') forwardBtnIsPressed = false;
  });

  /**
   * Pointer lock for first-person-style controls
   */
  canvas.addEventListener('click', async () => {
    try {
      await canvas.requestPointerLock();
    } catch (err) {
      if (err.name !== 'SecurityError') console.error(err);
    }
  });

  /**
   * Update normalized pointer coordinates on mouse move
   */
  document.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });

  /**
   * Mouse movement handler for player and dev camera rotation
   */
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

  /**
   * Activate or deactivate mousemove events when pointer lock changes
   */
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      document.addEventListener('mousemove', onMouseMove);
    } else {
      document.removeEventListener('mousemove', onMouseMove);
    }
  });

  /**
   * Toggle developer free camera mode
   */
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

  /**
   * Updates camera position depending on current mode
   */
  function updateCamera() {
    if (devMode) {
      updateDevCamera();
    } else {
      updatePlayerCamera();
    }
  }

  /**
   * Developer mode camera movement
   */
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

  /**
   * Clamp player position inside a bounding box
   * @param {THREE.Vector3} position - Position to clamp
   * @param {THREE.Mesh} player - Player mesh for radius calculation
   * @returns {THREE.Vector3} - Clamped position
   */
  function clampToBoxBounds(position, player) {
    const BOX_SIZE = 500;
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

  /**
   * Update camera to follow player with optional movement
   */
  function updatePlayerCamera() {
    if (!player || !player.position) return;

    // Calculate player radius (scaled) to adjust camera distance
    const playerRadius = player.geometry.parameters.radius * Math.max(
      player.scale.x,
      player.scale.y,
      player.scale.z
    );
    
    // Make camera distance proportional to player size so it appears constant on screen
    const targetFollowDistance = playerRadius * 8; // Adjust multiplier for desired screen size
    
    // Smoothly interpolate (lerp) the camera distance to avoid sudden jumps
    smoothFollowDistance += (targetFollowDistance - smoothFollowDistance) * cameraLerpSpeed;
    
    const offset = new THREE.Vector3(
      smoothFollowDistance * Math.sin(playerRotation.yaw) * Math.cos(playerRotation.pitch),
      smoothFollowDistance * Math.sin(playerRotation.pitch),
      smoothFollowDistance * Math.cos(playerRotation.yaw) * Math.cos(playerRotation.pitch)
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

function tryShoot(isSpaceShot) {
  const now = performance.now();
  if (now - lastShot < 200) return; 
  lastShot = now;

  // Player radius & volume
  const baseRadius = player.geometry.parameters.radius;
  const playerRadius = baseRadius * player.scale.x;
  const playerVolume = (4/3) * Math.PI * Math.pow(playerRadius, 3);

  // Compute projectile volume
  let projVolume = isSpaceShot ? playerVolume / 2 : playerVolume / 8;

  // If space shot, shrink the player (half volume)
  if (isSpaceShot) {
    const newPlayerVolume = playerVolume / 2;
    const newPlayerRadius = Math.cbrt((3 * newPlayerVolume) / (4 * Math.PI));
    const scale = newPlayerRadius / baseRadius;
    player.scale.setScalar(scale);
  }

  // Convert projectile volume → radius
  const projRadius = Math.cbrt((3 * projVolume) / (4 * Math.PI));

  // Create projectile
  const geometry = new THREE.SphereGeometry(projRadius, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: player.material.color.clone() });
  const projectile = new THREE.Mesh(geometry, material);
  projectile.position.copy(player.position);

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

/* ---------------------------
   Continuous regular shooting
--------------------------- */
function handleShootLoop() {
  if (keys['e']) {
    tryShoot(false);
  }
  requestAnimationFrame(handleShootLoop);
}
handleShootLoop();

/* ---------------------------
   Spacebar → Space Shot
--------------------------- */
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