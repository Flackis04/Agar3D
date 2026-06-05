import { io } from "socket.io-client";
import * as THREE from "three";
import { mapSize, pelletMinSize } from "./objects.js";

const defaultSocketUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
const socketUrl = import.meta.env.VITE_API_BASE_URL || defaultSocketUrl;

let socket;
if (!window.__socket) {
  socket = io(socketUrl, {
    transports: ["polling"],
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
const localTarget = {
  position: new THREE.Vector3(),
  scale: 1,
  hasState: false,
};
const POSITION_SMOOTHING = 18;
const SCALE_SMOOTHING = 12;
const SERVER_CORRECTION_SMOOTHING = 8;
const BASE_SPEED = 10;
const SPEED_FALLOFF = 0.15;
const latestInput = {
  forward: false,
  rotation: { yaw: 0, pitch: 0 },
};

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
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    emissive: 0x002244,
    emissiveIntensity: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.65,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(player.radius || 1);
  mesh.position.set(player.x, player.y, player.z);
  return mesh;
}

function getStatePosition(playerState) {
  return new THREE.Vector3(playerState.x, playerState.y, playerState.z);
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
  return BASE_SPEED / slowFactor;
}

function rotationToForward(rotation = latestInput.rotation) {
  const yaw = rotation.yaw || 0;
  const pitch = rotation.pitch || 0;
  const cosPitch = Math.cos(pitch);

  return new THREE.Vector3(
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
  if (!localPlayerCell || !latestInput.forward) return;
  const direction = rotationToForward(latestInput.rotation);
  localPlayerCell.position.addScaledVector(direction, getPredictedSpeed() * delta);
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
      targetScale: mesh.scale.x,
    };
  }
  const entry = otherPlayers[playerState.id];
  entry.targetPosition.copy(getStatePosition(playerState));
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
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
      }
      delete otherPlayers[id];
    }
  });
}

function updateLocalPlayer(playerState) {
  if (!localPlayerCell) return;
  localTarget.position.copy(getStatePosition(playerState));
  const radius = playerState.radius || basePlayerRadius;
  localTarget.scale = radius / basePlayerRadius;
  if (!localTarget.hasState) {
    localPlayerCell.position.copy(localTarget.position);
    localPlayerCell.scale.setScalar(localTarget.scale);
    localTarget.hasState = true;
  }
}

export function updateNetworkedPlayers(delta) {
  const positionAlpha = smoothFactor(POSITION_SMOOTHING, delta);
  const scaleAlpha = smoothFactor(SCALE_SMOOTHING, delta);
  const correctionAlpha = smoothFactor(SERVER_CORRECTION_SMOOTHING, delta);

  predictLocalPlayer(delta);

  if (localPlayerCell && localTarget.hasState) {
    localPlayerCell.position.lerp(localTarget.position, correctionAlpha);
    const scale =
      localPlayerCell.scale.x +
      (localTarget.scale - localPlayerCell.scale.x) * scaleAlpha;
    localPlayerCell.scale.setScalar(scale);
    updatePositionDisplay(localPlayerCell);
  }

  Object.values(otherPlayers).forEach((entry) => {
    if (!entry.mesh || !entry.targetPosition) return;
    entry.mesh.position.lerp(entry.targetPosition, positionAlpha);
    const scale =
      entry.mesh.scale.x + (entry.targetScale - entry.mesh.scale.x) * scaleAlpha;
    entry.mesh.scale.setScalar(scale);
  });
}

export function initNetworking(scene, playerCell) {
  localScene = scene;
  localPlayerCell = playerCell;
  basePlayerRadius = playerCell.geometry.parameters.radius;
  localTarget.hasState = false;

  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  socket.on("world-update", ({ players }) => {
    if (!players || players.length === 0) return;
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

  socket.on("player-killed", ({ id }) => {
    if (id === socket.id && localPlayerCell) {
      localPlayerCell.userData.isEaten = true;
      localPlayerCell.visible = false;
      return;
    }
    const entry = otherPlayers[id];
    if (entry?.mesh && localScene) {
      localScene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
    }
    delete otherPlayers[id];
  });

  socket.on("powerup-activated", () => {
    if (!localPlayerCell) return;
    localPlayerCell.pelletMagnetToggle = true;
    setTimeout(() => {
      if (localPlayerCell) {
        localPlayerCell.pelletMagnetToggle = false;
      }
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

function updatePelletInstance(index) {
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
  mesh.instanceMatrix.needsUpdate = true;
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
      updatePelletInstance(i);
    }
  });

  socket.on("pellet-eaten", (data) => {
    if (!pelletDataRef || typeof data.index !== "number") return;
    pelletDataRef.active[data.index] = false;
    updatePelletInstance(data.index);
  });

  socket.on("pellet-respawn", (data) => {
    if (!pelletDataRef || typeof data.index !== "number") return;
    pelletDataRef.positions[data.index].set(
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
    updatePelletInstance(data.index);
  });
}

export function setupPelletSync(pelletData) {
  pelletDataRef = pelletData;
  registerPelletHandlers();
  socket.emit("request-pellet-state");
}
