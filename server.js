import "dotenv/config";
import { Server } from "socket.io";
import http from "http";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
const playerBalances = new Map();
const processedStripeEvents = new Set();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204);
      return;
    }

    if (req.method === "POST" && req.url === "/api/create-checkout-session") {
      await createCheckoutSession(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/stripe-webhook") {
      await handleStripeWebhook(req, res);
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/balance")) {
      sendPlayerBalance(req, res);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
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
const STARTING_MASS_USD = 20;
const BASE_SPEED = 10; // units per second
const SPEED_FALLOFF = 0.15;
const PELLET_COUNT = 75000;
const PELLET_GRID_SIZE = 8;
const PELLET_MIN_RADIUS = 0.3;
const PELLET_MAX_RADIUS = 0.55;
const PELLET_CLUSTER_COUNT = 96;
const PELLET_CLUSTER_CHANCE = 0.28;
const PELLET_CLUSTER_RADIUS = 28;
const POWERUP_INTERVAL = 24;
const MAGNET_DURATION_MS = 8000;
const BULLET_MAGNET_RADIUS = 3.5;
const TICK_RATE = 60;
const TICK_INTERVAL = 1000 / TICK_RATE;
const BULLET_RADIUS = 0.1;
const BULLET_SPEED = 26;
const BULLET_TTL_MS = 1600;
const PLAYER_BULLET_TTL_MS = 8000;
const BULLET_COOLDOWN_MS = 90;
const PLAYER_MAX_HP = 1000;
const BULLET_DAMAGE = 0.08;
const LASER_RANGE = 90;
const LASER_RADIUS = 0.18;
const BASE_HEALTH_REGEN_PER_SECOND = 2;
const BASE_BODY_DAMAGE = 18;
const BOT_COUNT = 25;
const BOT_RENDER_DISTANCE = 45;
const BOT_PELLET_SCAN_RADIUS = 18;
const BOT_THINK_INTERVAL_MS = 450;
const BOT_SHOOT_COOLDOWN_MS = 650;
const BOT_RESPAWN_MS = 3000;
const BOT_WANDER_RETARGET_MS = 2400;
const BOT_MIN_SPAWN_DISTANCE = 28;
const BOT_PELLET_STANDOFF_DISTANCE = 12;
const BOT_PLAYER_SHOOT_RANGE = 34;
const BOT_BULLET_DODGE_RADIUS = 14;

const UPGRADE_DEFS = {
  playerSpeed: { label: "Player Speed", baseCost: 8, maxLevel: 10 },
  bulletSpeed: { label: "Bullet Speed", baseCost: 7, maxLevel: 10 },
  bulletDelay: { label: "Bullet Delay", baseCost: 9, maxLevel: 10 },
  maxHealth: { label: "Max Health", baseCost: 10, maxLevel: 10 },
  healthRegenSpeed: { label: "Health Regen", baseCost: 8, maxLevel: 10 },
  bulletDamage: { label: "Bullet Damage", baseCost: 9, maxLevel: 10 },
  bodyDamage: { label: "Body Damage", baseCost: 8, maxLevel: 10 },
  bulletPenetration: { label: "Bullet Penetration", baseCost: 12, maxLevel: 8 },
};

const pelletVolume = (4 / 3) * Math.PI * Math.pow(PELLET_MIN_RADIUS, 3);
const bulletVolume = (4 / 3) * Math.PI * Math.pow(BULLET_RADIUS, 3);

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Stripe-Signature");
}

function sendJson(res, statusCode, payload = {}) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const rawBody = await readRawBody(req);
  if (!rawBody.length) return {};
  return JSON.parse(rawBody.toString("utf8"));
}

