import { io } from "socket.io-client";
import * as THREE from "three";
import { mapSize, pelletMinSize } from "./objects.js";
import { AudioManager } from "./audio.js";

const defaultSocketUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
const socketUrl = import.meta.env.VITE_API_BASE_URL || defaultSocketUrl;

let socket;
if (!window.__socket) {
  socket = io(socketUrl, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    timeout: 20000,
    forceNew: false,
    multiplex: true,
  });
  window.__socket = socket;
} else {
  socket = window.__socket;
}

export { socket };
export const otherPlayers = {};

let localScene = null;
let localPlayerCell = null;
let basePlayerRadius = 1;
let handlersRegistered = false;
let magnetTimeout = null;
const localTarget = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  scale: 1,
  hasState: false,
};
const POSITION_SMOOTHING = 18;
const SCALE_SMOOTHING = 12;
const SERVER_CORRECTION_SMOOTHING = 7;
const SERVER_CORRECTION_DEAD_ZONE_SQ = 0.03 * 0.03;
const SERVER_SNAP_DISTANCE_SQ = 3 * 3;
const BASE_SPEED = 5;
const MIN_SPEED = 1.25;
const SPEED_FALLOFF = 0.15;
const MOVE_ACCELERATION = 8;
const MOVE_DECELERATION = 12;
const latestInput = {
  forward: false,
  rotation: { yaw: 0, pitch: 0 },
};
const predictedVelocity = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const targetVelocity = new THREE.Vector3();
const otherPlayerGeometry = new THREE.SphereGeometry(1, 32, 32);
const otherPlayerMaterial = new THREE.MeshStandardMaterial({
  color: 0x00aaff,
  emissive: 0x002244,
  emissiveIntensity: 0.15,
  metalness: 0.1,
  transparent: true,
  opacity: 0.65,
});
const audioManager = new AudioManager();
const locallyConsumedPellets = new Set();

export function unlockGameAudio() {
  audioManager.unlock();
}

setInterval(() => {
  if (socket.connected) {
    socket.emit("ping");
  }
}, 5000);

socket.on("connect", () => {
  console.log("✅ Connected to server with ID:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("❌ Disconnected from server", reason);
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error.message);
});

socket.on("reconnect_attempt", (attemptNumber) => {
  console.log(`🔄 Reconnection attempt #${attemptNumber}`);
});

socket.on("reconnect", (attemptNumber) => {
  console.log(`✅ Reconnected after ${attemptNumber} attempts`);
});

function createOtherPlayerSphere(player) {
  const mesh = new THREE.Mesh(otherPlayerGeometry, otherPlayerMaterial);
  mesh.scale.setScalar(player.radius || 1);
  mesh.position.set(player.x, player.y, player.z);
  return mesh;
}

function smoothFactor(rate, delta) {
  return 1 - Math.exp(-rate * delta);
}

function volumeFromRadius(radius) {
  return (4 / 3) * Math.PI * Math.pow(radius, 3);
}

function getLocalRadius() {
  if (!localPlayerCell) return basePlayerRadius;
  return basePlayerRadius * Math.max(
    localPlayerCell.scale.x,
    localPlayerCell.scale.y,
    localPlayerCell.scale.z
  );
}

function getLocalMass() {
  return volumeFromRadius(getLocalRadius()) / volumeFromRadius(pelletMinSize);
}

function getPredictedSpeed() {
  const slowFactor = 1 + SPEED_FALLOFF * Math.cbrt(getLocalMass());
  return Math.max(MIN_SPEED, BASE_SPEED / slowFactor);
}

function rotationToForward(rotation = latestInput.rotation, target = forwardVector) {
  const yaw = rotation.yaw || 0;
  const pitch = rotation.pitch || 0;
  const cosPitch = Math.cos(pitch);

  return target.set(
    -Math.sin(yaw) * cosPitch,
    -Math.sin(pitch),
    -Math.cos(yaw) * cosPitch
  );
}

function clampLocalPlayerPosition() {
  if (!localPlayerCell) return;
  const radius = getLocalRadius();
  const minBound = -mapSize / 2 + radius;
  const maxBound = mapSize / 2 - radius;

  localPlayerCell.position.x = Math.max(
    minBound,
    Math.min(maxBound, localPlayerCell.position.x)
  );
  localPlayerCell.position.y = Math.max(
    minBound,
    Math.min(maxBound, localPlayerCell.position.y)
  );
  localPlayerCell.position.z = Math.max(
    minBound,
    Math.min(maxBound, localPlayerCell.position.z)
  );
}

