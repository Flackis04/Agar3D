import { updateFogDistance } from "./scene.js";
import { handleDevModeObjectVisibility } from "./camera.js";
import { sendPlayerInput } from "./multiplayer.js";

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
    rotation: { yaw: 0, pitch: 0 },
  };
  let lastInputSend = 0;
  let lastRadius = null;

  function step() {
    // One call to step() is one rendered game frame in the browser.
    // The server owns multiplayer movement, so this frame sends input
    // and then renders the latest state that the server has sent back.
    if (!gameState.playerCell) return;
    if (window.isPaused) return;
    const now = performance.now();
    handleDevModeObjectVisibility(
      scene,
      cameraController,
      gameState.pelletData,
      gameState.border
    );
    const sendInput = () => {
      // This payload is the full client intent: "am I moving forward?"
      // plus "which direction am I facing?"
      const payload = {
        forward: controls.getForwardButtonPressed(),
        rotation: {
          yaw: controls.playerRotation.yaw,
          pitch: controls.playerRotation.pitch,
        },
      };
      const rotationChanged =
        Math.abs(payload.rotation.yaw - lastInputPayload.rotation.yaw) >
          0.005 ||
        Math.abs(payload.rotation.pitch - lastInputPayload.rotation.pitch) >
          0.005;
      if (
        payload.forward !== lastInputPayload.forward ||
        rotationChanged ||
        now - lastInputSend > 250
      ) {
        sendPlayerInput(payload);
        lastInputPayload = {
          forward: payload.forward,
          rotation: { ...payload.rotation },
        };
        lastInputSend = now;
      }
    };

    const updateFog = () => {
      const currentRadius = cameraController.getPlayerRadius();
      if (lastRadius === null || Math.abs(currentRadius - lastRadius) > 0.05) {
        updateFogDistance(
          scene,
          cameraController.getCameraDistance(),
          currentRadius
        );
        lastRadius = currentRadius;
      }
    };

    sendInput();
    updateFog();

    controls.updateCamera(
      gameState.pelletData && gameState.playerCell.pelletMagnetToggle
    );

    if (scene.userData.animateViruses)
      scene.userData.animateViruses(performance.now());

    stats?.begin();
    stats?.end();
  }

  return { step, getLastSplitTime: () => null };
}
