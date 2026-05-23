import { Server } from "socket.io";
import http from "http";

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8,
});

const WORLD_SIZE = 250;
const HALF_WORLD = WORLD_SIZE / 2;
const PLAYER_BASE_RADIUS = 0.75;
const BASE_SPEED = 10; // units per second
const SPEED_FALLOFF = 0.15;
const PELLET_COUNT = 25000;
const PELLET_MIN_RADIUS = 0.3;
const PELLET_MAX_RADIUS = 0.55;
const POWERUP_RATIO = 0.15;
const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;

const pelletVolume = (4 / 3) * Math.PI * Math.pow(PELLET_MIN_RADIUS, 3);

function radiusToMass(radius) {
  const volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
  return volume / pelletVolume;
}

function massToRadius(mass) {
  const volume = mass * pelletVolume;
  return Math.cbrt((3 * volume) / (4 * Math.PI));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomPosition(radius = PLAYER_BASE_RADIUS) {
  const minBound = -HALF_WORLD + radius;
  const maxBound = HALF_WORLD - radius;
  return {
    x: randomBetween(minBound, maxBound),
    y: randomBetween(minBound, maxBound),
    z: randomBetween(minBound, maxBound),
  };
}

function createPellet(index) {
  const size = randomBetween(PELLET_MIN_RADIUS, PELLET_MAX_RADIUS);
  const position = randomPosition(size);
  const isPowerUp = Math.random() < POWERUP_RATIO;
  return {
    index,
    position,
    size,
    isPowerUp,
    active: true,
  };
}

function serializePelletState(pellets) {
  return {
    positions: pellets.map((pellet) => pellet.position),
    active: pellets.map((pellet) => pellet.active),
    powerUps: pellets.map((pellet) => pellet.isPowerUp),
  };
}

function rotationToForward(rotation = { yaw: 0, pitch: 0 }) {
  const sinYaw = Math.sin(rotation.yaw || 0);
  const cosYaw = Math.cos(rotation.yaw || 0);
  const sinPitch = Math.sin(rotation.pitch || 0);
  const cosPitch = Math.cos(rotation.pitch || 0);

  return {
    x: -sinYaw * cosPitch,
    y: -sinPitch,
    z: -cosYaw * cosPitch,
  };
}

function clampPosition(position, radius) {
  const minBound = -HALF_WORLD + radius;
  const maxBound = HALF_WORLD - radius;
  position.x = clamp(position.x, minBound, maxBound);
  position.y = clamp(position.y, minBound, maxBound);
  position.z = clamp(position.z, minBound, maxBound);
  return position;
}

const pellets = Array.from({ length: PELLET_COUNT }, (_, i) => createPellet(i));
const pelletState = serializePelletState(pellets);

const players = new Map();
let lastTick = Date.now();

function getPlayerSpeed(mass) {
  const slowFactor = 1 + SPEED_FALLOFF * Math.cbrt(mass);
  return BASE_SPEED / slowFactor;
}

function respawnPellet(pellet) {
  pellet.position = randomPosition(pellet.size);
  pellet.active = true;
  pelletState.positions[pellet.index] = pellet.position;
  pelletState.active[pellet.index] = true;
  pelletState.powerUps[pellet.index] = pellet.isPowerUp;
  io.emit("pellet-respawn", {
    index: pellet.index,
    position: pellet.position,
    isPowerUp: pellet.isPowerUp,
  });
}

function handlePelletCollisions(player) {
  for (let i = 0; i < pellets.length; i++) {
    const pellet = pellets[i];
    if (!pellet.active) continue;
    const dx = player.position.x - pellet.position.x;
    const dy = player.position.y - pellet.position.y;
    const dz = player.position.z - pellet.position.z;
    if (dx * dx + dy * dy + dz * dz <= player.radius * player.radius) {
      pellet.active = false;
      pelletState.active[pellet.index] = false;
      const gainedMass = Math.pow(pellet.size / PELLET_MIN_RADIUS, 3);
      player.mass += gainedMass;
      player.radius = massToRadius(player.mass);
      player.speed = getPlayerSpeed(player.mass);
      io.emit("pellet-eaten", { index: pellet.index });
      if (pellet.isPowerUp) {
        io.to(player.id).emit("powerup-activated");
      }
      setTimeout(() => respawnPellet(pellet), pellet.isPowerUp ? 5000 : 2500);
    }
  }
}

function handlePlayerCollisions(player) {
  players.forEach((other) => {
    if (other.id === player.id || other.radius <= 0 || player.radius <= 0)
      return;
    const dx = player.position.x - other.position.x;
    const dy = player.position.y - other.position.y;
    const dz = player.position.z - other.position.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    const minDistance = player.radius + other.radius * 0.85;
    if (distanceSq > minDistance * minDistance) return;
    if (player.radius <= other.radius * 1.1) return;

    player.mass += other.mass * 0.9;
    player.radius = massToRadius(player.mass);
    player.speed = getPlayerSpeed(player.mass);
    other.mass = radiusToMass(PLAYER_BASE_RADIUS);
    other.radius = PLAYER_BASE_RADIUS;
    other.speed = getPlayerSpeed(other.mass);
    other.position = randomPosition(other.radius);
  });
}

function updatePlayers(delta) {
  players.forEach((player) => {
    // The server is authoritative: clients send input, but this function is
    // where movement actually changes the shared multiplayer state.
    if (player.input.forward) {
      const direction = rotationToForward(player.input.rotation);
      player.position.x += direction.x * player.speed * delta;
      player.position.y += direction.y * player.speed * delta;
      player.position.z += direction.z * player.speed * delta;
      clampPosition(player.position, player.radius);
    }
    handlePelletCollisions(player);
  });

  players.forEach((player) => {
    handlePlayerCollisions(player);
  });
}

function broadcastWorldState() {
  const payload = [];
  players.forEach((player) => {
    payload.push({
      id: player.id,
      name: player.name,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      radius: player.radius,
      mass: player.mass,
    });
  });
  io.emit("world-update", { players: payload });
}

setInterval(() => {
  // Main server loop. At 20 ticks per second it moves players, handles
  // collisions, and broadcasts the new world snapshot to every browser.
  const now = Date.now();
  const delta = (now - lastTick) / 1000;
  lastTick = now;
  updatePlayers(delta);
  broadcastWorldState();
}, TICK_INTERVAL);

io.on("connection", (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);
  console.log(`Total clients: ${io.engine.clientsCount}`);

  socket.on("join", ({ name }) => {
    const spawnPosition = randomPosition(PLAYER_BASE_RADIUS);
    const mass = radiusToMass(PLAYER_BASE_RADIUS);
    const player = {
      id: socket.id,
      name: name || "Player",
      position: spawnPosition,
      radius: PLAYER_BASE_RADIUS,
      mass,
      speed: getPlayerSpeed(mass),
      input: { forward: false, rotation: { yaw: 0, pitch: 0 } },
    };
    players.set(socket.id, player);
    socket.emit("pellet-state", pelletState);
    socket.emit("world-update", {
      players: Array.from(players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        radius: p.radius,
        mass: p.mass,
      })),
    });
    socket.broadcast.emit("player-joined", {
      id: player.id,
      name: player.name,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      radius: player.radius,
    });
  });

  socket.on("player-input", (input) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.input.forward = Boolean(input.forward);
    if (input.rotation) {
      player.input.rotation = {
        yaw: Number(input.rotation.yaw) || 0,
        pitch: Number(input.rotation.pitch) || 0,
      };
    }
  });

  socket.on("request-pellet-state", () => {
    socket.emit("pellet-state", pelletState);
  });

  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ Client disconnected: ${socket.id}`);
    console.log(`Disconnect reason: ${reason}`);
    const player = players.get(socket.id);
    if (player) {
      players.delete(socket.id);
      io.emit("player-left", socket.id);
    }
  });
});

server.listen(3001, "0.0.0.0", () => {
  console.log("Multiplayer server running on port 3001");
  console.log("Server is accessible on:");
  console.log("  - localhost:3001");
  console.log("  - <your-local-ip>:3001");
  console.log(
    "\nTo find your local IP, run: ip addr show (Linux) or ipconfig (Windows)"
  );
});