function predictLocalPlayer(delta) {
  if (!localPlayerCell) return;
  const direction = rotationToForward(latestInput.rotation);
  const targetSpeed = latestInput.forward ? getPredictedSpeed() : 0;
  targetVelocity.copy(direction).multiplyScalar(targetSpeed);
  const movementAlpha = smoothFactor(
    latestInput.forward ? MOVE_ACCELERATION : MOVE_DECELERATION,
    delta
  );
  predictedVelocity.lerp(targetVelocity, movementAlpha);
  localPlayerCell.position.addScaledVector(predictedVelocity, delta);
  clampLocalPlayerPosition();
}

function upsertOtherPlayer(playerState) {
  if (playerState.id === socket.id) return;
  if (!otherPlayers[playerState.id]) {
    const mesh = createOtherPlayerSphere(playerState);
    if (localScene) {
      localScene.add(mesh);
    }
    otherPlayers[playerState.id] = {
      mesh,
      name: playerState.name,
      targetPosition: mesh.position.clone(),
      targetVelocity: new THREE.Vector3(),
      targetScale: mesh.scale.x,
    };
  }
  const entry = otherPlayers[playerState.id];
  entry.targetPosition.set(playerState.x, playerState.y, playerState.z);
  entry.targetVelocity.set(
    Number(playerState.vx) || 0,
    Number(playerState.vy) || 0,
    Number(playerState.vz) || 0
  );
  entry.targetScale = playerState.radius || 1;
  entry.lastSeen = performance.now();
  entry.name = playerState.name;
}

function cleanupMissingPlayers(seenIds) {
  Object.keys(otherPlayers).forEach((id) => {
    if (!seenIds.has(id)) {
      const entry = otherPlayers[id];
      if (entry.mesh && localScene) {
        localScene.remove(entry.mesh);
      }
      delete otherPlayers[id];
    }
  });
}

function clearOtherPlayers() {
  for (const id in otherPlayers) {
    const entry = otherPlayers[id];
    if (entry.mesh && localScene) localScene.remove(entry.mesh);
    delete otherPlayers[id];
  }
}

function triggerLocalEatFeedback(strength = 0.35) {
  if (!localPlayerCell) return;
  const currentFlash = Number(localPlayerCell.userData.eatFlash) || 0;
  localPlayerCell.userData.eatFlash = Math.min(1, currentFlash + strength);
}

function updateLocalPlayerFeedback(delta) {
  if (!localPlayerCell?.material) return;
  const flash = Number(localPlayerCell.userData.eatFlash) || 0;
  const nextFlash = flash * Math.exp(-8 * delta);
  localPlayerCell.userData.eatFlash = nextFlash;
  localPlayerCell.material.emissiveIntensity = 0.15 + nextFlash * 1.1;
}

function updateLocalPlayer(playerState) {
  if (!localPlayerCell) return;
  localTarget.position.set(playerState.x, playerState.y, playerState.z);
  localTarget.velocity.set(
    Number(playerState.vx) || 0,
    Number(playerState.vy) || 0,
    Number(playerState.vz) || 0
  );
  const radius = playerState.radius || basePlayerRadius;
  localTarget.scale = radius / basePlayerRadius;
  if (!localTarget.hasState) {
    localPlayerCell.position.copy(localTarget.position);
    localPlayerCell.scale.setScalar(localTarget.scale);
    predictedVelocity.copy(localTarget.velocity);
    localTarget.hasState = true;
  }
}

export function updateNetworkedPlayers(delta) {
  const positionAlpha = smoothFactor(POSITION_SMOOTHING, delta);
  const scaleAlpha = smoothFactor(SCALE_SMOOTHING, delta);
  const correctionAlpha = smoothFactor(SERVER_CORRECTION_SMOOTHING, delta);

  predictLocalPlayer(delta);

  if (localPlayerCell && localTarget.hasState) {
    localTarget.position.addScaledVector(localTarget.velocity, delta);
    const correctionDistanceSq = localPlayerCell.position.distanceToSquared(
      localTarget.position
    );
    if (correctionDistanceSq > SERVER_SNAP_DISTANCE_SQ) {
      localPlayerCell.position.copy(localTarget.position);
      predictedVelocity.copy(localTarget.velocity);
    } else if (correctionDistanceSq > SERVER_CORRECTION_DEAD_ZONE_SQ) {
      localPlayerCell.position.lerp(localTarget.position, correctionAlpha);
    }
    const scale =
      localPlayerCell.scale.x +
      (localTarget.scale - localPlayerCell.scale.x) * scaleAlpha;
    localPlayerCell.scale.setScalar(scale);
    clampLocalPlayerPosition();
    updateLocalPlayerFeedback(delta);
    updatePositionDisplay(localPlayerCell);
  }

  for (const id in otherPlayers) {
    const entry = otherPlayers[id];
    if (!entry.mesh || !entry.targetPosition) continue;
    entry.targetPosition.addScaledVector(entry.targetVelocity, delta);
    entry.mesh.position.lerp(entry.targetPosition, positionAlpha);
    const scale =
      entry.mesh.scale.x + (entry.targetScale - entry.mesh.scale.x) * scaleAlpha;
    entry.mesh.scale.setScalar(scale);
  }
}

