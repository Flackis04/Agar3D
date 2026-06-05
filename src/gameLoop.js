import { updateFogDistance } from "./scene.js";
import { handleDevModeObjectVisibility } from "./camera.js";
import { sendPlayerInput, socket, updateNetworkedPlayers } from "./multiplayer.js";
import { updatePlayerGrowth } from "./utils/playerUtils.js";
import { updateVisiblePellets } from "./objects.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function shouldRunLocalPelletGrowth() {
  return LOCAL_HOSTS.has(window.location.hostname) && !socket.connected;
}

export function createAnimationLoop(
  renderer,
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
  let fogInitialized = false;
  let lastFrameTime = performance.now();

  function tick(deltaOverride) {
    if (!gameState.playerCell) return;
    if (window.isPaused) {
      if (renderer) renderer.render(scene, camera);
      return;
    }
    const now = performance.now();
    const delta = Math.min(deltaOverride ?? (now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;
    handleDevModeObjectVisibility(
      scene,
      cameraController,
      gameState.pelletData,
      gameState.border
    );
    const sendInput = () => {
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
      if (!fogInitialized) {
        updateFogDistance(scene);
        fogInitialized = true;
      }
    };

    sendInput();
    updateNetworkedPlayers(delta);
    if (shouldRunLocalPelletGrowth()) {
      updatePlayerGrowth(
        false,
        gameState.playerCell,
        gameState.pelletData,
        scene,
        gameState.playerCell.magnetSphere,
        gameState.playerCell.position,
        gameState.cells || [],
        null,
        null
      );
    }
    updateFog();
    updateVisiblePellets(
      gameState.pelletData,
      gameState.playerCell.position,
      now
    );

    controls.updateCamera(
      gameState.pelletData && gameState.playerCell.pelletMagnetToggle
    );

    stats.begin();
    if (renderer) renderer.render(scene, camera);
    stats.end();
  }

  function animate() {
    requestAnimationFrame(animate);
    tick();
  }

  return { animate, tick, getLastSplitTime: () => null };
}
