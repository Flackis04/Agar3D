import { Server } from "socket.io";
import http from "http";

const server = http.createServer();
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
const PELLET_COUNT = 25000;
const PELLET_GRID_SIZE = 8;
const PELLET_MIN_RADIUS = 0.75;
const PELLET_MAX_RADIUS = 1.0;
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
const BULLET_RADIUS = 0.1;
const BULLET_SPEED = 26;
const BULLET_TTL_MS = 1600;
const PLAYER_BULLET_TTL_MS = 8000;
const BULLET_COOLDOWN_MS = 90;
const PLAYER_MAX_HP = 5000;
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
const BASE_HEALTH_REGEN_PER_SECOND = 10;
const BASE_BODY_DAMAGE = 18;
const BOT_COUNT = 5;
const BOT_RENDER_DISTANCE = 45;
const BOT_PELLET_SCAN_RADIUS = 18;
const BOT_THINK_INTERVAL_MS = 450;
const BOT_SHOOT_COOLDOWN_MS = 650;
const BOT_RESPAWN_MS = 3000;
const BOT_WANDER_RETARGET_MS = 2400;
const BOT_MIN_SPAWN_DISTANCE = 28;
const BOT_PLAYER_SHOOT_RANGE = 34;
const BOT_BULLET_DODGE_RADIUS = 14;

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
  bodyDamage: { label: "Body Damage", baseCost: 8, maxLevel: 10 },
  bulletPenetration: { label: "Bullet Penetration", baseCost: 12, maxLevel: 8 },
};

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
  const size = randomBetween(PELLET_MIN_RADIUS, PELLET_MAX_RADIUS);
  const position = randomPelletPosition(size);
  const isPowerUp = isPowerUpIndex(index);
  const maxHp = getPelletMaxHp(size);
  return {
    index,
    position,
    size,
    maxHp,
    hp: maxHp,
    isPowerUp,
    active: true,
  };
}

