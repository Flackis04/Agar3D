import * as THREE from "three";
import { smoothLerp } from "./scene";
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

function calculateDirectionVector(yaw, pitch, scale = 1) {
  return new THREE.Vector3(
    scale * Math.sin(yaw) * Math.cos(pitch),
    scale * Math.sin(pitch),
    scale * Math.cos(yaw) * Math.cos(pitch)
  );
}

export function calculateCameraDistanceTarget(playerCell, magnetActive) {
  const playerRadius = calculateCellRadius(playerCell);
  const baseMultiplier = magnetActive ? 28 : 22;
  const minMultiplier = magnetActive ? 12 : 8;

  const sizeOffset = Math.sqrt(playerRadius) * 2;
  const adjustedMultiplier = Math.max(baseMultiplier - sizeOffset, minMultiplier);

  return playerRadius * adjustedMultiplier;
}

function calculateCameraDistanceFromPlayer(
  playerCell,
  magnetActive,
  smoothFollowDistance,
  zoomAmount,
  cameraLerpSpeed = 0.005
) {
  const farFollowDistance = calculateCameraDistanceTarget(
    playerCell,
    magnetActive
  );
  const playerRadius = calculateCellRadius(playerCell);
  const firstPersonDistance = Math.max(0.05, playerRadius * 0.05);
  const targetFollowDistance = THREE.MathUtils.lerp(
    firstPersonDistance,
    farFollowDistance,
    zoomAmount
  );
  smoothFollowDistance +=
    (targetFollowDistance - smoothFollowDistance) * cameraLerpSpeed;
  return smoothFollowDistance;
}

export function createCameraController(camera, playerCell, cameraLerpSpeed) {
  let devMode = false;
  const devCameraPos = new THREE.Vector3();
  const devRotation = { yaw: 0, pitch: 0 };
  const devSpeed = 1;
  const followLerpSpeed = cameraLerpSpeed ?? 0.005;
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

      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      devRotation.yaw = Math.atan2(direction.x, direction.z);
      devRotation.pitch = Math.asin(-direction.y);
    }
  }

  function updateDevCamera(keys) {
    if (!camera) return;
    const direction = calculateDirectionVector(
      devRotation.yaw,
      devRotation.pitch,
      1
    );
    direction.y = -direction.y;

    if (keys["w"]) devCameraPos.addScaledVector(direction, devSpeed);

    camera.position.copy(devCameraPos);
    camera.lookAt(devCameraPos.clone().add(direction));
  }

  function updatePlayerCamera(
    playerRotation,
    keys,
    playerSpeed,
    magnetActive = false
  ) {
    if (!playerCell || !playerCell.position) return;

    smoothFollowDistance = calculateCameraDistanceFromPlayer(
      playerCell,
      magnetActive,
      smoothFollowDistance,
      zoomAmount,
      followLerpSpeed
    );

    const offsetDirection = calculateDirectionVector(
      playerRotation.yaw,
      playerRotation.pitch,
      1
    ).normalize();
    const offset = offsetDirection.clone().multiplyScalar(smoothFollowDistance);

    camera.position.copy(playerCell.position.clone().add(offset));

    ensureCameraIsInBox(camera.position);

    const isFirstPerson = zoomAmount <= 0;
    playerCell.visible = !isFirstPerson;

    if (isFirstPerson) {
      camera.lookAt(camera.position.clone().sub(offsetDirection));
    } else {
      camera.lookAt(playerCell.position);
    }

    //checkCellDistanceFromCamera()
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

  function updateCamera(playerRotation, keys, playerSpeed, magnetActive) {
    if (devMode) {
      if (playerCell) playerCell.visible = true;
      updateDevCamera(keys);
    } else {
      updatePlayerCamera(playerRotation, keys, playerSpeed, magnetActive);
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
  cameraController,
  pelletData
) {
  if (!scene._originalFog) scene._originalFog = scene.fog;
  if (!scene._originalBackground) scene._originalBackground = scene.background;

  if (cameraController.isDevMode && cameraController.isDevMode()) {
    if (scene.fog) scene.fog = null;
    if (scene.background && scene.background.isColor) {
      scene.background = new THREE.Color(0x000000);
    }

    if (pelletData) {
      if (pelletData.mesh) scene.remove(pelletData.mesh);
      if (pelletData.meshPowerup) scene.remove(pelletData.meshPowerup);
      pelletData._devModeRemoved = true;
    }

  } else {
    if (typeof scene._originalFog !== "undefined")
      scene.fog = scene._originalFog;
    if (typeof scene._originalBackground !== "undefined")
      scene.background = scene._originalBackground;
    if (pelletData && pelletData._devModeRemoved) {
      if (pelletData.mesh && !scene.children.includes(pelletData.mesh))
        scene.add(pelletData.mesh);
      if (
        pelletData.meshPowerup &&
        !scene.children.includes(pelletData.meshPowerup)
      )
        scene.add(pelletData.meshPowerup);
      pelletData._devModeRemoved = false;
    }
  }
}
