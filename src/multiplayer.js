import { io } from "socket.io-client";
import * as THREE from "three";

// Use current hostname but connect to port 3001
const localHosts = ["localhost", "127.0.0.1", "::1"];
const hostIp = "10.33.247.2"; // Host machine running the Socket.IO server
const resolvedHost = localHosts.includes(window.location.hostname)
  ? hostIp
  : window.location.hostname;
const socketUrl = `http://${resolvedHost}:3001`;
console.log("Connecting to socket server:", socketUrl);

// Preserve socket instance across HMR (Hot Module Replacement)
let socket;
if (!window.__socket) {
  console.log("Creating new socket instance");
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
  console.log("Reusing existing socket instance");
  socket = window.__socket;
}

export { socket };
export const otherPlayers = {};

// Keep connection alive
setInterval(() => {
  if (socket.connected) {
    socket.emit("ping");
  }
}, 5000);

socket.on("connect", () => {
  console.log("✅ Connected to server with ID:", socket.id);
  console.log("Socket connected:", socket.connected);
});

socket.on("disconnect", (reason) => {
  console.log("❌ Disconnected from server");
  console.log("Disconnect reason:", reason);
  console.log("Socket connected:", socket.connected);
  console.log("Socket transport:", socket.io?.engine?.transport?.name);

  if (reason === "io server disconnect") {
    console.log("Server forcibly disconnected this client");
  } else if (reason === "io client disconnect") {
    console.log("Client disconnected intentionally");
  } else if (reason === "transport close") {
    console.log("Transport closed - network issue or server restart");
  } else if (reason === "transport error") {
    console.log("Transport error occurred");
  }
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error);
  console.error("Error message:", error.message);
});

socket.on("reconnect_attempt", (attemptNumber) => {
  console.log(`🔄 Reconnection attempt #${attemptNumber}`);
});

socket.on("reconnect", (attemptNumber) => {
  console.log(`✅ Reconnected after ${attemptNumber} attempts`);
});

function createOtherPlayerSphere(player) {
  const geometry = new THREE.SphereGeometry(player.radius || 1, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    emissive: 0x002244,
    emissiveIntensity: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.65,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(player.x, player.y, player.z);
  console.log("Created other player sphere:", {
    position: mesh.position,
    radius: player.radius || 1,
    visible: mesh.visible,
    playerData: player,
  });
  return mesh;
}

export function initNetworking(scene) {
  socket.on("players", (players) => {
    console.log("=== Received ALL players ===");
    console.log("My socket ID:", socket.id);
    console.log("Players object:", players);
    console.log("Number of players:", Object.keys(players).length);

    for (const id in otherPlayers) {
      if (otherPlayers[id].mesh) {
        scene.remove(otherPlayers[id].mesh);
      }
      delete otherPlayers[id];
    }
    for (const id in players) {
      console.log(`Processing player ${id}:`, players[id]);
      if (id !== socket.id) {
        const mesh = createOtherPlayerSphere(players[id]);
        scene.add(mesh);
        otherPlayers[id] = { mesh, name: players[id].name };
        console.log("✅ Added other player mesh to scene:", mesh);
        console.log("✅ Other player name:", players[id].name);
      } else {
        console.log("⏭️ Skipping self (my player)");
      }
    }
    console.log("=== Current otherPlayers ===", otherPlayers);
  });

  socket.on("player-joined", (player) => {
    console.log("=== Player Joined Event ===");
    console.log("New player:", player);
    console.log("My ID:", socket.id);

    if (player.id !== socket.id && !otherPlayers[player.id]) {
      const mesh = createOtherPlayerSphere(player);
      scene.add(mesh);
      otherPlayers[player.id] = { mesh, name: player.name };
      console.log("✅ Player joined:", player.name, player.id);
      console.log("✅ Mesh added to scene:", mesh);
      console.log("✅ Mesh position:", mesh.position);
      console.log("✅ Mesh visible:", mesh.visible);
    } else {
      console.log("⏭️ Ignoring (self or already exists)");
    }
  });

  socket.on("player-moved", (player) => {
    if (player.id !== socket.id && otherPlayers[player.id]) {
      const mesh = otherPlayers[player.id].mesh;
      mesh.position.set(player.x, player.y, player.z);
      if (mesh.geometry.parameters.radius !== player.radius) {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.SphereGeometry(player.radius, 32, 32);
      }
      console.log("Player moved:", player);
    }
  });

  socket.on("player-left", (id) => {
    if (otherPlayers[id]) {
      if (otherPlayers[id].mesh) {
        scene.remove(otherPlayers[id].mesh);
      }
      delete otherPlayers[id];
      console.log("Player left:", id);
    }
  });
}

export function emitPlayerMove(mainSphere) {
  const actualRadius =
    mainSphere.geometry.parameters.radius * mainSphere.scale.x;
  socket.emit("player-move", {
    x: mainSphere.position.x,
    y: mainSphere.position.y,
    z: mainSphere.position.z,
    radius: actualRadius,
  });
  updatePositionDisplay(mainSphere);
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

export function emitJoin(playerName, mainSphere) {
  const actualRadius =
    mainSphere.geometry.parameters.radius * mainSphere.scale.x;
  const joinData = {
    name: playerName,
    x: mainSphere.position.x,
    y: mainSphere.position.y,
    z: mainSphere.position.z,
    radius: actualRadius,
  };
  console.log("=== Emitting Join ===");
  console.log("Join data:", joinData);
  socket.emit("join", joinData);
}

export function emitEat(data) {
  socket.emit("eat", data);
}

export function emitInitPellets(pelletData) {
  socket.emit("init-pellets", {
    positions: pelletData.positions.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    active: pelletData.active,
    powerUps: pelletData.powerUps,
  });
}

export function emitPelletEaten(index) {
  socket.emit("pellet-eaten", { index });
}

export function emitPelletRespawn(index, position, isPowerUp) {
  socket.emit("pellet-respawn", {
    index,
    position: { x: position.x, y: position.y, z: position.z },
    isPowerUp,
  });
}

export function setupPelletSync(pelletData, onPelletEaten, onPelletRespawn) {
  socket.on("pellet-state", (state) => {
    console.log("Received pellet state from server");
    // Update local pellet state to match server
    for (let i = 0; i < state.active.length; i++) {
      pelletData.active[i] = state.active[i];
      pelletData.positions[i].set(
        state.positions[i].x,
        state.positions[i].y,
        state.positions[i].z
      );
      pelletData.powerUps[i] = state.powerUps[i];
    }
  });

  socket.on("pellet-eaten", (data) => {
    if (onPelletEaten) onPelletEaten(data.index);
  });

  socket.on("pellet-respawn", (data) => {
    if (onPelletRespawn)
      onPelletRespawn(data.index, data.position, data.isPowerUp);
  });
}
