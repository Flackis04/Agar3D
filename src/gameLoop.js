import { updateFogDistance } from "./scene.js";
import { handleDevModeObjectVisibility } from "./camera.js";
import { applyNetworkSmoothing, sendPlayerInput } from "./multiplayer.js";
import { updatePelletMagnet } from "./utils/playerUtils.js";
import * as THREE from "three";

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
    weaponMode: "bullet",
    rotation: { yaw: 0, pitch: 0 },
  };
  let lastInputSend = 0;
  let lastRadius = null;
  let lastCameraDistance = null;
  let lastMagnetActive = null;
  let lastFrameTime = performance.now();

  function step() {
    // One call to step() is one rendered game frame in the browser.
    // The server owns multiplayer movement, so this frame sends input
    // and then renders the latest state that the server has sent back.
    if (!gameState.playerCell) return;
    if (window.isPaused) return;
    const now = performance.now();
    const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    stats?.begin();

    handleDevModeObjectVisibility(
      scene,
      cameraController,
      gameState.pelletData,
      gameState.border
    );
    const sendInput = () => {
      // This payload is the full client intent: "am I moving forward?"
      // plus "which direction am I facing?"
      const aimDirection = camera.getWorldDirection(new THREE.Vector3());
      const payload = {
        forward: controls.getForwardButtonPressed(),
        movement: controls.getMovementInput?.() || {
          forward: controls.getForwardButtonPressed(),
        },
        shoot: controls.getShootButtonPressed?.() || false,
        weaponMode: controls.getWeaponMode?.() || "bullet",
        rotation: {
          yaw: controls.playerRotation.yaw,
          pitch: controls.playerRotation.pitch,
        },
        aim: {
          origin: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
          },
          direction: {
            x: aimDirection.x,
            y: aimDirection.y,
            z: aimDirection.z,
          },
        },
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
        payload.shoot ||
        payload.weaponMode !== lastInputPayload.weaponMode ||
        rotationChanged ||
        now - lastInputSend > 50
      ) {
        sendPlayerInput(payload);
        lastInputPayload = {
          forward: payload.forward,
          movement: { ...payload.movement },
          shoot: payload.shoot,
          weaponMode: payload.weaponMode,
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

    sendInput();
    applyNetworkSmoothing(deltaTime);

    updatePelletMagnet(
      false,
      gameState.playerCell,
      gameState.pelletData,
      gameState.playerCell.pelletMagnetToggle,
      scene,
      gameState.magnetSphere,
      true,
      0.45 * deltaTime * 60
    );

    controls.updateCamera(magnetActive);
    updateFog();

    stats?.end();
  }

  return { step, getLastSplitTime: () => null };
}
