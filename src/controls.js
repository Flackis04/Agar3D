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
    const dynamicFollowDistance = playerRadius * 5; // Adjust multiplier for desired screen size
    
    const offset = new THREE.Vector3(
      dynamicFollowDistance * Math.sin(playerRotation.yaw) * Math.cos(playerRotation.pitch),
      dynamicFollowDistance * Math.sin(playerRotation.pitch),
      dynamicFollowDistance * Math.cos(playerRotation.yaw) * Math.cos(playerRotation.pitch)
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

  /**
   * Try to shoot a projectile
   */
  function tryShoot(isSpaceShot = false) {
    const now = performance.now();
    if (now - lastShot < 200) return; // 0.05s cooldown
    lastShot = now;

    // Calculate projectile radius from 1/8 player volume
    const playerRadius = player.geometry.parameters.radius * player.scale.x;
    const playerVolume = (4/3) * Math.PI * Math.pow(playerRadius, 3);
    let projVolume = playerVolume / 8;
    
    // If space shot, use half the volume and halve player volume
    if (isSpaceShot) {
      projVolume = playerVolume / 2;
      const newPlayerVolume = playerVolume / 2;
      const newPlayerRadius = Math.cbrt((3 * newPlayerVolume) / (4 * Math.PI));
      const scale = newPlayerRadius / player.geometry.parameters.radius;
      player.scale.setScalar(scale);
    }
    
    const projRadius = Math.cbrt((3 * projVolume) / (4 * Math.PI));

    // Get player color
    const color = player.material.color.clone();

    // Create projectile mesh
    const geometry = new THREE.SphereGeometry(projRadius, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color });
    const projectile = new THREE.Mesh(geometry, material);
    projectile.position.copy(player.position);

    // Get forward direction
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.normalize();

    // Set projectile velocity
    projectile.userData.velocity = forward.multiplyScalar(playerSpeed * 5.5);
    projectile.userData.startTime = performance.now();
    projectile.userData.isSpaceShot = isSpaceShot;

    // Add projectile to scene and projectiles array
    scene.add(projectile);
    projectiles.push(projectile);
    if (onShoot) onShoot();
  }

  /**
   * Handle shooting in a loop if 'E' is held down
   */
  function handleShootLoop() {
    if (keys['e']) tryShoot(false);
    requestAnimationFrame(handleShootLoop);
  }
  handleShootLoop();

  // Handle space key for shooting
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      tryShoot(true);
    }
  }, true);

  return { updateCamera, getForwardButtonPressed: () => forwardBtnIsPressed };
}
