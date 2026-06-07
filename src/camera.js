import * as THREE from "three";
import { mapSize } from "./objects";

function clampPitch(pitch) {
  return Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
}

function calculateCellRadius(cell) {
  return (
    cell.geometry.parameters.radius *
    Math.max(cell.scale.x, cell.scale.y, cell.scale.z)
  );
}

function setDirectionFromRotation(target, yaw, pitch) {
  return target
    .set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    )
    .normalize();
}

export function calculateCameraDistanceTarget(playerCell) {
  return playerCell?.userData?.viewDistance ?? 30;
}

function calculateCameraDistanceFromPlayer(
  playerCell,
  magnetActive,
  smoothFollowDistance,
  zoomAmount,
  deltaTime,
  followResponsiveness
) {
  const farFollowDistance = calculateCameraDistanceTarget(playerCell);
  const playerRadius = calculateCellRadius(playerCell);
  const firstPersonDistance = Math.max(0.05, playerRadius * 0.05);
  const targetFollowDistance = THREE.MathUtils.lerp(
    firstPersonDistance,
    farFollowDistance,
    zoomAmount
  );
  const smoothing = 1 - Math.exp(-followResponsiveness * deltaTime);
  smoothFollowDistance = THREE.MathUtils.lerp(
    smoothFollowDistance,
    targetFollowDistance,
    smoothing
  );
  return smoothFollowDistance;
}

export function createCameraController(camera, playerCell, followSpeed) {
  let devMode = false;
  const devCameraPos = new THREE.Vector3();
  const devRotation = { yaw: 0, pitch: 0 };
  const devSpeed = 1;
  const followResponsiveness = followSpeed ?? 18;
  const direction = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let smoothFollowDistance = 0.05;
  let zoomAmount = 0;
  const zoomStep = 0.2;

  function ensureCameraIsInBox(pos) {
    pos.x = Math.max(-mapSize / 2, Math.min(mapSize / 2, pos.x));
    pos.y = Math.max(-mapSize / 2, Math.min(mapSize / 2, pos.y));
    pos.z = Math.max(-mapSize / 2, Math.min(mapSize / 2, pos.z));
  }

  function toggleDeveloperMode() {
    devMode = !devMode;
    console.log(`Developer mode ${devMode ? "enabled" : "disabled"}`);

    if (devMode) {
      devCameraPos.copy(camera.position);

      camera.getWorldDirection(direction);
      devRotation.yaw = Math.atan2(direction.x, direction.z);
      devRotation.pitch = Math.asin(-direction.y);
    }
  }

  function updateDevCamera(keys) {
    if (!camera) return;
    setDirectionFromRotation(direction, devRotation.yaw, devRotation.pitch);
    direction.y = -direction.y;

    if (keys["w"]) devCameraPos.addScaledVector(direction, devSpeed);

    camera.position.copy(devCameraPos);
    lookTarget.copy(devCameraPos).add(direction);
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld(true);
  }

  function updatePlayerCamera(
    playerRotation,
    keys,
    playerSpeed,
    magnetActive = false,
    deltaTime = 1 / 60
  ) {
    if (!playerCell || !playerCell.position) return;

    smoothFollowDistance = calculateCameraDistanceFromPlayer(
      playerCell,
      magnetActive,
      smoothFollowDistance,
      zoomAmount,
      deltaTime,
      followResponsiveness
    );

    setDirectionFromRotation(
      direction,
      playerRotation.yaw,
      playerRotation.pitch
    );
    camera.position
      .copy(playerCell.position)
      .addScaledVector(direction, smoothFollowDistance);

    ensureCameraIsInBox(camera.position);

    const isFirstPerson = zoomAmount <= 0;
    playerCell.visible = !isFirstPerson;

    if (isFirstPerson) {
      lookTarget.copy(camera.position).addScaledVector(direction, -1);
    } else {
      lookTarget.copy(playerCell.position);
    }
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld(true);
  }

  function clampToBoxBounds(position, playerCell) {
    const BOX_HALF = mapSize / 2;

    const playerRadius = calculateCellRadius(playerCell);

    const minBound = -BOX_HALF + playerRadius;
    const maxBound = BOX_HALF - playerRadius;

    position.x = Math.max(minBound, Math.min(maxBound, position.x));
    position.y = Math.max(minBound, Math.min(maxBound, position.y));
    position.z = Math.max(minBound, Math.min(maxBound, position.z));

    return position;
  }

  function updateCamera(
    playerRotation,
    keys,
    playerSpeed,
    magnetActive,
    deltaTime
  ) {
    if (devMode) {
      if (playerCell) playerCell.visible = true;
      updateDevCamera(keys);
    } else {
      updatePlayerCamera(
        playerRotation,
        keys,
        playerSpeed,
        magnetActive,
        deltaTime
      );
    }
  }

  function updateDevRotation(movementX, movementY, sensitivity) {
    devRotation.yaw -= movementX * sensitivity;
    devRotation.pitch += movementY * sensitivity;
    devRotation.pitch = clampPitch(devRotation.pitch);
  }

  function adjustZoom(deltaY) {
    if (devMode) return;
    zoomAmount = THREE.MathUtils.clamp(
      zoomAmount + Math.sign(deltaY) * zoomStep,
      0,
      1
    );
  }

  function isDevMode() {
    return devMode;
  }

  function getCameraDistance() {
    return smoothFollowDistance;
  }

  function getMaxCameraDistance(magnetActive = false) {
    return playerCell ? calculateCameraDistanceTarget(playerCell, magnetActive) : 1;
  }

  function getPlayerRadius() {
    return playerCell ? calculateCellRadius(playerCell) : 1;
  }

  return {
    updateCamera,
    toggleDeveloperMode,
    updateDevRotation,
    adjustZoom,
    isDevMode,
    getCameraDistance,
    getMaxCameraDistance,
    getPlayerRadius,
  };
}

export function handleDevModeObjectVisibility(
  scene,
  cameraController
) {
  if (!scene._originalFog) scene._originalFog = scene.fog;
  if (!scene._originalBackground) scene._originalBackground = scene.background;

  if (cameraController.isDevMode && cameraController.isDevMode()) {
    if (scene.fog) scene.fog = null;
    if (scene.background && scene.background.isColor) {
      scene.background = new THREE.Color(0x000000);
    }

  } else {
    if (typeof scene._originalFog !== "undefined")
      scene.fog = scene._originalFog;
    if (typeof scene._originalBackground !== "undefined")
      scene.background = scene._originalBackground;
  }
}
