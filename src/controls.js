function clampPitch(pitch) {
  return Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
}

export function setupControls(canvas, cameraController) {
  const keys = {};
  const playerRotation = { yaw: 0, pitch: 0 };
  const cellRotation = { yaw: 0, pitch: 0 };
  const sensitivity = 0.002;
  const playerSpeed = 0.12;
  let forwardBtnIsPressed = false;
  let lastSplit = 0;
  let viewingCell = false;

  function onKeyDown(e) {
    const key = e.key.toLowerCase();
    keys[key] = true;

    if (key === 'x') cameraController.toggleDeveloperMode();
    if (key === 'w') forwardBtnIsPressed = true;
  }

  function onKeyUp(e) {
    const key = e.key.toLowerCase();
    keys[key] = false;

    if (key === 'w') forwardBtnIsPressed = false;
  }

  async function onCanvasClick() {
    try {
      await canvas.requestPointerLock();
    } catch (err) {
      if (err.name !== 'SecurityError') console.error(err);
    }
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
  canvas.addEventListener('click', onCanvasClick);
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
    canvas.removeEventListener('click', onCanvasClick);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('mousemove', onMouseMove);
  }

  return { updateCamera, getForwardButtonPressed: () => forwardBtnIsPressed, keys, playerSpeed, lastSplit, playerRotation, cellRotation, setViewingCell, dispose };
}
