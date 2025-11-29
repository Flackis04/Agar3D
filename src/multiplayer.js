import { io } from "socket.io-client";
import * as THREE from "three";

const localHosts = ["localhost", "127.0.0.1", "::1"];
const hostIp = "10.33.247.2";
const resolvedHost = localHosts.includes(window.location.hostname)
  ? hostIp
  : window.location.hostname;
const socketUrl = `http://${resolvedHost}:3001`;

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

function applyStateToMesh(mesh, playerState) {
  mesh.position.set(playerState.x, playerState.y, playerState.z);
  const baseRadius = mesh.geometry.parameters.radius || 1;
  const targetScale = (playerState.radius || 1) / baseRadius;
  mesh.scale.setScalar(targetScale);
}

function upsertOtherPlayer(playerState) {
  if (playerState.id === socket.id) return;
  if (!otherPlayers[playerState.id]) {
    const mesh = createOtherPlayerSphere(playerState);
    if (localScene) {
      localScene.add(mesh);
    }
    otherPlayers[playerState.id] = { mesh, name: playerState.name };
  }
  applyStateToMesh(otherPlayers[playerState.id].mesh, playerState);
  otherPlayers[playerState.id].lastSeen = performance.now();
  otherPlayers[playerState.id].name = playerState.name;
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
  localPlayerCell.position.set(playerState.x, playerState.y, playerState.z);
  const radius = playerState.radius || basePlayerRadius;
  const scale = radius / basePlayerRadius;
  localPlayerCell.scale.setScalar(scale);
  updatePositionDisplay(localPlayerCell);
}

export function initNetworking(scene, playerCell) {
  localScene = scene;
  localPlayerCell = playerCell;
  basePlayerRadius = playerCell.geometry.parameters.radius;

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

  socket.on("player-left", (id) => {
    if (otherPlayers[id]) {
      if (otherPlayers[id].mesh && localScene) {
        localScene.remove(otherPlayers[id].mesh);
      }
      delete otherPlayers[id];
      console.log("Player left:", id);
    }
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
  socket.emit("player-input", {
    forward,
    rotation,
  });
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

export function emitJoin(playerName) {
  socket.emit("join", { name: playerName });
}

let pelletDataRef = null;
let pelletHandlersRegistered = false;

function updatePelletInstance(index) {
  if (!pelletDataRef) return;
  const isPowerUp = pelletDataRef.powerUps[index];
  const mesh = isPowerUp ? pelletDataRef.meshPowerup : pelletDataRef.mesh;
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
    pelletDataRef.active[data.index] = true;
    updatePelletInstance(data.index);
  });
}

export function setupPelletSync(pelletData) {
  pelletDataRef = pelletData;
  registerPelletHandlers();
  socket.emit("request-pellet-state");
}
