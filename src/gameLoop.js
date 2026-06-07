import { updateFogDistance } from "./scene.js";
import { handleDevModeObjectVisibility } from "./camera.js";
import { applyNetworkSmoothing, sendPlayerInput } from "./multiplayer.js";
import { updatePelletMagnetVisual } from "./utils/playerUtils.js";
import { createCameraAimSampler } from "./aiming.js";

export function createAnimationLoop(
  renderer,
  scene,
  camera,
  gameState,
  cameraController,
  controls,
  stats
) {
  const { step } = createGameFrame(
    scene,
    camera,
    gameState,
    cameraController,
    controls,
    stats
  );

  function animate() {
    requestAnimationFrame(animate);
    step();
    renderer.render(scene, camera);
  }

  return { animate, getLastSplitTime: () => null };
}

export function createGameFrame(
  scene,
  camera,
  gameState,
  cameraController,
  controls,
  stats
) {
  let lastInputPayload = {
    forward: false,
    movement: {},
    shoot: false,
    rotation: { yaw: 0, pitch: 0 },
  };
  let lastInputSend = 0;
  let lastRadius = null;
  let lastCameraDistance = null;
  let lastMagnetActive = null;
  let lastFrameTime = performance.now();
  const sampleCameraAim = createCameraAimSampler();

  function step(frameDelta) {
    // One call to step() is one rendered game frame in the browser.
    // The server owns multiplayer movement, while this client keeps the
    // rendered camera and outgoing aim ray on the same frame.
    if (!gameState.playerCell) return;
    if (window.isPaused) return;
    const now = performance.now();
    const measuredDelta = (now - lastFrameTime) / 1000;
    const deltaTime = Math.min(
      Number.isFinite(frameDelta) ? frameDelta : measuredDelta,
      0.1
    );
    lastFrameTime = now;

    stats?.begin();

    handleDevModeObjectVisibility(
      scene,
      cameraController,
      gameState.pelletData,
      gameState.border
    );
    const sendInput = (aim) => {
      // This payload is the full client intent: "am I moving forward?"
      // plus "which direction am I facing?"
      const payload = {
        forward: controls.getForwardButtonPressed(),
        movement: controls.getMovementInput?.() || {
          forward: controls.getForwardButtonPressed(),
        },
        shoot: controls.getShootButtonPressed?.() || false,
        rotation: {
          yaw: controls.playerRotation.yaw,
          pitch: controls.playerRotation.pitch,
        },
        aim,
      };
      const rotationChanged =
        Math.abs(payload.rotation.yaw - lastInputPayload.rotation.yaw) >
          0.005 ||
        Math.abs(payload.rotation.pitch - lastInputPayload.rotation.pitch) >
          0.005;
      const movementChanged =
        Boolean(payload.movement.forward) !==
          Boolean(lastInputPayload.movement.forward) ||
        Boolean(payload.movement.backward) !==
          Boolean(lastInputPayload.movement.backward) ||
        Boolean(payload.movement.left) !== Boolean(lastInputPayload.movement.left) ||
        Boolean(payload.movement.right) !==
          Boolean(lastInputPayload.movement.right) ||
        Boolean(payload.movement.up) !== Boolean(lastInputPayload.movement.up) ||
        Boolean(payload.movement.down) !== Boolean(lastInputPayload.movement.down);
      if (
        payload.forward !== lastInputPayload.forward ||
        movementChanged ||
        payload.shoot !== lastInputPayload.shoot ||
        payload.shoot ||
        rotationChanged ||
        now - lastInputSend > 50
      ) {
        sendPlayerInput(payload);
        lastInputPayload = {
          forward: payload.forward,
          movement: { ...payload.movement },
          shoot: payload.shoot,
          rotation: { ...payload.rotation },
        };
        lastInputSend = now;
      }
    };

    const magnetActive =
      Boolean(gameState.pelletData) && gameState.playerCell.pelletMagnetToggle;

    const updateFog = () => {
      const currentRadius = cameraController.getPlayerRadius();
      const cameraDistance = cameraController.getMaxCameraDistance(magnetActive);
      if (
        lastRadius === null ||
        Math.abs(currentRadius - lastRadius) > 0.05 ||
        lastCameraDistance === null ||
        Math.abs(cameraDistance - lastCameraDistance) > 0.25 ||
        magnetActive !== lastMagnetActive
      ) {
        updateFogDistance(scene, cameraDistance, currentRadius);
        lastRadius = currentRadius;
        lastCameraDistance = cameraDistance;
        lastMagnetActive = magnetActive;
      }
    };

    applyNetworkSmoothing(deltaTime);
    controls.updateCamera(magnetActive, deltaTime);
    const aim = sampleCameraAim(camera);
    sendInput(aim);

    // The server moves pellet hitboxes and sends those positions back.
    // Locally, only animate the magnet field.
    updatePelletMagnetVisual(
      gameState.playerCell,
      gameState.playerCell.pelletMagnetToggle,
      gameState.magnetSphere
    );

    updateFog();

    stats?.end();
  }

  return { step, getLastSplitTime: () => null };
}