export function initNetworking(scene, playerCell) {
  if (localScene && localScene !== scene) clearOtherPlayers();
  localScene = scene;
  localPlayerCell = playerCell;
  basePlayerRadius = playerCell.geometry.parameters.radius;
  localTarget.hasState = false;
  predictedVelocity.set(0, 0, 0);

  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  socket.on("world-update", ({ players }) => {
    if (!players) return;
    const seen = new Set();
    players.forEach((playerState) => {
      seen.add(playerState.id);
      if (playerState.id === socket.id) {
        updateLocalPlayer(playerState);
      } else {
        upsertOtherPlayer(playerState);
      }
    });
    cleanupMissingPlayers(seen);
  });

  socket.on("player-joined", (player) => {
    if (!localScene || player.id === socket.id) return;
    upsertOtherPlayer(player);
  });

  socket.on("join-rejected", ({ error }) => {
    console.error("Join rejected:", error);
  });

  socket.on("player-left", (id) => {
    if (otherPlayers[id]) {
      if (otherPlayers[id].mesh && localScene) {
        localScene.remove(otherPlayers[id].mesh);
      }
      delete otherPlayers[id];
      console.log("Player left:", id);
    }
  });

  socket.on("player-killed", ({ id, reason, killerName }) => {
    if (id === socket.id && localPlayerCell) {
      localPlayerCell.userData.isEaten = true;
      localPlayerCell.userData.deathReason = reason || "unknown";
      localPlayerCell.userData.killerName = killerName || "";
      localPlayerCell.visible = false;
      return;
    }
    const entry = otherPlayers[id];
    if (entry?.mesh && localScene) {
      localScene.remove(entry.mesh);
    }
    delete otherPlayers[id];
  });

  socket.on("player-consumed", () => {
    triggerLocalEatFeedback(1);
    audioManager.playEatSoundSegment(0.9, 0.75);
  });

  socket.on("powerup-activated", () => {
    if (!localPlayerCell) return;
    localPlayerCell.pelletMagnetToggle = true;
    if (magnetTimeout) clearTimeout(magnetTimeout);
    magnetTimeout = setTimeout(() => {
      if (localPlayerCell) {
        localPlayerCell.pelletMagnetToggle = false;
      }
      magnetTimeout = null;
    }, 8000);
  });
}

export function sendPlayerInput({ forward, rotation }) {
  latestInput.forward = Boolean(forward);
  latestInput.rotation = {
    yaw: Number(rotation?.yaw) || 0,
    pitch: Number(rotation?.pitch) || 0,
  };

  socket.emit("player-input", {
    forward: latestInput.forward,
    rotation: latestInput.rotation,
  });
}

export function requestCashIn() {
  socket.emit("cash-in");
}

function updatePositionDisplay(mainSphere) {
  const positionElement = document.getElementById("position");
  if (positionElement) {
    positionElement.textContent = `Position: (${mainSphere.position.x.toFixed(
      2
    )}, ${mainSphere.position.y.toFixed(2)}, ${mainSphere.position.z.toFixed(
      2
    )})`;
  }
}

export function emitJoin(playerName, startingMass, gameTicket) {
  socket.emit("join", { name: playerName, startingMass, gameTicket });
}

let pelletDataRef = null;
let pelletHandlersRegistered = false;

