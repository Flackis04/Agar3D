import { Server } from "socket.io";
import { readFile, stat } from "node:fs/promises";
import http from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPelletTier,
  PELLET_MAX_RADIUS,
  PELLET_MIN_RADIUS,
  pickPelletTier,
} from "./src/pelletTiers.js";

const ROOT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIRECTORY = path.join(ROOT_DIRECTORY, "dist");
const SERVER_PORT = Number(process.env.PORT) || 3001;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webp": "image/webp",
};

async function serveClient(request, response) {
  if (request.url?.startsWith("/socket.io")) return;

  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, players: players.size }));
    return;
  }

  const requestPath = decodeURIComponent(
    new URL(request.url || "/", "http://localhost").pathname
  );
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  let filePath = path.resolve(DIST_DIRECTORY, relativePath);

  if (!filePath.startsWith(`${DIST_DIRECTORY}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    if (!(await stat(filePath)).isFile()) throw new Error("Not a file");
  } catch {
    // Vite is a single-page app, so client-side routes load index.html.
    if (path.extname(relativePath)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    filePath = path.join(DIST_DIRECTORY, "index.html");
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type":
        MIME_TYPES[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream",
      "Cache-Control": path.basename(filePath) === "index.html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    });
    response.end(content);
  } catch {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Client build unavailable. Run npm run build first.");
  }
}

const server = http.createServer((request, response) => {
  void serveClient(request, response);
});
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8,
  allowEIO3: true,
});

const WORLD_SIZE = 250;
const HALF_WORLD = WORLD_SIZE / 2;
const PLAYER_BASE_RADIUS = 0.75;
const BASE_SPEED = 10; // units per second
const BOT_SPEED_MULTIPLIER = 0.5;
const PELLET_COUNT = 5000;
const PELLET_GRID_SIZE = 8;
const PELLET_DENSITY_CENTER_COUNT = 64;
const PELLET_GAUSSIAN_CHANCE = 0.8;
const PELLET_GAUSSIAN_SPREAD = 16;
const POWERUP_INTERVAL = 24;
const MAGNET_DURATION_MS = 8000;
const PELLET_MAGNET_RANGE_MULTIPLIER = 4;
const PELLET_MAGNET_SPEED = 27;
const BULLET_MAGNET_RADIUS = 3.5;
const TICK_RATE = 60;
const TICK_INTERVAL = 1000 / TICK_RATE;
const BULLET_RADIUS = 0.16;
const BULLET_SPAWN_OFFSET = 1.25;
const BULLET_SPEED = 26;
const BULLET_TTL_MS = 1600;
const PLAYER_BULLET_TTL_MS = 8000;
const BULLET_COOLDOWN_MS = 150;
const PLAYER_MAX_HP = 2500;
const BULLET_DAMAGE = 0.08;
const BASE_VIEW_DISTANCE = 30;
const VIEW_DISTANCE_PER_LEVEL = 6;
const VIEW_DISTANCE_MAX_LEVEL = 10;
const LASER_RANGE =
  BASE_VIEW_DISTANCE + VIEW_DISTANCE_PER_LEVEL * VIEW_DISTANCE_MAX_LEVEL;
const LASER_RADIUS = 0.18;
const LASER_DAMAGE = 180;
const LASER_HIT_SOUND_DELAY_MS = 70;
const COMBAT_MODE_DURATION_MS = 12000;
const BASE_HEALTH_REGEN_PER_SECOND = 5;
const BASE_BODY_DAMAGE = 18;
const BOT_COUNT = 5;
const BOT_RENDER_DISTANCE = 45;
const BOT_PELLET_SCAN_RADIUS = 42;
const BOT_PLAYER_SCAN_RADIUS = 52;
const BOT_THINK_INTERVAL_MS = 240;
const BOT_SHOOT_COOLDOWN_MS = 650;
const BOT_RESPAWN_MS = 3000;
const BOT_WANDER_RETARGET_MS = 2400;
const BOT_MIN_SPAWN_DISTANCE = 28;
const BOT_PLAYER_SHOOT_RANGE = 42;
const BOT_BULLET_DODGE_RADIUS = 14;
const BOT_STATE_MIN_DURATION_MS = 700;
const BOT_AIM_REACTION_MIN_MS = 180;
const BOT_AIM_REACTION_MAX_MS = 420;
const BOT_FARM_STANDOFF_DISTANCE = 10;
const LASER_NET_RANGE = 14;
const LASER_UNLOCK_SCORE = 1000;

const BOT_STATES = Object.freeze({
  ROAMING: "roaming",
  FARMING: "farming",
  COMBAT: "combat",
  RETREATING: "retreating",
  EVADING: "evading",
  RECOVERING: "recovering",
  HUNTING: "hunting",
});

const UPGRADE_DEFS = {
  playerSpeed: { label: "Player Speed", baseCost: 8, maxLevel: 10 },
  viewDistance: {
    label: "View Distance",
    baseCost: 10,
    maxLevel: VIEW_DISTANCE_MAX_LEVEL,
  },
  bulletSpeed: { label: "Bullet Speed", baseCost: 7, maxLevel: 10 },
  bulletDelay: { label: "Bullet Delay", baseCost: 9, maxLevel: 10 },
  maxHealth: { label: "Max Health", baseCost: 10, maxLevel: 10 },
  healthRegenSpeed: { label: "Health Regen", baseCost: 8, maxLevel: 10 },
  bulletDamage: { label: "Bullet Damage", baseCost: 9, maxLevel: 10 },
  laserDamage: { label: "Laser Damage", baseCost: 10, maxLevel: 10 },
  laserNet: { label: "Laser Net", baseCost: 25, maxLevel: 5 },
  bodyDamage: { label: "Body Damage", baseCost: 8, maxLevel: 10 },
  bulletPenetration: { label: "Bullet Penetration", baseCost: 12, maxLevel: 8 },
};

const COMMON_UPGRADE_KEYS = [
  "playerSpeed",
  "viewDistance",
  "maxHealth",
  "healthRegenSpeed",
  "bodyDamage",
];
const BULLET_UPGRADE_KEYS = [
  "bulletSpeed",
  "bulletDelay",
  "bulletDamage",
  "bulletPenetration",
];
const LASER_UPGRADE_KEYS = ["laserDamage", "laserNet"];

const pelletVolume = (4 / 3) * Math.PI * Math.pow(PELLET_MIN_RADIUS, 3);
const bulletVolume = (4 / 3) * Math.PI * Math.pow(BULLET_RADIUS, 3);

function radiusToMass(radius) {
  return volumeFromRadius(radius) / pelletVolume;
}

function volumeFromRadius(radius) {
  return (4 / 3) * Math.PI * Math.pow(radius, 3);
}

function radiusFromVolume(volume) {
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

function randomSeparatedPosition(radius = PLAYER_BASE_RADIUS, minDistance = BOT_MIN_SPAWN_DISTANCE) {
  const minDistanceSq = minDistance * minDistance;

  for (let attempt = 0; attempt < 80; attempt++) {
    const position = randomPosition(radius);
    let clear = true;
    players.forEach((player) => {
      if (!clear) return;
      const requiredDistance = minDistance + player.radius + radius;
      if (distanceSq(position, player.position) < requiredDistance * requiredDistance) {
        clear = false;
      }
    });
    if (clear) return position;
  }

  return randomPosition(radius);
}

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function directionBetween(from, to) {
  return normalizeVector({
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z,
  });
}

function directionToRotation(direction) {
  return {
    yaw: Math.atan2(-direction.x, -direction.z),
    pitch: Math.asin(clamp(-direction.y, -1, 1)),
  };
}

function randomGaussian() {
  const u = Math.max(Number.EPSILON, Math.random());
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const pelletDensityCenters = Array.from(
  { length: PELLET_DENSITY_CENTER_COUNT },
  () => randomPosition(PELLET_GAUSSIAN_SPREAD)
);

function randomPelletPosition(radius = PELLET_MIN_RADIUS) {
  if (Math.random() > PELLET_GAUSSIAN_CHANCE) {
    return randomPosition(radius);
  }

  const center =
    pelletDensityCenters[Math.floor(Math.random() * pelletDensityCenters.length)];
  return clampPosition(
    {
      x: center.x + randomGaussian() * PELLET_GAUSSIAN_SPREAD,
      y: center.y + randomGaussian() * PELLET_GAUSSIAN_SPREAD,
      z: center.z + randomGaussian() * PELLET_GAUSSIAN_SPREAD,
    },
    radius
  );
}

function isPowerUpIndex(index) {
  return index % POWERUP_INTERVAL === 0;
}

function createPellet(index) {
  const tier = pickPelletTier();
  const tierConfig = getPelletTier(tier);
  const size = tierConfig.radius;
  const position = randomPelletPosition(size);
  const isPowerUp = isPowerUpIndex(index);
  return {
    index,
    tier,
    position,
    size,
    maxHp: tierConfig.maxHp,
    hp: tierConfig.maxHp,
    massReward: tierConfig.massReward,
    collisionDamage: tierConfig.collisionDamage,
    isPowerUp,
    active: true,
  };
}

function serializePelletState(pellets) {
  return {
    positions: pellets.map((pellet) => pellet.position),
    tiers: pellets.map((pellet) => pellet.tier),
    sizes: pellets.map((pellet) => pellet.size),
    active: pellets.map((pellet) => pellet.active),
    powerUps: pellets.map((pellet) => pellet.isPowerUp),
    hp: pellets.map((pellet) => pellet.hp),
    maxHp: pellets.map((pellet) => pellet.maxHp),
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
const pelletGrid = new Map();
const movedPelletIndexes = new Set();

const players = new Map();
const bullets = new Map();
const botRespawnTimers = new Map();
let lastTick = Date.now();
let nextBulletId = 1;

function removeBullet(id, reason = "removed") {
  if (!bullets.delete(id)) return false;
  io.emit("bullet-removed", { id, reason });
  return true;
}

function pelletGridCoord(value) {
  return Math.floor((value + HALF_WORLD) / PELLET_GRID_SIZE);
}

function pelletGridKeyFromCoords(x, y, z) {
  return `${x},${y},${z}`;
}

function pelletGridKey(position) {
  return pelletGridKeyFromCoords(
    pelletGridCoord(position.x),
    pelletGridCoord(position.y),
    pelletGridCoord(position.z)
  );
}

function addPelletToGrid(pellet) {
  if (!pellet.active) return;
  const key = pelletGridKey(pellet.position);
  let bucket = pelletGrid.get(key);
  if (!bucket) {
    bucket = new Set();
    pelletGrid.set(key, bucket);
  }
  bucket.add(pellet.index);
  pellet.gridKey = key;
}

function removePelletFromGrid(pellet) {
  if (!pellet.gridKey) return;
  const bucket = pelletGrid.get(pellet.gridKey);
  if (bucket) {
    bucket.delete(pellet.index);
    if (bucket.size === 0) pelletGrid.delete(pellet.gridKey);
  }
  pellet.gridKey = null;
}

function queryPelletsInBounds(minX, minY, minZ, maxX, maxY, maxZ) {
  const minCellX = pelletGridCoord(minX);
  const minCellY = pelletGridCoord(minY);
  const minCellZ = pelletGridCoord(minZ);
  const maxCellX = pelletGridCoord(maxX);
  const maxCellY = pelletGridCoord(maxY);
  const maxCellZ = pelletGridCoord(maxZ);
  const found = [];
  const seen = new Set();

  for (let x = minCellX; x <= maxCellX; x++) {
    for (let y = minCellY; y <= maxCellY; y++) {
      for (let z = minCellZ; z <= maxCellZ; z++) {
        const bucket = pelletGrid.get(pelletGridKeyFromCoords(x, y, z));
        if (!bucket) continue;
        for (const index of bucket) {
          if (seen.has(index)) continue;
          seen.add(index);
          found.push(pellets[index]);
        }
      }
    }
  }

  return found;
}

function queryNearbyPellets(position, radius) {
  const padding = radius + PELLET_MAX_RADIUS;
  return queryPelletsInBounds(
    position.x - padding,
    position.y - padding,
    position.z - padding,
    position.x + padding,
    position.y + padding,
    position.z + padding
  );
}

function queryPelletsAlongSegment(start, end, radius) {
  const padding = radius + PELLET_MAX_RADIUS;
  return queryPelletsInBounds(
    Math.min(start.x, end.x) - padding,
    Math.min(start.y, end.y) - padding,
    Math.min(start.z, end.z) - padding,
    Math.max(start.x, end.x) + padding,
    Math.max(start.y, end.y) + padding,
    Math.max(start.z, end.z) + padding
  );
}

pellets.forEach(addPelletToGrid);

function updateMagnetizedPellets(player, delta, now) {
  if (player.magnetUntil <= now) return;

  const range = player.radius * PELLET_MAGNET_RANGE_MULTIPLIER;
  const rangeSq = range * range;
  const maxStep = PELLET_MAGNET_SPEED * delta;
  const nearbyPellets = queryNearbyPellets(player.position, range);

  for (const pellet of nearbyPellets) {
    if (!pellet.active) continue;
    const dx = player.position.x - pellet.position.x;
    const dy = player.position.y - pellet.position.y;
    const dz = player.position.z - pellet.position.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > rangeSq || distanceSq <= Number.EPSILON) continue;

    const distance = Math.sqrt(distanceSq);
    const step = Math.min(maxStep, distance);
    removePelletFromGrid(pellet);
    pellet.position.x += (dx / distance) * step;
    pellet.position.y += (dy / distance) * step;
    pellet.position.z += (dz / distance) * step;
    addPelletToGrid(pellet);
    movedPelletIndexes.add(pellet.index);
  }
}

function getUpgradeLevel(player, key) {
  return player?.upgrades?.[key] || 0;
}

function getUpgradeCost(player, key) {
  const def = UPGRADE_DEFS[key];
  if (!def) return Infinity;
  const level = getUpgradeLevel(player, key);
  return Math.ceil(def.baseCost * Math.pow(1.7, level));
}

function createUpgradeState() {
  return Object.keys(UPGRADE_DEFS).reduce((state, key) => {
    state[key] = 0;
    return state;
  }, {});
}

function getAvailableUpgradeKeys(player) {
  const weaponKeys =
    player.weaponMode === "laser"
      ? LASER_UPGRADE_KEYS
      : BULLET_UPGRADE_KEYS;
  return new Set([...COMMON_UPGRADE_KEYS, ...weaponKeys]);
}

function getPlayerMaxHp(player) {
  return PLAYER_MAX_HP + getUpgradeLevel(player, "maxHealth") * 250;
}

function getViewDistance(player) {
  return (
    BASE_VIEW_DISTANCE +
    getUpgradeLevel(player, "viewDistance") * VIEW_DISTANCE_PER_LEVEL
  );
}

function getHealthRegen(player, isInCombat) {
  const regenPerSecond =
    BASE_HEALTH_REGEN_PER_SECOND +
    getUpgradeLevel(player, "healthRegenSpeed") * 0.7;
  return isInCombat ? regenPerSecond : regenPerSecond * 5;
}

function getBulletDamage(player) {
  return BULLET_DAMAGE + getUpgradeLevel(player, "bulletDamage") * 0.035;
}

function getLaserDamage(player) {
  return LASER_DAMAGE + getUpgradeLevel(player, "laserDamage") * 35;
}

function getLaserThickness(player) {
  return 1 + getUpgradeLevel(player, "laserDamage") * 0.12;
}

function getBodyDamage(player) {
  return BASE_BODY_DAMAGE + getUpgradeLevel(player, "bodyDamage") * 4;
}

function getBulletSpeed(player) {
  return BULLET_SPEED * (1 + getUpgradeLevel(player, "bulletSpeed") * 0.1);
}

function getBulletCooldown(player) {
  if (player?.isBot) return BOT_SHOOT_COOLDOWN_MS;
  return Math.max(28, BULLET_COOLDOWN_MS * Math.pow(0.88, getUpgradeLevel(player, "bulletDelay")));
}

function getBulletPenetration(player) {
  return 1 + getUpgradeLevel(player, "bulletPenetration");
}

function getPlayerSpeed(player) {
  const upgradeMultiplier =
    typeof player === "number" ? 1 : 1 + getUpgradeLevel(player, "playerSpeed") * 0.08;
  const botMultiplier = player?.isBot ? BOT_SPEED_MULTIPLIER : 1;
  return BASE_SPEED * upgradeMultiplier * botMultiplier;
}

function getPelletContactDamage(pellet) {
  return pellet.collisionDamage;
}

function createBotAi(now = Date.now()) {
  const phase = Math.random() * Math.PI * 2;
  return {
    state: BOT_STATES.ROAMING,
    stateUntil: now,
    nextThinkAt: now + randomBetween(0, BOT_THINK_INTERVAL_MS),
    targetType: "position",
    targetId: null,
    targetIndex: null,
    reactionUntil: now + randomBetween(
      BOT_AIM_REACTION_MIN_MS,
      BOT_AIM_REACTION_MAX_MS
    ),
    currentAim: { x: 0, y: 0, z: -1 },
    aimBias: { x: 0, y: 0, z: 0 },
    aimPhase: { x: phase, y: phase + 2.1, z: phase + 4.2 },
    nextAimBiasAt: now,
    aimHesitationUntil: 0,
    nextAimHesitationAt: now + randomBetween(900, 2200),
    firePauseUntil: 0,
    nextFirePauseAt: now + randomBetween(1200, 2800),
    strafeDirection: Math.random() < 0.5 ? -1 : 1,
    strafeActive: true,
    nextStrafeAt: now + randomBetween(650, 1500),
    verticalDirection: 0,
    verticalActive: false,
    nextVerticalAt: now + randomBetween(900, 2200),
    threatBulletId: null,
    wanderTarget: null,
    wanderTargetUntil: 0,
    lastProgressPosition: null,
    lastProgressAt: now,
    stuckUntil: 0,
  };
}

function buildUpgradePayload(player) {
  const upgrades = {};
  const availableUpgradeKeys = getAvailableUpgradeKeys(player);
  for (const [key, def] of Object.entries(UPGRADE_DEFS)) {
    if (!availableUpgradeKeys.has(key)) continue;
    const level = getUpgradeLevel(player, key);
    upgrades[key] = {
      label: def.label,
      level,
      maxLevel: def.maxLevel,
      cost: level >= def.maxLevel ? null : getUpgradeCost(player, key),
    };
  }
  return {
    mass: player.mass,
    score: player.score,
    laserUnlockScore: LASER_UNLOCK_SCORE,
    weaponMode: player.weaponMode,
    hp: player.hp,
    maxHp: getPlayerMaxHp(player),
    viewDistance: getViewDistance(player),
    upgrades,
  };
}

function emitUpgradeState(player) {
  if (player.isBot) return;
  io.to(player.id).emit("upgrade-state", buildUpgradePayload(player));
}

function createPlayerState({ id, name, isBot = false, position = null }) {
  const mass = Math.floor(radiusToMass(PLAYER_BASE_RADIUS));
  const player = {
    id,
    name,
    isBot,
    position: position || randomPosition(PLAYER_BASE_RADIUS),
    radius: PLAYER_BASE_RADIUS,
    mass,
    score: 0,
    weaponMode: isBot ? "laser" : "bullet",
    upgrades: createUpgradeState(),
    speed: BASE_SPEED,
    hp: PLAYER_MAX_HP,
    magnetUntil: 0,
    bulletMagnetUntil: 0,
    nextShootAt: 0,
    nextLaserHitSoundAt: 0,
    combatUntil: 0,
    activeLaser: null,
    ai: isBot ? createBotAi() : null,
    input: {
      forward: false,
      movement: {},
      rotation: { yaw: 0, pitch: 0 },
      aim: null,
      shoot: false,
      weaponMode: isBot ? "laser" : "bullet",
    },
  };
  player.speed = getPlayerSpeed(player);
  return player;
}

function respawnPellet(pellet) {
  removePelletFromGrid(pellet);
  pellet.tier = pickPelletTier();
  const tierConfig = getPelletTier(pellet.tier);
  pellet.size = tierConfig.radius;
  pellet.position = randomPelletPosition(pellet.size);
  pellet.maxHp = tierConfig.maxHp;
  pellet.hp = pellet.maxHp;
  pellet.massReward = tierConfig.massReward;
  pellet.collisionDamage = tierConfig.collisionDamage;
  pellet.active = true;
  addPelletToGrid(pellet);
  pelletState.positions[pellet.index] = pellet.position;
  pelletState.tiers[pellet.index] = pellet.tier;
  pelletState.sizes[pellet.index] = pellet.size;
  pelletState.active[pellet.index] = true;
  pelletState.powerUps[pellet.index] = pellet.isPowerUp;
  pelletState.hp[pellet.index] = pellet.hp;
  pelletState.maxHp[pellet.index] = pellet.maxHp;
  io.emit("pellet-respawn", {
    index: pellet.index,
    tier: pellet.tier,
    position: pellet.position,
    size: pellet.size,
    hp: pellet.hp,
    maxHp: pellet.maxHp,
    isPowerUp: pellet.isPowerUp,
  });
}

function rotationToRight(rotation = { yaw: 0 }) {
  const yaw = rotation.yaw || 0;
  return {
    x: Math.cos(yaw),
    y: 0,
    z: -Math.sin(yaw),
  };
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length <= 0) return vector;
  vector.x /= length;
  vector.y /= length;
  vector.z /= length;
  return vector;
}

function segmentSphereIntersects(start, end, center, radius) {
  const sx = start.x - center.x;
  const sy = start.y - center.y;
  const sz = start.z - center.z;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;

  if (lengthSq <= 0) {
    return sx * sx + sy * sy + sz * sz <= radius * radius;
  }

  const t = clamp(-(sx * dx + sy * dy + sz * dz) / lengthSq, 0, 1);
  const closestX = sx + dx * t;
  const closestY = sy + dy * t;
  const closestZ = sz + dz * t;
  return closestX * closestX + closestY * closestY + closestZ * closestZ <= radius * radius;
}

function handlePelletCollisions(player) {
  const pickupRadius = player.radius;
  const pickupRadiusSq = pickupRadius * pickupRadius;

  const nearbyPellets = queryNearbyPellets(player.position, pickupRadius);
  for (const pellet of nearbyPellets) {
    if (!pellet.active) continue;
    const dx = player.position.x - pellet.position.x;
    const dy = player.position.y - pellet.position.y;
    const dz = player.position.z - pellet.position.z;
    if (dx * dx + dy * dy + dz * dz <= pickupRadiusSq) {
      const contactDamage = getPelletContactDamage(pellet);
      if (player.hp <= contactDamage) {
        player.hp = 0;
        defeatPlayer(player, "pellet");
        return;
      }

      player.hp = Math.max(0, player.hp - contactDamage);
      contactConsumePellet(player, pellet);
    }
  }
}

function parseVector(value) {
  if (!value) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z };
}

function getAimRay(player) {
  const fallbackDirection = rotationToForward(player.input.rotation);
  const aimOrigin = parseVector(player.input.aim?.origin);
  const aimDirection = parseVector(player.input.aim?.direction);

  if (player.isBot) {
    const direction = aimDirection || fallbackDirection;
    normalizeVector(direction);
    return {
      origin: { ...player.position },
      direction:
        Math.hypot(direction.x, direction.y, direction.z) > 0
          ? direction
          : fallbackDirection,
    };
  }

  if (!aimOrigin || !aimDirection) {
    return null;
  }

  normalizeVector(aimDirection);
  if (Math.hypot(aimDirection.x, aimDirection.y, aimDirection.z) <= 0) {
    return null;
  }

  const dx = aimOrigin.x - player.position.x;
  const dy = aimOrigin.y - player.position.y;
  const dz = aimOrigin.z - player.position.z;
  const maxCameraDistance = getViewDistance(player) + player.radius + 2;
  if (dx * dx + dy * dy + dz * dz > maxCameraDistance * maxCameraDistance) {
    return null;
  }

  return {
    origin: aimOrigin,
    direction: aimDirection,
  };
}

function raySphereIntersectionDistance(origin, direction, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const near = -b - sqrtDiscriminant;
  const far = -b + sqrtDiscriminant;
  if (far < 0) return null;
  return near >= 0 ? near : far;
}

function applyAimRayPlayerHits(owner, origin, direction) {
  const hits = [];
  players.forEach((target) => {
    if (target.id === owner.id) return;
    const distance = raySphereIntersectionDistance(
      origin,
      direction,
      target.position,
      target.radius
    );
    if (distance === null) return;
    hits.push({ target, distance });
  });

  hits.sort((a, b) => a.distance - b.distance);
  for (const hit of hits) {
    if (!players.has(hit.target.id)) continue;
    applyBulletPlayerHit(
      {
        ownerId: owner.id,
        damage: getBulletDamage(owner),
      },
      hit.target
    );
    return true;
  }
  return false;
}

function shootBullet(player) {
  const aimRay = getAimRay(player);
  if (!aimRay) return;

  const now = Date.now();
  if (player.nextShootAt && player.nextShootAt > now) return;
  player.nextShootAt = now + getBulletCooldown(player);

  const { origin, direction } = aimRay;
  const id = String(nextBulletId++);
  const bulletSpeed = getBulletSpeed(player);
  const penetration = getBulletPenetration(player);
  const spawnPosition = {
    x: origin.x + direction.x * BULLET_SPAWN_OFFSET,
    y: origin.y + direction.y * BULLET_SPAWN_OFFSET,
    z: origin.z + direction.z * BULLET_SPAWN_OFFSET,
  };

  bullets.set(id, {
    id,
    ownerId: player.id,
    ownerIsBot: Boolean(player.isBot),
    damage: getBulletDamage(player),
    penetrationLeft: penetration,
    hitPlayerIds: new Set(),
    hitPelletIndexes: new Set(),
    canHitPlayers: true,
    magnetRadius: player.bulletMagnetUntil > now ? BULLET_MAGNET_RADIUS : 0,
    radius: BULLET_RADIUS,
    position: spawnPosition,
    velocity: {
      x: direction.x * bulletSpeed,
      y: direction.y * bulletSpeed,
      z: direction.z * bulletSpeed,
    },
    expiresAt: now + (player.isBot ? BULLET_TTL_MS : PLAYER_BULLET_TTL_MS),
  });
}

function getRayEnd(origin, direction, range = LASER_RANGE) {
  return {
    x: origin.x + direction.x * range,
    y: origin.y + direction.y * range,
    z: origin.z + direction.z * range,
  };
}

function findNearestLaserTarget(owner, origin, direction, end) {
  let nearest = null;

  players.forEach((target) => {
    if (target.id === owner.id) return;
    const distance = raySphereIntersectionDistance(
      origin,
      direction,
      target.position,
      target.radius + LASER_RADIUS
    );
    if (distance === null || distance > LASER_RANGE) return;
    if (!nearest || distance < nearest.distance) {
      nearest = { type: "player", target, distance };
    }
  });

  const nearbyPellets = queryPelletsAlongSegment(origin, end, LASER_RADIUS);
  for (const pellet of nearbyPellets) {
    if (!pellet.active) continue;
    const distance = raySphereIntersectionDistance(
      origin,
      direction,
      pellet.position,
      pellet.size + LASER_RADIUS
    );
    if (distance === null || distance > LASER_RANGE) continue;
    if (!nearest || distance < nearest.distance) {
      nearest = { type: "pellet", target: pellet, distance };
    }
  }

  return nearest;
}

function applyLaserTargetHit(owner, hit, delta, now) {
  if (hit.type === "player") {
    setPlayersInCombat(owner, hit.target, now);
    hit.target.hp = Math.max(
      0,
      hit.target.hp - getLaserDamage(owner) * delta
    );
    if (owner.nextLaserHitSoundAt <= now) {
      owner.nextLaserHitSoundAt = now + LASER_HIT_SOUND_DELAY_MS;
      io.to(owner.id).emit("world-sound", {
        type: "laser-hit",
        position: hit.target.position,
      });
    }
    if (hit.target.hp <= 0) {
      awardVictimMass(owner, hit.target);
      io.to(owner.id).emit("shot-confirmed", { target: "player" });
      defeatPlayer(hit.target, "player");
    }
    return;
  }

  applyBulletPelletHit(
    {
      ownerId: owner.id,
      damage: (getLaserDamage(owner) * delta) / 125,
    },
    hit.target
  );
}

function updatePlayerLaser(player, delta) {
  player.activeLaser = null;
  if (player.weaponMode !== "laser" || !player.input.shoot) {
    player.nextLaserHitSoundAt = 0;
    return;
  }

  const aimRay = getAimRay(player);
  if (!aimRay) {
    player.nextLaserHitSoundAt = 0;
    return;
  }

  const { origin, direction } = aimRay;
  const end = getRayEnd(origin, direction);
  const hit = findNearestLaserTarget(player, origin, direction, end);
  const now = Date.now();
  const netTargets =
    hit?.type === "pellet"
      ? getLaserNetTargets(
          hit.target,
          getUpgradeLevel(player, "laserNet")
        )
      : [];
  const netSegments =
    hit?.type === "pellet"
      ? netTargets.map((netTarget) => ({
          sourcePelletIndex: hit.target.index,
          targetPelletIndex: netTarget.target.index,
          origin: { ...hit.target.position },
          end: { ...netTarget.target.position },
        }))
      : [];

  if (hit) applyLaserTargetHit(player, hit, delta, now);
  for (const netTarget of netTargets) {
    applyLaserTargetHit(player, netTarget, delta, now);
  }

  player.activeLaser = {
    origin,
    end,
    hitPlayerId: hit?.type === "player" ? hit.target.id : null,
    thickness: getLaserThickness(player),
    netSegments,
  };
}

function getLaserNetTargets(sourcePellet, level) {
  if (!sourcePellet?.active || level <= 0) return [];

  return queryNearbyPellets(sourcePellet.position, LASER_NET_RANGE)
    .filter(
      (pellet) =>
        pellet.active &&
        pellet.index !== sourcePellet.index
    )
    .map((pellet) => ({
      type: "pellet",
      target: pellet,
      distance: Math.sqrt(
        distanceSq(sourcePellet.position, pellet.position)
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, level);
}

function tryActivatePelletMagnet(player, pellet) {
  if (!pellet.isPowerUp || Math.random() >= 1 / 8) return;
  player.magnetUntil = Date.now() + MAGNET_DURATION_MS;
  io.to(player.id).emit("powerup-activated", {
    durationMs: MAGNET_DURATION_MS,
  });
}

function awardMassCurrency(player, amount) {
  const gainedMass = Math.max(1, Math.round(amount));
  player.mass += gainedMass;
  player.score += gainedMass;

  if (
    !player.isBot &&
    player.weaponMode === "bullet" &&
    player.score >= LASER_UNLOCK_SCORE
  ) {
    player.weaponMode = "laser";
    player.input.weaponMode = "laser";
    player.upgrades = createUpgradeState();
    player.hp = Math.min(player.hp, getPlayerMaxHp(player));
  }

  player.speed = getPlayerSpeed(player);
  emitUpgradeState(player);
  if (!player.isBot) {
    io.to(player.id).emit("mass-gained", {
      amount: gainedMass,
      totalScore: player.score,
      laserUnlockScore: LASER_UNLOCK_SCORE,
      weaponMode: player.weaponMode,
    });
  }
}

function eatPellet(player, pellet) {
  removePelletFromGrid(pellet);
  pellet.active = false;
  pelletState.active[pellet.index] = false;
  awardMassCurrency(
    player,
    pellet.massReward
  );
  io.emit("pellet-eaten", {
    index: pellet.index,
    position: pellet.position,
  });
  tryActivatePelletMagnet(player, pellet);
  setTimeout(() => respawnPellet(pellet), pellet.isPowerUp ? 5000 : 2500);
}

function contactConsumePellet(player, pellet) {
  removePelletFromGrid(pellet);
  pellet.active = false;
  pelletState.active[pellet.index] = false;
  io.emit("pellet-eaten", {
    index: pellet.index,
    position: pellet.position,
  });

  awardMassCurrency(
    player,
    pellet.massReward
  );
  tryActivatePelletMagnet(player, pellet);

  setTimeout(() => respawnPellet(pellet), pellet.isPowerUp ? 5000 : 2500);
}

function defeatPlayer(player, reason = "defeated") {
  if (!players.has(player.id)) return;
  removePlayer(player.id);
  io.to(player.id).emit("player-died", { reason });
}

function awardVictimMass(killer, victim) {
  if (!killer || !victim || killer.id === victim.id || !players.has(killer.id)) return;
  awardMassCurrency(killer, victim.mass);
}

function setPlayersInCombat(attacker, victim, now = Date.now()) {
  if (!attacker || !victim) return;
  const combatUntil = now + COMBAT_MODE_DURATION_MS;
  attacker.combatUntil = combatUntil;
  victim.combatUntil = combatUntil;
}

function applyBulletPlayerHit(bullet, target) {
  setPlayersInCombat(players.get(bullet.ownerId), target);
  target.hp = Math.max(0, target.hp - bullet.damage * 125);
  io.to(bullet.ownerId).emit("world-sound", {
    type: "player-hit",
    position: target.position,
  });
  if (target.hp <= 0) {
    awardVictimMass(players.get(bullet.ownerId), target);
    io.to(bullet.ownerId).emit("shot-confirmed", { target: "player" });
    defeatPlayer(target, "player");
  } else {
    io.to(bullet.ownerId).emit("shot-hit", { target: "player" });
  }
}

function applyBulletPelletHit(bullet, pellet) {
  const owner = players.get(bullet.ownerId);
  pellet.hp = Math.max(0, pellet.hp - bullet.damage);
  pelletState.hp[pellet.index] = pellet.hp;
  pelletState.maxHp[pellet.index] = pellet.maxHp;

  if (pellet.hp <= 0) {
    if (owner) {
      awardMassCurrency(owner, pellet.massReward);
    }
    removePelletFromGrid(pellet);
    pellet.active = false;
    pelletState.active[pellet.index] = false;
    io.to(bullet.ownerId).emit("shot-confirmed", { target: "pellet" });
    io.to(bullet.ownerId).emit("world-sound", {
      type: "pellet-hit",
      position: pellet.position,
    });
    io.emit("pellet-depleted", { index: pellet.index });
    setTimeout(() => respawnPellet(pellet), pellet.isPowerUp ? 5000 : 2500);
    return;
  }

  io.emit("pellet-damaged", {
    index: pellet.index,
    size: pellet.size,
    hp: pellet.hp,
    maxHp: pellet.maxHp,
  });
}

function findBestHumanPlayer(bot, maxDistance = BOT_PLAYER_SCAN_RADIUS) {
  let best = null;
  players.forEach((player) => {
    if (player.id === bot.id || player.isBot) return;
    const currentDistanceSq = distanceSq(bot.position, player.position);
    if (currentDistanceSq > maxDistance * maxDistance) return;

    const distance = Math.sqrt(currentDistanceSq);
    const healthRatio = player.hp / Math.max(1, getPlayerMaxHp(player));
    const targetStickiness = bot.ai?.targetId === player.id ? -4 : 0;
    const score = distance + healthRatio * 7 + targetStickiness;
    if (!best || score < best.score) {
      best = { target: player, distance, score };
    }
  });
  return best;
}

function findBestBotPellet(bot) {
  const nearbyPellets = queryNearbyPellets(bot.position, BOT_PELLET_SCAN_RADIUS);
  let best = null;

  for (const pellet of nearbyPellets) {
    if (!pellet.active) continue;
    const currentDistanceSq = distanceSq(bot.position, pellet.position);
    if (currentDistanceSq > BOT_PELLET_SCAN_RADIUS * BOT_PELLET_SCAN_RADIUS) {
      continue;
    }

    const distance = Math.sqrt(currentDistanceSq);
    const targetStickiness = bot.ai?.targetIndex === pellet.index ? 5 : 0;
    const score =
      pellet.massReward * 5 - distance * 0.35 + targetStickiness;
    if (!best || score > best.score) {
      best = { target: pellet, distance, score };
    }
  }

  return best;
}

function findIncomingBulletThreat(bot) {
  let nearest = null;
  let nearestDistanceSq = BOT_BULLET_DODGE_RADIUS * BOT_BULLET_DODGE_RADIUS;

  bullets.forEach((bullet) => {
    if (bullet.ownerId === bot.id) return;
    const owner = players.get(bullet.ownerId);
    if (!owner || owner.isBot) return;

    const toBot = {
      x: bot.position.x - bullet.position.x,
      y: bot.position.y - bullet.position.y,
      z: bot.position.z - bullet.position.z,
    };
    const currentDistanceSq = toBot.x * toBot.x + toBot.y * toBot.y + toBot.z * toBot.z;
    if (currentDistanceSq >= nearestDistanceSq) return;

    const closingSpeed =
      bullet.velocity.x * toBot.x +
      bullet.velocity.y * toBot.y +
      bullet.velocity.z * toBot.z;
    if (closingSpeed <= 0) return;

    nearest = bullet;
    nearestDistanceSq = currentDistanceSq;
  });

  return nearest;
}

function findLaserThreatOwner(bot) {
  let threatOwner = null;
  players.forEach((player) => {
    if (
      !threatOwner &&
      player.id !== bot.id &&
      player.activeLaser?.hitPlayerId === bot.id
    ) {
      threatOwner = player;
    }
  });
  return threatOwner;
}

function pickBotWanderTarget(bot, now) {
  const ai = bot.ai;
  if (ai.wanderTarget && ai.wanderTargetUntil > now) return ai.wanderTarget;

  ai.wanderTarget = randomPosition(bot.radius);
  ai.wanderTargetUntil =
    now + BOT_WANDER_RETARGET_MS + randomBetween(0, 1200);
  return ai.wanderTarget;
}

function pickBotRetreatTarget(bot, danger, now) {
  if (!danger) return pickBotWanderTarget(bot, now);
  const away = directionBetween(danger.position, bot.position);
  return clampPosition(
    {
      x: bot.position.x + away.x * 32 + randomBetween(-5, 5),
      y: bot.position.y + away.y * 22 + randomBetween(-4, 4),
      z: bot.position.z + away.z * 32 + randomBetween(-5, 5),
    },
    bot.radius
  );
}

function setBotState(bot, nextState, now, force = false) {
  const ai = bot.ai;
  if (ai.state === nextState) return true;
  if (!force && ai.stateUntil > now) return false;

  ai.state = nextState;
  ai.stateUntil =
    now + BOT_STATE_MIN_DURATION_MS + randomBetween(0, 650);
  ai.wanderTargetUntil = 0;
  return true;
}

function setBotTarget(bot, type, target, now) {
  const ai = bot.ai;
  const nextId = type === "player" ? target?.id ?? null : null;
  const nextIndex = type === "pellet" ? target?.index ?? null : null;
  const changed =
    ai.targetType !== type ||
    ai.targetId !== nextId ||
    ai.targetIndex !== nextIndex;

  ai.targetType = type;
  ai.targetId = nextId;
  ai.targetIndex = nextIndex;
  if (
    type === "position" &&
    (changed || !ai.wanderTarget || ai.wanderTargetUntil <= now)
  ) {
    ai.wanderTarget = target ? { ...target } : pickBotWanderTarget(bot, now);
    ai.wanderTargetUntil =
      now + BOT_WANDER_RETARGET_MS + randomBetween(0, 1200);
  }

  if (changed) {
    ai.reactionUntil =
      now +
      randomBetween(BOT_AIM_REACTION_MIN_MS, BOT_AIM_REACTION_MAX_MS);
    ai.nextAimBiasAt = now;
  }
}

function getBotTargetPosition(bot) {
  const ai = bot.ai;
  if (ai.targetType === "player") {
    return players.get(ai.targetId)?.position || null;
  }
  if (ai.targetType === "pellet") {
    const pellet = pellets[ai.targetIndex];
    return pellet?.active ? pellet.position : null;
  }
  return ai.wanderTarget;
}

function chooseBotPlan(bot, now) {
  const ai = bot.ai;
  const bulletThreat = findIncomingBulletThreat(bot);
  const laserThreatOwner = findLaserThreatOwner(bot);
  const playerInfo = findBestHumanPlayer(bot);
  const healthRatio = bot.hp / Math.max(1, getPlayerMaxHp(bot));
  const targetHealthRatio = playerInfo
    ? playerInfo.target.hp / Math.max(1, getPlayerMaxHp(playerInfo.target))
    : 1;

  ai.threatBulletId = bulletThreat?.id || null;

  if (bulletThreat || laserThreatOwner) {
    const owner =
      laserThreatOwner ||
      players.get(bulletThreat?.ownerId) ||
      playerInfo?.target;
    setBotState(bot, BOT_STATES.EVADING, now, true);
    if (owner) setBotTarget(bot, "player", owner, now);
    return;
  }

  if (playerInfo && healthRatio < 0.3) {
    setBotState(bot, BOT_STATES.RETREATING, now, true);
    setBotTarget(bot, "player", playerInfo.target, now);
    return;
  }

  if (
    healthRatio < 0.52 &&
    (bot.combatUntil > now || (playerInfo && playerInfo.distance < 30))
  ) {
    if (setBotState(bot, BOT_STATES.RECOVERING, now)) {
      setBotTarget(
        bot,
        "position",
        pickBotRetreatTarget(bot, playerInfo?.target, now),
        now
      );
    }
    return;
  }

  if (
    playerInfo &&
    targetHealthRatio < 0.35 &&
    healthRatio > 0.6
  ) {
    if (setBotState(bot, BOT_STATES.HUNTING, now)) {
      setBotTarget(bot, "player", playerInfo.target, now);
    }
    return;
  }

  if (playerInfo && playerInfo.distance <= BOT_PLAYER_SHOOT_RANGE) {
    if (setBotState(bot, BOT_STATES.COMBAT, now)) {
      setBotTarget(bot, "player", playerInfo.target, now);
    }
    return;
  }

  const pelletInfo = findBestBotPellet(bot);
  if (pelletInfo) {
    if (setBotState(bot, BOT_STATES.FARMING, now)) {
      setBotTarget(bot, "pellet", pelletInfo.target, now);
    }
    return;
  }

  if (healthRatio < 0.7) {
    if (setBotState(bot, BOT_STATES.RECOVERING, now)) {
      setBotTarget(bot, "position", pickBotWanderTarget(bot, now), now);
    }
    return;
  }

  if (setBotState(bot, BOT_STATES.ROAMING, now)) {
    setBotTarget(bot, "position", pickBotWanderTarget(bot, now), now);
  }
}

function getBotAimError(bot, distance) {
  if (bot.ai.targetType === "player") {
    const distanceRatio = clamp(distance / BOT_PLAYER_SHOOT_RANGE, 0, 1);
    return 0.08 + distanceRatio * 1.15;
  }
  if (bot.ai.targetType === "pellet") {
    return 0.03 + clamp(distance / BOT_PELLET_SCAN_RADIUS, 0, 1) * 0.22;
  }
  return 0.04;
}

function updateBotAim(bot, now, delta) {
  const ai = bot.ai;
  const targetPosition = getBotTargetPosition(bot);
  if (!targetPosition) {
    ai.nextThinkAt = 0;
    bot.input.shoot = false;
    return;
  }

  const distance = Math.sqrt(distanceSq(bot.position, targetPosition));
  const aimError = getBotAimError(bot, distance);

  if (now >= ai.nextAimBiasAt) {
    const correctionRoll = Math.random();
    const correction =
      correctionRoll < 0.15 ? 1.65 : correctionRoll < 0.38 ? 0.55 : 1;
    ai.aimBias.x = randomBetween(-aimError, aimError) * correction;
    ai.aimBias.y = randomBetween(-aimError, aimError) * correction;
    ai.aimBias.z = randomBetween(-aimError, aimError) * correction;
    ai.nextAimBiasAt = now + randomBetween(380, 850);
  }

  if (now >= ai.nextAimHesitationAt) {
    ai.aimHesitationUntil = now + randomBetween(90, 260);
    ai.nextAimHesitationAt = now + randomBetween(900, 2400);
  }

  if (now >= ai.reactionUntil && now >= ai.aimHesitationUntil) {
    const drift = aimError * 0.3;
    const time = now * 0.002;
    const noisyTarget = {
      x:
        targetPosition.x +
        ai.aimBias.x +
        Math.sin(time + ai.aimPhase.x) * drift,
      y:
        targetPosition.y +
        ai.aimBias.y +
        Math.sin(time * 0.83 + ai.aimPhase.y) * drift,
      z:
        targetPosition.z +
        ai.aimBias.z +
        Math.sin(time * 1.13 + ai.aimPhase.z) * drift,
    };
    const desiredAim = directionBetween(bot.position, noisyTarget);
    const distanceRatio = clamp(distance / BOT_PLAYER_SHOOT_RANGE, 0, 1);
    const turnRate =
      ai.targetType === "player"
        ? 4.5 - distanceRatio * 1.7
        : 3.6;
    const smoothing = 1 - Math.exp(-turnRate * delta);
    ai.currentAim.x += (desiredAim.x - ai.currentAim.x) * smoothing;
    ai.currentAim.y += (desiredAim.y - ai.currentAim.y) * smoothing;
    ai.currentAim.z += (desiredAim.z - ai.currentAim.z) * smoothing;
    normalizeVector(ai.currentAim);
  }

  bot.input.rotation = directionToRotation(ai.currentAim);
  bot.input.aim = {
    origin: { ...bot.position },
    direction: { ...ai.currentAim },
  };
}

function addMovementToward(bot, targetPosition, movement) {
  if (!targetPosition) return;
  const desired = directionBetween(bot.position, targetPosition);
  const forward = rotationToForward(bot.input.rotation);
  const right = rotationToRight(bot.input.rotation);
  const forwardAmount =
    desired.x * forward.x + desired.y * forward.y + desired.z * forward.z;
  const rightAmount = desired.x * right.x + desired.z * right.z;

  if (forwardAmount > 0.2) movement.forward = true;
  if (forwardAmount < -0.2) movement.backward = true;
  if (rightAmount > 0.2) movement.right = true;
  if (rightAmount < -0.2) movement.left = true;
  if (desired.y > 0.25) movement.up = true;
  if (desired.y < -0.25) movement.down = true;
}

function updateBotMovement(bot, now) {
  const ai = bot.ai;
  const targetPosition = getBotTargetPosition(bot);
  const movement = {};

  if (now >= ai.nextStrafeAt) {
    if (Math.random() < 0.7) ai.strafeDirection *= -1;
    ai.strafeActive = Math.random() < 0.72;
    ai.nextStrafeAt = now + randomBetween(650, 1700);
  }
  if (now >= ai.nextVerticalAt) {
    ai.verticalDirection = Math.random() < 0.5 ? -1 : 1;
    ai.verticalActive = Math.random() < 0.32;
    ai.nextVerticalAt = now + randomBetween(1000, 2600);
  }

  if (!ai.lastProgressPosition) {
    ai.lastProgressPosition = { ...bot.position };
    ai.lastProgressAt = now;
  } else if (now - ai.lastProgressAt >= 1100) {
    if (distanceSq(bot.position, ai.lastProgressPosition) < 0.2) {
      ai.stuckUntil = now + 750;
      ai.strafeDirection *= -1;
      ai.wanderTargetUntil = 0;
    }
    ai.lastProgressPosition = { ...bot.position };
    ai.lastProgressAt = now;
  }

  if (now < ai.stuckUntil) {
    movement.forward = true;
    movement.right = ai.strafeDirection > 0;
    movement.left = ai.strafeDirection < 0;
    movement.up = true;
    bot.input.movement = movement;
    return;
  }

  const nearBoundary =
    Math.abs(bot.position.x) > HALF_WORLD - 7 ||
    Math.abs(bot.position.y) > HALF_WORLD - 7 ||
    Math.abs(bot.position.z) > HALF_WORLD - 7;
  if (nearBoundary) {
    addMovementToward(bot, { x: 0, y: 0, z: 0 }, movement);
    bot.input.movement = movement;
    return;
  }

  const targetDistance = targetPosition
    ? Math.sqrt(distanceSq(bot.position, targetPosition))
    : Infinity;
  const strafe = () => {
    movement.right = ai.strafeDirection > 0;
    movement.left = ai.strafeDirection < 0;
  };

  switch (ai.state) {
    case BOT_STATES.EVADING:
      strafe();
      movement.backward = true;
      movement.up = ai.verticalActive && ai.verticalDirection > 0;
      movement.down = ai.verticalActive && ai.verticalDirection < 0;
      break;
    case BOT_STATES.RETREATING:
      movement.backward = true;
      strafe();
      break;
    case BOT_STATES.RECOVERING:
      addMovementToward(bot, targetPosition, movement);
      if (ai.targetType === "player") movement.backward = true;
      break;
    case BOT_STATES.HUNTING:
      movement.forward = true;
      if (ai.strafeActive) strafe();
      break;
    case BOT_STATES.COMBAT:
      strafe();
      if (targetDistance > 24) movement.forward = true;
      if (targetDistance < 13) movement.backward = true;
      if (ai.verticalActive) {
        movement.up = ai.verticalDirection > 0;
        movement.down = ai.verticalDirection < 0;
      }
      break;
    case BOT_STATES.FARMING:
      if (targetDistance > BOT_FARM_STANDOFF_DISTANCE + 5) {
        addMovementToward(bot, targetPosition, movement);
      } else if (targetDistance < BOT_FARM_STANDOFF_DISTANCE - 2) {
        movement.backward = true;
      } else {
        strafe();
      }
      break;
    default:
      addMovementToward(bot, targetPosition, movement);
      if (ai.strafeActive && targetDistance < 12) strafe();
      break;
  }

  bot.input.movement = movement;
}

function updateBotFiring(bot, now) {
  const ai = bot.ai;
  const hasTarget = Boolean(getBotTargetPosition(bot));
  const canFire =
    hasTarget &&
    (ai.targetType === "player" ||
      (ai.targetType === "pellet" && ai.state === BOT_STATES.FARMING));

  if (now >= ai.nextFirePauseAt) {
    if (Math.random() < 0.7) {
      ai.firePauseUntil = now + randomBetween(120, 380);
    }
    ai.nextFirePauseAt = now + randomBetween(1100, 2700);
  }

  bot.input.shoot =
    canFire &&
    now >= ai.reactionUntil &&
    now >= ai.firePauseUntil &&
    ai.state !== BOT_STATES.RECOVERING;
}

function updateBotIntent(bot, now, delta) {
  if (!bot.ai) bot.ai = createBotAi(now);
  bot.input.weaponMode = "laser";
  if (now >= bot.ai.nextThinkAt) {
    bot.ai.nextThinkAt =
      now + BOT_THINK_INTERVAL_MS + randomBetween(0, 120);
    chooseBotPlan(bot, now);
  }
  updateBotAim(bot, now, delta);
  updateBotMovement(bot, now);
  updateBotFiring(bot, now);
}

function updateBullets(delta) {
  const now = Date.now();

  bullets.forEach((bullet, id) => {
    const previousPosition = { ...bullet.position };
    bullet.position.x += bullet.velocity.x * delta;
    bullet.position.y += bullet.velocity.y * delta;
    bullet.position.z += bullet.velocity.z * delta;

    const outsideWorld =
      Math.abs(bullet.position.x) > HALF_WORLD ||
      Math.abs(bullet.position.y) > HALF_WORLD ||
      Math.abs(bullet.position.z) > HALF_WORLD;

    if (outsideWorld || bullet.expiresAt <= now) {
      removeBullet(id, outsideWorld ? "outside-world" : "expired");
      return;
    }

    let hitPlayer = false;
    players.forEach((player) => {
      if (!bullet.canHitPlayers) return;
      if (hitPlayer || player.id === bullet.ownerId) return;
      if (bullet.hitPlayerIds.has(player.id)) return;
      const hitDistance = player.radius + bullet.radius;

      if (
        segmentSphereIntersects(
          previousPosition,
          bullet.position,
          player.position,
          hitDistance
        )
      ) {
        bullet.hitPlayerIds.add(player.id);
        applyBulletPlayerHit(bullet, player);
        bullet.penetrationLeft -= 1;
        if (bullet.penetrationLeft <= 0) removeBullet(id, "player-hit");
        hitPlayer = true;
      }
    });
    if (hitPlayer && !bullets.has(id)) return;

    const nearbyPellets = queryPelletsAlongSegment(
      previousPosition,
      bullet.position,
      bullet.radius + (bullet.magnetRadius || 0)
    );
    for (const pellet of nearbyPellets) {
      if (!pellet.active) continue;
      if (bullet.hitPelletIndexes.has(pellet.index)) continue;

      const hitDistance = pellet.size + bullet.radius + (bullet.magnetRadius || 0);

      if (
        segmentSphereIntersects(
          previousPosition,
          bullet.position,
          pellet.position,
          hitDistance
        )
      ) {
        bullet.hitPelletIndexes.add(pellet.index);
        applyBulletPelletHit(bullet, pellet);
        bullet.penetrationLeft -= 1;
        if (bullet.penetrationLeft <= 0) removeBullet(id, "pellet-hit");
        return;
      }
    }
  });
}

function handlePlayerCollisions(player) {
  if (!players.has(player.id)) return;
  players.forEach((other) => {
    if (!players.has(player.id) || !players.has(other.id)) return;
    if (other.id === player.id || other.radius <= 0 || player.radius <= 0)
      return;
    const dx = player.position.x - other.position.x;
    const dy = player.position.y - other.position.y;
    const dz = player.position.z - other.position.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    const minDistance = player.radius + other.radius * 0.85;
    if (distanceSq > minDistance * minDistance) return;
    if (player.radius <= other.radius * 1.1) return;

    if (player.hp === other.hp) {
      player.hp = 0;
      other.hp = 0;
      defeatPlayer(player, "body");
      defeatPlayer(other, "body");
      return;
    }

    const winner = player.hp > other.hp ? player : other;
    const loser = winner === player ? other : player;

    winner.hp = Math.max(1, winner.hp - loser.hp);
    awardVictimMass(winner, loser);
    defeatPlayer(loser, "body");
  });
}

function updatePlayers(delta) {
  const now = Date.now();
  players.forEach((player) => {
    if (player.isBot) updateBotIntent(player, now, delta);
  });

  players.forEach((player) => {
    // The server is authoritative: clients send input, but this function is
    // where movement actually changes the shared multiplayer state.
    const movement = player.input.movement || {};
    if (
      movement.forward ||
      movement.backward ||
      movement.left ||
      movement.right ||
      movement.up ||
      movement.down
    ) {
      const forward = rotationToForward(player.input.rotation);
      const right = rotationToRight(player.input.rotation);
      const direction = { x: 0, y: 0, z: 0 };

      if (movement.forward) {
        direction.x += forward.x;
        direction.y += forward.y;
        direction.z += forward.z;
      }
      if (movement.backward) {
        direction.x -= forward.x;
        direction.y -= forward.y;
        direction.z -= forward.z;
      }
      if (movement.right) {
        direction.x += right.x;
        direction.z += right.z;
      }
      if (movement.left) {
        direction.x -= right.x;
        direction.z -= right.z;
      }
      if (movement.up) direction.y += 1;
      if (movement.down) direction.y -= 1;

      normalizeVector(direction);
      player.position.x += direction.x * player.speed * delta;
      player.position.y += direction.y * player.speed * delta;
      player.position.z += direction.z * player.speed * delta;
      clampPosition(player.position, player.radius);
    }
    updateMagnetizedPellets(player, delta, now);
    handlePelletCollisions(player);
    if (!players.has(player.id)) return;
    const isInCombat = player.combatUntil > now;
    player.hp = Math.min(
      getPlayerMaxHp(player),
      player.hp + getHealthRegen(player, isInCombat) * delta
    );
  });

  players.forEach((player) => {
    updatePlayerLaser(player, delta);
  });

  players.forEach((player) => {
    handlePlayerCollisions(player);
  });
}

function broadcastWorldState() {
  const movedPellets = Array.from(movedPelletIndexes, (index) => ({
    index,
    position: pellets[index].position,
  }));
  const laserPayload = Array.from(players.values())
    .filter((player) => player.activeLaser)
    .flatMap((player) => {
      const primaryLaser = {
        id: player.id,
        ownerId: player.id,
        origin: player.activeLaser.origin,
        end: player.activeLaser.end,
        hitPlayerId: player.activeLaser.hitPlayerId,
        thickness: player.activeLaser.thickness,
        anchorToShooter: true,
      };
      const netLasers = (player.activeLaser.netSegments || []).map(
        (segment) => ({
          id: `${player.id}:net:${segment.sourcePelletIndex}:${segment.targetPelletIndex}`,
          ownerId: player.id,
          origin: segment.origin,
          end: segment.end,
          hitPlayerId: null,
          thickness: Math.max(0.75, player.activeLaser.thickness * 0.8),
          anchorToShooter: false,
        })
      );
      return [primaryLaser, ...netLasers];
    });
  const laseredPlayerIds = new Set(
    laserPayload.map((laser) => laser.hitPlayerId).filter(Boolean)
  );
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
      score: player.score,
      laserUnlockScore: LASER_UNLOCK_SCORE,
      weaponMode: player.weaponMode,
      hp: player.hp,
      maxHp: getPlayerMaxHp(player),
      viewDistance: getViewDistance(player),
      isBot: Boolean(player.isBot),
      isInCombat: player.combatUntil > Date.now(),
      isBeingLasered: laseredPlayerIds.has(player.id),
    });
  });
  const bulletPayload = Array.from(bullets.values()).map((bullet) => ({
    id: bullet.id,
    x: bullet.position.x,
    y: bullet.position.y,
    z: bullet.position.z,
    vx: bullet.velocity.x,
    vy: bullet.velocity.y,
    vz: bullet.velocity.z,
    magnetRadius: bullet.magnetRadius || 0,
    radius: bullet.radius,
  }));
  io.sockets.sockets.forEach((socket) => {
    const isBeingLasered = laserPayload.some(
      (laser) => laser.hitPlayerId === socket.id
    );
    const visibleLasers = laserPayload.filter((laser) => laser.hitPlayerId !== socket.id);
    socket.emit("world-update", {
      players: payload,
      bullets: bulletPayload,
      lasers: visibleLasers,
      movedPellets,
      isBeingLasered,
    });
  });
  movedPelletIndexes.clear();
}

function spawnBot(index) {
  const id = `bot-${index}`;
  if (players.has(id)) return;

  const bot = createPlayerState({
    id,
    name: `Bot ${index + 1}`,
    isBot: true,
    position: randomSeparatedPosition(PLAYER_BASE_RADIUS),
  });

  players.set(id, bot);
  io.emit("player-joined", {
    id: bot.id,
    name: bot.name,
    x: bot.position.x,
    y: bot.position.y,
    z: bot.position.z,
    radius: bot.radius,
    hp: bot.hp,
    maxHp: getPlayerMaxHp(bot),
    isBot: true,
  });
}

function spawnBots() {
  for (let i = 0; i < BOT_COUNT; i++) {
    spawnBot(i);
  }
}

function scheduleBotRespawn(player) {
  if (!player.isBot) return;
  const index = Number(player.id.replace("bot-", ""));
  if (!Number.isInteger(index) || botRespawnTimers.has(index)) return;

  const timer = setTimeout(() => {
    botRespawnTimers.delete(index);
    spawnBot(index);
    broadcastWorldState();
  }, BOT_RESPAWN_MS);
  botRespawnTimers.set(index, timer);
}

function removePlayer(id) {
  const player = players.get(id);
  if (!player) return false;
  players.delete(id);
  scheduleBotRespawn(player);
  bullets.forEach((bullet, bulletId) => {
    if (bullet.ownerId === id) removeBullet(bulletId, "owner-left");
  });
  io.emit("player-left", id);
  broadcastWorldState();
  return true;
}

spawnBots();

setInterval(() => {
  // Main server loop. At 60 ticks per second it moves players, handles
  // collisions, and broadcasts the new world snapshot to every browser.
  const now = Date.now();
  const delta = (now - lastTick) / 1000;
  lastTick = now;
  updatePlayers(delta);
  updateBullets(delta);
  broadcastWorldState();
}, TICK_INTERVAL);

io.on("connection", (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);
  console.log(`Total clients: ${io.engine.clientsCount}`);

  socket.on("join", ({ name }) => {
    const existingPlayer = players.get(socket.id);
    if (existingPlayer) {
      existingPlayer.name = name || existingPlayer.name || "Player";
      socket.emit("pellet-state", pelletState);
      emitUpgradeState(existingPlayer);
      broadcastWorldState();
      return;
    }

    const player = createPlayerState({
      id: socket.id,
      name: name || "Player",
      position: randomSeparatedPosition(PLAYER_BASE_RADIUS),
    });
    players.set(socket.id, player);
    socket.emit("pellet-state", pelletState);
    emitUpgradeState(player);
    socket.broadcast.emit("player-joined", {
      id: player.id,
      name: player.name,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      radius: player.radius,
      hp: player.hp,
      maxHp: getPlayerMaxHp(player),
    });
    broadcastWorldState();
  });

  socket.on("buy-upgrade", ({ key } = {}) => {
    const player = players.get(socket.id);
    const def = UPGRADE_DEFS[key];
    if (!player || !def) return;
    if (!getAvailableUpgradeKeys(player).has(key)) {
      emitUpgradeState(player);
      return;
    }
    const level = getUpgradeLevel(player, key);
    if (level >= def.maxLevel) {
      emitUpgradeState(player);
      return;
    }

    const cost = getUpgradeCost(player, key);
    if (player.mass < cost) {
      emitUpgradeState(player);
      return;
    }

    player.mass -= cost;
    player.upgrades[key] = level + 1;
    player.speed = getPlayerSpeed(player);
    player.hp = Math.min(getPlayerMaxHp(player), player.hp);
    emitUpgradeState(player);
  });

  socket.on("dev-teleport-near-player", () => {
    const player = players.get(socket.id);
    if (!player) return;

    const target = Array.from(players.values()).find((p) => p.id !== player.id);
    if (!target) return;

    const angle = Math.random() * Math.PI * 2;
    const distance = target.radius + player.radius + 6;
    player.position = clampPosition(
      {
        x: target.position.x + Math.cos(angle) * distance,
        y: target.position.y,
        z: target.position.z + Math.sin(angle) * distance,
      },
      player.radius
    );
    player.input.movement = {};
  });

  socket.on("player-input", (input) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.input.forward = Boolean(input.forward);
    player.input.movement = {
      forward: Boolean(input.movement?.forward ?? input.forward),
      backward: Boolean(input.movement?.backward),
      left: Boolean(input.movement?.left),
      right: Boolean(input.movement?.right),
      up: Boolean(input.movement?.up),
      down: Boolean(input.movement?.down),
    };
    if (input.rotation) {
      player.input.rotation = {
        yaw: Number(input.rotation.yaw) || 0,
        pitch: Number(input.rotation.pitch) || 0,
      };
    }
    if (input.aim) {
      player.input.aim = {
        origin: parseVector(input.aim.origin),
        direction: parseVector(input.aim.direction),
      };
    }
    player.input.shoot = Boolean(input.shoot);
    player.input.weaponMode = player.weaponMode;
    if (player.input.shoot && player.weaponMode === "bullet") {
      shootBullet(player);
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
    removePlayer(socket.id);
  });
});

server.listen(SERVER_PORT, "0.0.0.0", () => {
  console.log(`Agar3D web and multiplayer server running on port ${SERVER_PORT}`);
  console.log(`Bots active: ${BOT_COUNT}`);
});
