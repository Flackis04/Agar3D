function clampPitch(pitch) {
  return Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
}

// Browser input lives here. This module does not move the player directly;
// it records intent, and the game loop sends that intent to the server.
export function setupControls(canvas, cameraController) {
  const keys = {};
  const playerRotation = { yaw: 0, pitch: 0 };
  const cellRotation = { yaw: 0, pitch: 0 };
  const sensitivity = 0.002;
  const playerSpeed = 0.12;
  let isShooting = false;
  let weaponMode = 'bullet';
  let lastSplit = 0;
  let viewingCell = false;

  function onKeyDown(e) {
    const key = e.key.toLowerCase();
    keys[key] = true;

    if (key === 'x') cameraController.toggleDeveloperMode();
    if (key === '1') weaponMode = 'bullet';
    if (key === '2') weaponMode = 'laser';
  }

  function onKeyUp(e) {
    const key = e.key.toLowerCase();
    keys[key] = false;
  }

  async function onCanvasClick() {
    if (document.pointerLockElement === canvas) return;
    try {
      await canvas.requestPointerLock();
    } catch (err) {
      if (err.name !== 'SecurityError') console.error(err);
    }
  }

  function onMouseDown(e) {
    if (e.button !== 0 || document.pointerLockElement !== canvas) return;
    isShooting = true;
  }

  function onMouseUp(e) {
    if (e.button !== 0) return;
    isShooting = false;
  }

  function onMouseMove(e) {
    if (cameraController.isDevMode()) {
      cameraController.updateDevRotation(e.movementX, e.movementY, sensitivity);
    } else if (viewingCell) {
      cellRotation.yaw -= e.movementX * sensitivity;
      cellRotation.pitch += e.movementY * sensitivity;
      cellRotation.pitch = clampPitch(cellRotation.pitch);
    } else {
      playerRotation.yaw -= e.movementX * sensitivity;
      playerRotation.pitch += e.movementY * sensitivity;
      playerRotation.pitch = clampPitch(playerRotation.pitch);
    }
  }

  function onPointerLockChange() {
    if (document.pointerLockElement === canvas) {
      document.addEventListener('mousemove', onMouseMove);
    } else {
      document.removeEventListener('mousemove', onMouseMove);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('mousedown', onMouseDown);
  document.addEventListener('pointerlockchange', onPointerLockChange);

  function updateCamera(magnetActive) {
    cameraController.updateCamera(playerRotation, keys, playerSpeed, magnetActive);
  }

  function setViewingCell(viewing) {
    if (viewing && !viewingCell) {
      
      cellRotation.yaw = playerRotation.yaw;
      cellRotation.pitch = playerRotation.pitch;
    }
    viewingCell = viewing;
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('click', onCanvasClick);
    canvas.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('mousemove', onMouseMove);
  }

  return {
    updateCamera,
    getMovementInput: () => ({
      forward: Boolean(keys.w),
      backward: Boolean(keys.s),
      left: Boolean(keys.a),
      right: Boolean(keys.d),
      up: Boolean(keys.e),
      down: Boolean(keys.q),
    }),
    getForwardButtonPressed: () => Boolean(keys.w),
    getShootButtonPressed: () => isShooting,
    getWeaponMode: () => weaponMode,
    keys,
    playerSpeed,
    lastSplit,
    playerRotation,
    cellRotation,
    setViewingCell,
    dispose,
  };
}