function updatePelletInstance(index, markBufferDirty = true) {
  if (!pelletDataRef) return;
  const mesh = pelletDataRef.mesh;
  if (!mesh) return;
  const meshIndex = pelletDataRef.pelletToMeshIndex[index];
  if (meshIndex === undefined) return;
  const dummy = pelletDataRef.dummy;
  if (pelletDataRef.active[index]) {
    dummy.position.copy(pelletDataRef.positions[index]);
    dummy.scale.setScalar(pelletDataRef.sizes[index]);
  } else {
    dummy.position.set(0, 0, 0);
    dummy.scale.setScalar(0.0001);
  }
  dummy.rotation.set(0, 0, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(meshIndex, dummy.matrix);
  if (markBufferDirty) mesh.instanceMatrix.needsUpdate = true;
}

export function predictLocalPelletConsumption() {
  if (!pelletDataRef || !localPlayerCell || !socket.connected) return;

  const playerRadius = getLocalRadius();
  const collectionRadius = localPlayerCell.pelletMagnetToggle
    ? playerRadius * 4
    : playerRadius;
  const position = localPlayerCell.position;
  const nearbyConsumptionIndices =
    pelletDataRef._nearbyConsumptionIndices || [];
  pelletDataRef._nearbyConsumptionIndices = nearbyConsumptionIndices;
  const nearbyIndices = pelletDataRef.spatialGrid
    ? pelletDataRef.spatialGrid.getItemsInRadius(
        position.x,
        position.y,
        position.z,
        collectionRadius + pelletDataRef.minRadius,
        nearbyConsumptionIndices
      )
    : pelletDataRef.positions.map((_, index) => index);

  let eatenCount = 0;
  let totalRadius = 0;
  for (const index of nearbyIndices) {
    if (!pelletDataRef.active[index]) continue;
    const pelletPosition = pelletDataRef.positions[index];
    const pelletRadius = pelletDataRef.sizes[index] || pelletMinSize;
    const eatRadius = collectionRadius + pelletRadius;
    if (position.distanceToSquared(pelletPosition) > eatRadius * eatRadius) {
      continue;
    }

    pelletDataRef.active[index] = false;
    locallyConsumedPellets.add(index);
    updatePelletInstance(index, false);
    eatenCount++;
    totalRadius += pelletRadius;
  }

  if (eatenCount > 0) {
    pelletDataRef.mesh.instanceMatrix.needsUpdate = true;
    const averageRadius = totalRadius / eatenCount;
    const volume = Math.min(1, 0.45 + eatenCount * 0.08);
    audioManager.playEatSoundSegment(volume, 1.5 - averageRadius);
    triggerLocalEatFeedback(Math.min(0.8, 0.2 + eatenCount * 0.04));
  }
}

function registerPelletHandlers() {
  if (pelletHandlersRegistered) return;
  pelletHandlersRegistered = true;

  socket.on("pellet-state", (state) => {
    if (!pelletDataRef) return;
    console.log("Received pellet state from server");
    for (let i = 0; i < state.active.length; i++) {
      pelletDataRef.active[i] = state.active[i];
      if (Array.isArray(state.sizes) && typeof state.sizes[i] === "number") {
        pelletDataRef.sizes[i] = state.sizes[i];
      }
      if (Array.isArray(state.powerUps)) {
        pelletDataRef.powerUps[i] = Boolean(state.powerUps[i]);
      }
      pelletDataRef.positions[i].set(
        state.positions[i].x,
        state.positions[i].y,
        state.positions[i].z
      );
      updatePelletInstance(i, false);
    }
    pelletDataRef.spatialGrid?.buildFromPelletData(pelletDataRef);
    pelletDataRef.mesh.instanceMatrix.needsUpdate = true;
    pelletDataRef.mesh.computeBoundingSphere();
  });

  socket.on("pellet-eaten", (data) => {
    if (!pelletDataRef || typeof data.index !== "number") return;
    pelletDataRef.active[data.index] = false;
    updatePelletInstance(data.index);
    const wasPredicted = locallyConsumedPellets.delete(data.index);
    if (data.playerId === socket.id && !wasPredicted) {
      const size = Number(data.size) || pelletMinSize;
      const pitch = 1.5 - size;
      audioManager.playEatSoundSegment(1, pitch);
      triggerLocalEatFeedback(0.3);
    }
  });

  socket.on("pellet-respawn", (data) => {
    if (!pelletDataRef || typeof data.index !== "number") return;
    const pelletPosition = pelletDataRef.positions[data.index];
    const oldX = pelletPosition.x;
    const oldY = pelletPosition.y;
    const oldZ = pelletPosition.z;
    pelletPosition.set(
      data.position.x,
      data.position.y,
      data.position.z
    );
    if (typeof data.size === "number") {
      pelletDataRef.sizes[data.index] = data.size;
    }
    if (typeof data.isPowerUp === "boolean") {
      pelletDataRef.powerUps[data.index] = data.isPowerUp;
    }
    pelletDataRef.active[data.index] = true;
    locallyConsumedPellets.delete(data.index);
    pelletDataRef.spatialGrid?.updateItem(
      data.index,
      oldX,
      oldY,
      oldZ,
      pelletPosition.x,
      pelletPosition.y,
      pelletPosition.z
    );
    updatePelletInstance(data.index);
  });
}

export function setupPelletSync(pelletData) {
  pelletDataRef = pelletData;
  registerPelletHandlers();
  socket.emit("request-pellet-state");
}
