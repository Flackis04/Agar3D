function clampPitch(pitch) {
  return Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
}

export function setupControls(canvas, cameraController) {
  const keys = {};
  const playerRotation = { yaw: 0, pitch: 0 };
  const projectileRotation = { yaw: 0, pitch: 0 };
  const sensitivity = 0.002;
  const playerSpeed = 0.12;
  let forwardBtnIsPressed = false;
  let lastShot = 0;
  let viewingProjectile = false;

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;

    if (key === 'x') cameraController.toggleDeveloperMode();
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

  function onMouseMove(e) {
    if (cameraController.isDevMode()) {
      cameraController.updateDevRotation(e.movementX, e.movementY, sensitivity);
    } else if (viewingProjectile) {
      projectileRotation.yaw -= e.movementX * sensitivity;
      projectileRotation.pitch += e.movementY * sensitivity;
      projectileRotation.pitch = clampPitch(projectileRotation.pitch);
    } else {
      playerRotation.yaw -= e.movementX * sensitivity;
      playerRotation.pitch += e.movementY * sensitivity;
      playerRotation.pitch = clampPitch(playerRotation.pitch);
    }
  }

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      document.addEventListener('mousemove', onMouseMove);
    } else {
      document.removeEventListener('mousemove', onMouseMove);
    }
  });

  function updateCamera() {
    cameraController.updateCamera(playerRotation, keys, playerSpeed);
  }

  function setViewingProjectile(viewing) {
    if (viewing && !viewingProjectile) {
      // Copy current player rotation to projectile rotation when starting to view
      projectileRotation.yaw = playerRotation.yaw;
      projectileRotation.pitch = playerRotation.pitch;
    }
    viewingProjectile = viewing;
  }

  return { updateCamera, getForwardButtonPressed: () => forwardBtnIsPressed, keys, playerSpeed, lastShot, playerRotation, projectileRotation, setViewingProjectile };
}