function normalizeMoneyAmount(amount) {
  const normalized = Math.round(Number(amount) * 100) / 100;
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function getPlayerId(value) {
  const id = `${value || ""}`.trim();
  return id || null;
}

function getCheckoutReturnUrl(value) {
  try {
    const url = new URL(value || clientUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return clientUrl;
    }
    return url.origin;
  } catch {
    return clientUrl;
  }
}

function getStoredBalance(playerId) {
  return playerBalances.get(playerId) || 0;
}

function creditPlayerBalance(playerId, amountUsd) {
  const nextBalance = Math.round((getStoredBalance(playerId) + amountUsd) * 100) / 100;
  playerBalances.set(playerId, nextBalance);
  io.emit("balance-updated", { playerId, balance: nextBalance });
  return nextBalance;
}

async function createCheckoutSession(req, res) {
  if (!stripe) {
    sendJson(res, 503, { error: "Stripe is not configured." });
    return;
  }

  const {
    amountUsd,
    playerId,
    paymentMethod = "auto",
    returnUrl,
  } = await readJsonBody(req);
  const normalizedAmount = normalizeMoneyAmount(amountUsd);
  const normalizedPlayerId = getPlayerId(playerId);
  if (!normalizedAmount || !normalizedPlayerId) {
    sendJson(res, 400, { error: "amountUsd and playerId are required." });
    return;
  }

  const checkoutReturnUrl = getCheckoutReturnUrl(returnUrl);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${checkoutReturnUrl}?payment=success`,
    cancel_url: `${checkoutReturnUrl}?payment=cancelled`,
    payment_method_types: paymentMethod === "card" ? ["card"] : undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(normalizedAmount * 100),
          product_data: {
            name: "Agar3D USD balance",
            description: "Funds usable as in-game mass.",
          },
        },
      },
    ],
    metadata: {
      playerId: normalizedPlayerId,
      amountUsd: `${normalizedAmount}`,
    },
  });

  sendJson(res, 200, { url: session.url });
}

async function handleStripeWebhook(req, res) {
  if (!stripe || !stripeWebhookSecret) {
    sendJson(res, 503, { error: "Stripe webhook is not configured." });
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (error) {
    sendJson(res, 400, { error: `Webhook signature failed: ${error.message}` });
    return;
  }

  if (processedStripeEvents.has(event.id)) {
    sendJson(res, 200, { received: true, duplicate: true });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid") {
      const playerId = getPlayerId(session.metadata?.playerId);
      const amountUsd = normalizeMoneyAmount(session.metadata?.amountUsd);
      if (playerId && amountUsd) {
        creditPlayerBalance(playerId, amountUsd);
      }
    }
  }

  processedStripeEvents.add(event.id);
  sendJson(res, 200, { received: true });
}

function sendPlayerBalance(req, res) {
  const url = new URL(req.url, "http://localhost");
  const playerId = getPlayerId(url.searchParams.get("playerId"));
  if (!playerId) {
    sendJson(res, 400, { error: "playerId is required." });
    return;
  }
  sendJson(res, 200, { playerId, balance: getStoredBalance(playerId) });
}

function radiusToMass(radius) {
  return volumeFromRadius(radius) / pelletVolume;
}

function massToRadius(mass) {
  const volume = mass * pelletVolume;
  return Math.cbrt((3 * volume) / (4 * Math.PI));
}

const PLAYER_BASE_RADIUS = massToRadius(STARTING_MASS_USD);

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

function randomClusterOffset(radius) {
  const distance = Math.pow(Math.random(), 1.8) * radius;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  return {
    x: distance * Math.sin(phi) * Math.cos(theta),
    y: distance * Math.sin(phi) * Math.sin(theta),
    z: distance * Math.cos(phi),
  };
}

const pelletClusterCenters = Array.from({ length: PELLET_CLUSTER_COUNT }, () =>
  randomPosition(PELLET_CLUSTER_RADIUS)
);

function randomPelletPosition(radius = PELLET_MIN_RADIUS) {
  if (Math.random() > PELLET_CLUSTER_CHANCE) {
    return randomPosition(radius);
  }

  const center =
    pelletClusterCenters[Math.floor(Math.random() * pelletClusterCenters.length)];
  const offset = randomClusterOffset(PELLET_CLUSTER_RADIUS);
  return clampPosition(
    {
      x: center.x + offset.x,
      y: center.y + offset.y,
      z: center.z + offset.z,
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
  return PLAYER_MAX_HP + getUpgradeLevel(player, "maxHealth") * 150;
}

function getHealthRegen(player) {
  return BASE_HEALTH_REGEN_PER_SECOND + getUpgradeLevel(player, "healthRegenSpeed") * 1.4;
}

function getBulletDamage(player) {
  return BULLET_DAMAGE + getUpgradeLevel(player, "bulletDamage") * 0.035;
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
  const mass = typeof player === "number" ? player : player.mass;
  const slowFactor = 1 + SPEED_FALLOFF * Math.cbrt(mass);
  const upgradeMultiplier =
    typeof player === "number" ? 1 : 1 + getUpgradeLevel(player, "playerSpeed") * 0.08;
  return (BASE_SPEED / slowFactor) * upgradeMultiplier;
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
    mass: Math.floor(player.mass),
    hp: player.hp,
    maxHp: getPlayerMaxHp(player),
    upgrades,
  };
}

function emitUpgradeState(player) {
  if (player.isBot) return;
  io.to(player.id).emit("upgrade-state", buildUpgradePayload(player));
}

function createPlayerState({ id, name, isBot = false, position = null }) {
  const mass = STARTING_MASS_USD;
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
    activeLaser: null,
    input: {
      forward: false,
      movement: {},
      rotation: { yaw: 0, pitch: 0 },
      aim: null,
      shoot: false,
      weaponMode: "bullet",
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
  const aimDirection = parseVector(player.input.aim?.direction);

  if (!aimDirection) {
    return {
      origin: player.position,
      direction: fallbackDirection,
    };
  }

  normalizeVector(aimDirection);
  if (Math.hypot(aimDirection.x, aimDirection.y, aimDirection.z) <= 0) {
    return {
      origin: player.position,
      direction: fallbackDirection,
    };
  }

  return {
    origin: player.position,
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
  const now = Date.now();
  if (player.nextShootAt && player.nextShootAt > now) return;
  player.nextShootAt = now + getBulletCooldown(player);

  const { origin, direction } = getAimRay(player);
  const id = String(nextBulletId++);
  const bulletSpeed = getBulletSpeed(player);
  const penetration = getBulletPenetration(player);

  bullets.set(id, {
    id,
    ownerId: player.id,
    ownerIsBot: Boolean(player.isBot),
    damage: getBulletDamage(player),
    penetrationLeft: penetration,
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

function applyLaserPlayerHit(owner, origin, direction, damage) {
  const hits = [];
  players.forEach((target) => {
    if (target.id === owner.id) return;
    const distance = raySphereIntersectionDistance(
      origin,
      direction,
      target.position,
      target.radius + LASER_RADIUS
    );
    if (distance === null || distance > LASER_RANGE) return;
    hits.push({ target, distance });
  });

  hits.sort((a, b) => a.distance - b.distance);
  const hit = hits.find(({ target }) => players.has(target.id));
  if (!hit) return false;

  hit.target.hp = Math.max(0, hit.target.hp - damage * 125);
  if (hit.target.hp <= 0) {
    io.to(owner.id).emit("shot-confirmed", { target: "player" });
    defeatPlayer(hit.target, "player");
  }
  return true;
}

function applyLaserPelletHit(owner, origin, end, damage) {
  const nearbyPellets = queryPelletsAlongSegment(origin, end, LASER_RADIUS);
  const direction = directionBetween(origin, end);
  let nearest = null;

  for (const pellet of nearbyPellets) {
    if (!pellet.active) continue;
    if (!segmentSphereIntersects(origin, end, pellet.position, pellet.size + LASER_RADIUS)) {
      continue;
    }
    const distance = raySphereIntersectionDistance(
      origin,
      direction,
      pellet.position,
      pellet.size + LASER_RADIUS
    );
    if (distance === null || distance > LASER_RANGE) continue;
    if (!nearest || distance < nearest.distance) nearest = { pellet, distance };
  }

  if (!nearest) return false;
  applyBulletPelletHit({ ownerId: owner.id, damage }, nearest.pellet);
  return true;
}

function updatePlayerLaser(player, delta) {
  player.activeLaser = null;
  if (player.input.weaponMode !== "laser" || !player.input.shoot) return;

  const { origin, direction } = getAimRay(player);
  const end = getRayEnd(origin, direction);
  const damagePerSecond =
    (getBulletDamage(player) * 1000) / Math.max(1, getBulletCooldown(player));
  const frameDamage = damagePerSecond * delta;

  applyLaserPlayerHit(player, origin, direction, frameDamage);
  applyLaserPelletHit(player, origin, end, frameDamage);

  player.activeLaser = { origin, end };
}

function eatPellet(player, pellet) {
  removePelletFromGrid(pellet);
  pellet.active = false;
  pelletState.active[pellet.index] = false;
  const gainedMass = Math.pow(pellet.size / PELLET_MIN_RADIUS, 3);
  player.mass += gainedMass;
  player.radius = massToRadius(player.mass);
  player.speed = getPlayerSpeed(player);
  io.emit("pellet-eaten", { index: pellet.index });
  emitUpgradeState(player);
  if (pellet.isPowerUp) {
    player.magnetUntil = Date.now() + MAGNET_DURATION_MS;
    io.to(player.id).emit("powerup-activated", {
      durationMs: MAGNET_DURATION_MS,
    });
  }
  setTimeout(() => respawnPellet(pellet), pellet.isPowerUp ? 5000 : 2500);
}

function contactConsumePellet(player, pellet) {
  removePelletFromGrid(pellet);
  pellet.active = false;
  pelletState.active[pellet.index] = false;
  io.emit("pellet-eaten", { index: pellet.index });

  if (pellet.isPowerUp) {
    player.magnetUntil = Date.now() + MAGNET_DURATION_MS;
    io.to(player.id).emit("powerup-activated", {
      durationMs: MAGNET_DURATION_MS,
    });
  }

  setTimeout(() => respawnPellet(pellet), pellet.isPowerUp ? 5000 : 2500);
}

function defeatPlayer(player, reason = "defeated") {
  if (!players.has(player.id)) return;
  removePlayer(player.id);
  io.to(player.id).emit("player-died", { reason });
}

function applyBulletPlayerHit(bullet, target) {
  target.hp = Math.max(0, target.hp - bullet.damage * 125);
  if (target.hp <= 0) {
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
      owner.mass += pellet.maxHp / pelletVolume;
      owner.radius = massToRadius(owner.mass);
      owner.speed = getPlayerSpeed(owner);
      emitUpgradeState(owner);
      if (pellet.isPowerUp) {
        owner.bulletMagnetUntil = Date.now() + MAGNET_DURATION_MS;
        io.to(owner.id).emit("bullet-magnet-activated", {
          durationMs: MAGNET_DURATION_MS,
        });
      }
    }
    removePelletFromGrid(pellet);
    pellet.active = false;
    pelletState.active[pellet.index] = false;
    io.to(bullet.ownerId).emit("shot-confirmed", { target: "pellet" });
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
  bot.input.aim = { direction };
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

  const playerTarget = findNearestHumanPlayer(bot);
  const pelletTarget = findNearestBotPellet(bot);
  let targetPosition = pelletTarget?.position || pickBotWanderTarget(bot, now);

  const hasAim = setBotAim(bot, targetPosition);
  bot.input.movement = { forward: true };

  if (pelletTarget) {
    const pelletDistanceSq = distanceSq(bot.position, pelletTarget.position);
    const standoffDistance = BOT_PELLET_STANDOFF_DISTANCE + bot.radius + pelletTarget.size;
    if (pelletDistanceSq < standoffDistance * standoffDistance) {
      const awayDirection = directionBetween(pelletTarget.position, bot.position);
      if (Math.hypot(awayDirection.x, awayDirection.y, awayDirection.z) > 0) {
        targetPosition = {
          x: bot.position.x + awayDirection.x,
          y: bot.position.y + awayDirection.y,
          z: bot.position.z + awayDirection.z,
        };
        bot.input.rotation = directionToRotation(awayDirection);
      } else {
        bot.input.movement = {};
      }
    }
  }

  if (hasAim && (playerTarget || pelletTarget)) {
    if (playerTarget && setBotAim(bot, playerTarget.position)) {
      setBotEvasiveMovement(bot, playerTarget, findIncomingBulletThreat(bot), now);
      shootBullet(bot);
    } else {
      shootBullet(bot);
    }
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
      const hitDistance = player.radius + bullet.radius;

      if (
        segmentSphereIntersects(
          previousPosition,
          bullet.position,
          player.position,
          hitDistance
        )
      ) {
        applyBulletPlayerHit(bullet, player);
        removeBullet(id, "player-hit");
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

      const hitDistance = pellet.size + bullet.radius + (bullet.magnetRadius || 0);

      if (
        segmentSphereIntersects(
          previousPosition,
          bullet.position,
          pellet.position,
          hitDistance
        )
      ) {
        applyBulletPelletHit(bullet, pellet);
        if (bullet.ownerIsBot) {
          bullet.penetrationLeft -= 1;
          if (bullet.penetrationLeft <= 0) removeBullet(id, "pellet-hit");
        }
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
    winner.mass += loser.mass * 0.9;
    winner.radius = massToRadius(winner.mass);
    winner.speed = getPlayerSpeed(winner);
    emitUpgradeState(winner);
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
    handlePelletCollisions(player);
    if (!players.has(player.id)) return;
    player.hp = Math.min(getPlayerMaxHp(player), player.hp + getHealthRegen(player) * delta);
  });

  players.forEach((player) => {
    updatePlayerLaser(player, delta);
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
      hp: player.hp,
      maxHp: getPlayerMaxHp(player),
      isBot: Boolean(player.isBot),
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
  const laserPayload = Array.from(players.values())
    .filter((player) => player.activeLaser)
    .map((player) => ({
      id: player.id,
      origin: player.activeLaser.origin,
      end: player.activeLaser.end,
    }));
  io.emit("world-update", { players: payload, bullets: bulletPayload, lasers: laserPayload });
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
    removePlayer(socket.id);
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
    const minimumMass = radiusToMass(PLAYER_BASE_RADIUS);
    if (player.mass - cost < minimumMass) {
      emitUpgradeState(player);
      return;
    }

    player.mass -= cost;
    player.upgrades[key] = level + 1;
    player.radius = massToRadius(player.mass);
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

const port = Number(process.env.PORT) || 3001;
server.listen(port, "0.0.0.0", () => {
  console.log(`Multiplayer server running on port ${port}`);
  console.log("Server is accessible on:");
  console.log(`  - localhost:${port}`);
  console.log(`  - <your-local-ip>:${port}`);
  console.log(
    "\nTo find your local IP, run: ip addr show (Linux) or ipconfig (Windows)"
  );
});
