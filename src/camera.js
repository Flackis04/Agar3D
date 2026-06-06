import * as THREE from "three";

const CAMERA_ROTATION_DAMPING = 18;
const CAMERA_DISTANCE_DAMPING = 8;

function clampPitch(pitch) {
  return Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
}

function calculateCellRadius(cell) {
  return (
    cell.geometry.parameters.radius *
    Math.max(cell.scale.x, cell.scale.y, cell.scale.z)
  );
}

function calculateDirectionVector(yaw, pitch, scale, target) {
  return target.set(
    scale * Math.sin(yaw) * Math.cos(pitch),
    scale * Math.sin(pitch),
    scale * Math.cos(yaw) * Math.cos(pitch)
  );
}

function dampingFactor(rate, delta) {
  return 1 - Math.exp(-rate * delta);
}

function dampAngle(current, target, rate, delta) {
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current)
  );
  return current + difference * dampingFactor(rate, delta);
}

function calculateCameraDistanceFromPlayer(
  playerCell,
  magnetActive
) {
  const playerRadius = calculateCellRadius(playerCell);
  const baseMultiplier = magnetActive ? 16 : 12;

  // Add offset that brings camera closer as player gets bigger

  const sizeOffset = Math.sqrt(playerRadius) * 3; // Adjust multiplier to control how much closer
  const adjustedMultiplier = Math.max(baseMultiplier - sizeOffset, 3); // Min distance of 3

  return playerRadius * adjustedMultiplier;
}

export function createCameraController(camera, playerCell) {
  let devMode = false;
  const devCameraPos = new THREE.Vector3();
  const devDirection = new THREE.Vector3();
  const devLookTarget = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const devRotation = { yaw: 0, pitch: 0 };
  const smoothedRotation = { yaw: 0, pitch: 0 };
  const devSpeed = 1;
  let followDistance = calculateCameraDistanceFromPlayer(playerCell, false);
  let rotationInitialized = false;

  function toggleDeveloperMode() {
    devMode = !devMode;
    console.log(`Developer mode ${devMode ? "enabled" : "disabled"}`);

    if (devMode) {
      devCameraPos.copy(camera.position);

      camera.getWorldDirection(devDirection);
      devRotation.yaw = Math.atan2(devDirection.x, devDirection.z);
      devRotation.pitch = Math.asin(-devDirection.y);
    }
  }

  function updateDevCamera(keys) {
    if (!camera) return;
    const direction = calculateDirectionVector(
      devRotation.yaw,
      devRotation.pitch,
      1,
      devDirection
    );
    direction.y = -direction.y;

    if (keys["w"]) devCameraPos.addScaledVector(direction, devSpeed);

    camera.position.copy(devCameraPos);
    devLookTarget.copy(devCameraPos).add(direction);
    camera.lookAt(devLookTarget);
  }

  function updatePlayerCamera(
    playerRotation,
    keys,
    playerSpeed,
    magnetActive = false,
    delta = 1 / 60
  ) {
    if (!playerCell || !playerCell.position) return;

    if (!rotationInitialized) {
      smoothedRotation.yaw = playerRotation.yaw;
      smoothedRotation.pitch = playerRotation.pitch;
      rotationInitialized = true;
    } else {
      smoothedRotation.yaw = dampAngle(
        smoothedRotation.yaw,
        playerRotation.yaw,
        CAMERA_ROTATION_DAMPING,
        delta
      );
      smoothedRotation.pitch = dampAngle(
        smoothedRotation.pitch,
        playerRotation.pitch,
        CAMERA_ROTATION_DAMPING,
        delta
      );
    }

    const targetDistance = calculateCameraDistanceFromPlayer(
      playerCell,
      magnetActive
    );
    followDistance +=
      (targetDistance - followDistance) *
      dampingFactor(CAMERA_DISTANCE_DAMPING, delta);

    const offset = calculateDirectionVector(
      smoothedRotation.yaw,
      smoothedRotation.pitch,
      followDistance,
      cameraOffset
    );

    camera.position.copy(playerCell.position).add(offset);

    camera.lookAt(playerCell.position);
  }

  function updateCamera(
    playerRotation,
    keys,
    playerSpeed,
    magnetActive,
    delta
  ) {
    if (devMode) {
      updateDevCamera(keys);
    } else {
      updatePlayerCamera(
        playerRotation,
        keys,
        playerSpeed,
        magnetActive,
        delta
      );
    }
  }

  function updateDevRotation(movementX, movementY, sensitivity) {
    devRotation.yaw -= movementX * sensitivity;
    devRotation.pitch += movementY * sensitivity;
    devRotation.pitch = clampPitch(devRotation.pitch);
  }

  function isDevMode() {
    return devMode;
  }

  function getCameraDistance() {
    return followDistance;
  }

  function getPlayerRadius() {
    return playerCell ? calculateCellRadius(playerCell) : 1;
  }

  return {
    updateCamera,
    toggleDeveloperMode,
    updateDevRotation,
    isDevMode,
    getCameraDistance,
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

    if (scene.userData.virusCells) {
      for (const mesh of scene.userData.virusCells) {
        if (scene.children.includes(mesh)) scene.remove(mesh);
      }
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
    if (scene.userData.virusCells) {
      for (const mesh of scene.userData.virusCells) {
        if (!scene.children.includes(mesh)) scene.add(mesh);
      }
    }
  }
}