function serializePelletState(pellets) {
  return {
    positions: pellets.map((pellet) => pellet.position),
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

function getPlayerMaxHp(player) {
  return PLAYER_MAX_HP + getUpgradeLevel(player, "maxHealth") * 500;
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
    getUpgradeLevel(player, "healthRegenSpeed") * 1.4;
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
  return BASE_SPEED * upgradeMultiplier;
}

function getPelletMaxHp(size) {
  return volumeFromRadius(size);
}

function getPelletContactDamage(pellet) {
  return Math.max(65, Math.ceil((pellet.maxHp / pelletVolume) * 65));
}

function buildUpgradePayload(player) {
  const upgrades = {};
  for (const [key, def] of Object.entries(UPGRADE_DEFS)) {
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
    upgrades: createUpgradeState(),
    speed: BASE_SPEED,
    hp: PLAYER_MAX_HP,
    magnetUntil: 0,
    bulletMagnetUntil: 0,
    nextShootAt: 0,
    nextLaserHitSoundAt: 0,
    combatUntil: 0,
    activeLaser: null,
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
  pellet.size = randomBetween(PELLET_MIN_RADIUS, PELLET_MAX_RADIUS);
  pellet.position = randomPelletPosition(pellet.size);
  pellet.maxHp = getPelletMaxHp(pellet.size);
  pellet.hp = pellet.maxHp;
  pellet.active = true;
  addPelletToGrid(pellet);
  pelletState.positions[pellet.index] = pellet.position;
  pelletState.sizes[pellet.index] = pellet.size;
  pelletState.active[pellet.index] = true;
  pelletState.powerUps[pellet.index] = pellet.isPowerUp;
  pelletState.hp[pellet.index] = pellet.hp;
  pelletState.maxHp[pellet.index] = pellet.maxHp;
  io.emit("pellet-respawn", {
    index: pellet.index,
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

  if (!aimOrigin || !aimDirection) {
    return player.isBot
      ? {
          origin: { ...player.position },
          direction: fallbackDirection,
        }
      : null;
  }

  normalizeVector(aimDirection);
  if (Math.hypot(aimDirection.x, aimDirection.y, aimDirection.z) <= 0) {
    return player.isBot
      ? {
          origin: { ...player.position },
          direction: fallbackDirection,
        }
      : null;
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
    position: {
      x: origin.x,
      y: origin.y,
      z: origin.z,
    },
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
  if (player.input.weaponMode !== "laser" || !player.input.shoot) {
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

  if (hit) applyLaserTargetHit(player, hit, delta, now);

  player.activeLaser = {
    origin,
    end,
    hitPlayerId: hit?.type === "player" ? hit.target.id : null,
    thickness: getLaserThickness(player),
  };
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
  player.speed = getPlayerSpeed(player);
  emitUpgradeState(player);
  if (!player.isBot) {
    io.to(player.id).emit("mass-gained", { amount: gainedMass });
  }
}

function eatPellet(player, pellet) {
  removePelletFromGrid(pellet);
  pellet.active = false;
  pelletState.active[pellet.index] = false;
  awardMassCurrency(
    player,
    Math.pow(pellet.size / PELLET_MIN_RADIUS, 3)
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
    Math.pow(pellet.size / PELLET_MIN_RADIUS, 3)
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
      awardMassCurrency(owner, pellet.maxHp / pelletVolume);
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

function findNearestHumanPlayer(bot) {
  const maxDistanceSq = BOT_PLAYER_SHOOT_RANGE * BOT_PLAYER_SHOOT_RANGE;
  let nearest = null;
  let nearestDistanceSq = maxDistanceSq;

  players.forEach((player) => {
    if (player.id === bot.id || player.isBot) return;
    const currentDistanceSq = distanceSq(bot.position, player.position);
    if (currentDistanceSq >= nearestDistanceSq) return;
    nearest = player;
    nearestDistanceSq = currentDistanceSq;
  });

  return nearest;
}

function findNearestBotPellet(bot) {
  const nearbyPellets = queryNearbyPellets(bot.position, BOT_PELLET_SCAN_RADIUS);
  let nearest = null;
  let nearestDistanceSq = BOT_PELLET_SCAN_RADIUS * BOT_PELLET_SCAN_RADIUS;

  for (const pellet of nearbyPellets) {
    if (!pellet.active) continue;
    const currentDistanceSq = distanceSq(bot.position, pellet.position);
    if (currentDistanceSq >= nearestDistanceSq) continue;
    nearest = pellet;
    nearestDistanceSq = currentDistanceSq;
  }

  return nearest;
}

function setBotAim(bot, targetPosition) {
  const direction = directionBetween(bot.position, targetPosition);
  if (Math.hypot(direction.x, direction.y, direction.z) <= 0) return false;

  bot.input.rotation = directionToRotation(direction);
  bot.input.aim = {
    origin: { ...bot.position },
    direction,
  };
  return true;
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

function setBotEvasiveMovement(bot, playerTarget, threat, now) {
  const movement = {};
  const right = rotationToRight(bot.input.rotation);
  const strafeRight = threat
    ? threat.velocity.x * right.x + threat.velocity.z * right.z <= 0
    : Math.floor((now / 900 + Number(bot.id.replace("bot-", ""))) % 2) === 0;

  if (strafeRight) {
    movement.right = true;
  } else {
    movement.left = true;
  }

  const playerDistanceSq = distanceSq(bot.position, playerTarget.position);
  const backoffDistance = bot.radius + playerTarget.radius + 10;
  if (playerDistanceSq < backoffDistance * backoffDistance) {
    movement.backward = true;
  } else if (!threat) {
    movement.forward = true;
  }

  bot.input.movement = movement;
}

function pickBotWanderTarget(bot, now) {
  if (bot.wanderTarget && bot.wanderTargetUntil > now) return bot.wanderTarget;

  bot.wanderTarget = randomPosition(bot.radius);
  bot.wanderTargetUntil = now + BOT_WANDER_RETARGET_MS + randomBetween(0, 1200);
  return bot.wanderTarget;
}

function updateBotIntent(bot, now) {
  if (bot.nextThinkAt && bot.nextThinkAt > now) return;
  bot.nextThinkAt = now + BOT_THINK_INTERVAL_MS + randomBetween(0, 80);
  bot.input.weaponMode = "laser";
  bot.input.shoot = false;

  const playerTarget = findNearestHumanPlayer(bot);
  const pelletTarget = findNearestBotPellet(bot);
  let targetPosition = pelletTarget?.position || pickBotWanderTarget(bot, now);

  setBotAim(bot, targetPosition);
  bot.input.movement = { forward: true };

  if (playerTarget && setBotAim(bot, playerTarget.position)) {
    setBotEvasiveMovement(bot, playerTarget, findIncomingBulletThreat(bot), now);
    bot.input.shoot = true;
  }
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
    if (player.isBot) updateBotIntent(player, now);
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
    .map((player) => ({
      id: player.id,
      origin: player.activeLaser.origin,
      end: player.activeLaser.end,
      hitPlayerId: player.activeLaser.hitPlayerId,
      thickness: player.activeLaser.thickness,
    }));
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
  bot.nextThinkAt = Date.now() + randomBetween(0, BOT_THINK_INTERVAL_MS);
  bot.wanderTarget = randomPosition(bot.radius);
  bot.wanderTargetUntil = Date.now() + randomBetween(500, BOT_WANDER_RETARGET_MS);

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
  // Main server loop. At 20 ticks per second it moves players, handles
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
    player.input.weaponMode = input.weaponMode === "laser" ? "laser" : "bullet";
    if (player.input.shoot && player.input.weaponMode === "bullet") {
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

server.listen(3001, "0.0.0.0", () => {
  console.log("Multiplayer server running on port 3001");
  console.log("Server is accessible on:");
  console.log("  - localhost:3001");
  console.log("  - <your-local-ip>:3001");
  console.log(
    "\nTo find your local IP, run: ip addr show (Linux) or ipconfig (Windows)"
  );
});
