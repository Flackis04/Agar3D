import { io } from "socket.io-client";
import * as THREE from "three";

function getSocketUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const serverFromUrl = urlParams.get("server");
  if (serverFromUrl) {
    return serverFromUrl;
  }

  return undefined;
}

const socketUrl = getSocketUrl();

// The browser page is served on port 3000, while Socket.IO runs on 3001.
// Reusing window.__socket prevents duplicate sockets during Vite hot reloads.
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

  // Debug logging for connection issues
  socket.on("connect_error", (error) => {
    console.error("❌ Socket.IO connection error:", error);
    console.error("   Attempting to connect to:", socketUrl || window.location.origin);
  });

  window.__socket = socket;
} else {
  socket = window.__socket;
}

export { socket };
export const otherPlayers = {};
const bullets = {};
const lasers = {};
const pelletHpBars = {};
const PELLET_SYNC_BATCH_SIZE = 5000;
const LASER_HIT_COLOR = new THREE.Color(0x5c0008);
const LASER_HIT_EMISSIVE = new THREE.Color(0x9c0012);
const REMOTE_PLAYER_FOLLOW_RATE = 45;
const LOCAL_PLAYER_FOLLOW_RATE = 21;
const LASER_TINT_FOLLOW_RATE = 16;

let localScene = null;
let localCamera = null;
let localPlayerCell = null;
let basePlayerRadius = 1;
let localPlayerTarget = null;
let handlersRegistered = false;
let magnetDeactivateTimeout = 0;
let audioManager = null;
let currentPlayerName = null;
let pelletSyncJob = null;
const WORLD_SOUND_DISTANCE = 50;

function getWorldSoundVolume(position) {
  if (!localPlayerCell || !position) return 0;
  const dx = localPlayerCell.position.x - position.x;
  const dy = localPlayerCell.position.y - position.y;
  const dz = localPlayerCell.position.z - position.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= WORLD_SOUND_DISTANCE) return 0;
  const normalized = 1 - distance / WORLD_SOUND_DISTANCE;
  return normalized * normalized;
}

function playWorldSound({ type, position } = {}) {
  if (!audioManager) return;
  const volume = getWorldSoundVolume(position);
  if (volume <= 0.01) return;

  if (type === "laser-hit") {
    audioManager.playLaserHitSound(volume);
  } else {
    const pitch = type === "player-hit" ? 0.9 : 1.05;
    audioManager.playEatSoundSegment(Math.min(0.8, volume), pitch);
  }
}

function joinCurrentPlayer() {
  if (!currentPlayerName || !socket.connected) return;
  socket.emit("join", { name: currentPlayerName });
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

socket.on("connect", joinCurrentPlayer);

socket.on("player-died", () => {
  currentPlayerName = null;
  localPlayerTarget = null;
});

function createOtherPlayerSphere(player) {
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: player.isBot ? 0x999999 : 0x00aaff,
    emissive: player.isBot ? 0x242424 : 0x002244,
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

function createPlayerTarget(playerState) {
  return {
    position: new THREE.Vector3(playerState.x, playerState.y, playerState.z),
    radius: playerState.radius || 1,
    mass: playerState.mass ?? 0,
    hp: playerState.hp ?? 100,
    maxHp: playerState.maxHp ?? 100,
    viewDistance: playerState.viewDistance ?? 30,
    isInCombat: Boolean(playerState.isInCombat),
    isBeingLasered: Boolean(playerState.isBeingLasered),
  };
}

function updatePlayerTarget(target, playerState) {
  target.position.set(playerState.x, playerState.y, playerState.z);
  target.radius = playerState.radius || target.radius || 1;
  target.mass = playerState.mass ?? target.mass ?? 0;
  target.hp = playerState.hp ?? target.hp ?? 100;
  target.maxHp = playerState.maxHp ?? target.maxHp ?? 100;
  target.viewDistance = playerState.viewDistance ?? target.viewDistance ?? 30;
  target.isInCombat = Boolean(playerState.isInCombat);
  target.isBeingLasered = Boolean(playerState.isBeingLasered);
}

function updateLaserHitTint(mesh, isBeingLasered, smoothing) {
  if (!mesh?.material?.color) return;
  if (!mesh.userData.baseLaserColor) {
    mesh.userData.baseLaserColor = mesh.material.color.clone();
    mesh.userData.laserHitColor = mesh.material.color
      .clone()
      .lerp(LASER_HIT_COLOR, 0.82);
    mesh.userData.baseLaserEmissive = mesh.material.emissive?.clone();
    mesh.userData.laserHitEmissive = mesh.material.emissive
      ?.clone()
      .lerp(LASER_HIT_EMISSIVE, 0.9);
  }

  const targetColor = isBeingLasered
    ? mesh.userData.laserHitColor
    : mesh.userData.baseLaserColor;
  mesh.material.color.lerp(targetColor, smoothing);

  if (mesh.material.emissive && mesh.userData.baseLaserEmissive) {
    const targetEmissive = isBeingLasered
      ? mesh.userData.laserHitEmissive
      : mesh.userData.baseLaserEmissive;
    mesh.material.emissive.lerp(targetEmissive, smoothing);
  }
}

function applyStateToMeshImmediately(mesh, playerState) {
  mesh.position.set(playerState.x, playerState.y, playerState.z);
  const baseRadius = mesh.geometry.parameters.radius || 1;
  mesh.scale.setScalar((playerState.radius || 1) / baseRadius);
}

function createHpBar() {
  const group = new THREE.Group();
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.16),
    new THREE.MeshBasicMaterial({
      color: 0x220011,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
    })
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.34, 0.1),
    new THREE.MeshBasicMaterial({
      color: 0x33ff77,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    })
  );

  background.renderOrder = 20;
  fill.renderOrder = 21;
  fill.position.z = 0.01;
  group.add(background);
  group.add(fill);
  group.userData.fill = fill;
  return group;
}

function updateHpBar(bar, position, radius, hp = 100, maxHp = 100) {
  if (!bar || !position) return;
  const safeMaxHp = Math.max(Number.EPSILON, maxHp);
  const ratio = Math.max(0, Math.min(1, hp / safeMaxHp));
  const width = 1.34 * ratio;
  const fill = bar.userData.fill;

  bar.position.copy(position);
  bar.position.y += radius + Math.max(0.75, radius * 0.45);
  const scale = Math.max(1, radius * 0.9);
  bar.scale.setScalar(scale);

  if (fill) {
    fill.scale.x = ratio;
    fill.position.x = -(1.34 - width) / 2;
    fill.material.color.setHex(ratio > 0.45 ? 0x33ff77 : ratio > 0.2 ? 0xffcc33 : 0xff3333);
  }

  if (localCamera) {
    bar.quaternion.copy(localCamera.quaternion);
  }
}

function setBarOpacity(bar, opacity) {
  if (!bar) return;
  bar.traverse((child) => {
    if (child.material) {
      child.material.opacity =
        (child.userData.baseOpacity ?? child.material.opacity ?? 1) * opacity;
    }
  });
}

function upsertOtherPlayer(playerState) {
  if (playerState.id === socket.id) return;
  if (!otherPlayers[playerState.id]) {
    const mesh = createOtherPlayerSphere(playerState);
    const hpBar = createHpBar();
    if (localScene) {
      localScene.add(mesh);
      localScene.add(hpBar);
    }
    otherPlayers[playerState.id] = {
      mesh,
      hpBar,
      name: playerState.name,
      target: createPlayerTarget(playerState),
    };
    applyStateToMeshImmediately(mesh, playerState);
  } else {
    const entry = otherPlayers[playerState.id];
    if (localScene) {
      if (entry.mesh && !localScene.children.includes(entry.mesh)) {
        localScene.add(entry.mesh);
      }
      if (entry.hpBar && !localScene.children.includes(entry.hpBar)) {
        localScene.add(entry.hpBar);
      }
    }
    updatePlayerTarget(otherPlayers[playerState.id].target, playerState);
  }
  otherPlayers[playerState.id].lastSeen = performance.now();
  otherPlayers[playerState.id].name = playerState.name;
}

function cleanupMissingPlayers(seenIds) {
  Object.keys(otherPlayers).forEach((id) => {
    if (!seenIds.has(id)) {
      removeOtherPlayer(id);
    }
  });
}

function removeOtherPlayer(id) {
  const entry = otherPlayers[id];
  if (!entry) return;
  if (entry.mesh && localScene) {
    localScene.remove(entry.mesh);
    entry.mesh.geometry?.dispose?.();
    entry.mesh.material?.dispose?.();
  }
  if (entry.hpBar && localScene) {
    localScene.remove(entry.hpBar);
    disposeGroup(entry.hpBar);
  }
  delete otherPlayers[id];
}

function clearRemotePlayers() {
  Object.keys(otherPlayers).forEach(removeOtherPlayer);
}

function createBulletMesh(bullet) {
  const visualRadius = Math.max(0.035, (bullet.radius || 0.12) * 0.45);
  const geometry = new THREE.SphereGeometry(visualRadius, 8, 8);
  const material = new THREE.MeshStandardMaterial({
    color: 0x9fffe2,
    emissive: 0x052a22,
    emissiveIntensity: 0.18,
    metalness: 0.05,
    roughness: 0.55,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(bullet.x, bullet.y, bullet.z);

  if (bullet.magnetRadius > 0) {
    const magnetSphere = new THREE.Mesh(
      new THREE.SphereGeometry(bullet.magnetRadius, 24, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff3333,
        transparent: true,
        opacity: 0.16,
        wireframe: true,
      })
    );
    magnetSphere.userData.isBulletMagnetSphere = true;
    mesh.add(magnetSphere);
  }

  return mesh;
}

function updateBulletMagnetSphere(mesh, magnetRadius = 0) {
  let magnetSphere = mesh.children.find(
    (child) => child.userData.isBulletMagnetSphere
  );

  if (magnetRadius > 0 && !magnetSphere) {
    magnetSphere = new THREE.Mesh(
      new THREE.SphereGeometry(magnetRadius, 24, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff3333,
        transparent: true,
        opacity: 0.16,
        wireframe: true,
      })
    );
    magnetSphere.userData.isBulletMagnetSphere = true;
    mesh.add(magnetSphere);
  }

  if (!magnetSphere) return;
  magnetSphere.visible = magnetRadius > 0;
  if (magnetRadius > 0) {
    const baseRadius = magnetSphere.geometry.parameters.radius || magnetRadius;
    magnetSphere.scale.setScalar(magnetRadius / baseRadius);
  }
}

function updateBullets(bulletStates = []) {
  if (!localScene) return;
  const seen = new Set();

  bulletStates.forEach((bullet) => {
    seen.add(bullet.id);
    if (!bullets[bullet.id]) {
      const mesh = createBulletMesh(bullet);
      localScene.add(mesh);
      bullets[bullet.id] = {
        mesh,
        velocity: new THREE.Vector3(bullet.vx || 0, bullet.vy || 0, bullet.vz || 0),
      };
    }

    const entry = bullets[bullet.id];
    entry.velocity.set(bullet.vx || 0, bullet.vy || 0, bullet.vz || 0);
    entry.mesh.position.set(bullet.x, bullet.y, bullet.z);
    updateBulletMagnetSphere(entry.mesh, bullet.magnetRadius || 0);
  });

  Object.keys(bullets).forEach((id) => {
    if (seen.has(id)) return;
    const entry = bullets[id];
    if (entry.mesh) {
      localScene.remove(entry.mesh);
      disposeGroup(entry.mesh);
    }
    delete bullets[id];
  });
}

const laserStart = new THREE.Vector3();
const laserEnd = new THREE.Vector3();
const laserDirection = new THREE.Vector3();
const laserMidpoint = new THREE.Vector3();
const laserUp = new THREE.Vector3(0, 1, 0);
const LASER_LIGHT_COUNT = 6;

function updateLaserMesh(mesh, laser) {
  laserStart.set(laser.origin.x, laser.origin.y, laser.origin.z);
  laserEnd.set(laser.end.x, laser.end.y, laser.end.z);
  laserDirection.subVectors(laserEnd, laserStart);

  const length = laserDirection.length();
  mesh.visible = length > 0.001;
  if (!mesh.visible) return;

  laserMidpoint.addVectors(laserStart, laserEnd).multiplyScalar(0.5);
  mesh.position.copy(laserMidpoint);
  mesh.quaternion.setFromUnitVectors(laserUp, laserDirection.normalize());
  const thickness = Math.max(1, laser.thickness || 1);
  mesh.userData.core.scale.set(thickness, length, thickness);
  mesh.userData.glow.scale.set(thickness, length, thickness);

  mesh.userData.lights.forEach((light, index) => {
    const progress = (index + 0.5) / LASER_LIGHT_COUNT;
    light.position.y = (progress - 0.5) * length;
    light.distance = Math.min(20, Math.max(12, length / LASER_LIGHT_COUNT + 4));
  });
}

function updateLaserFromRenderedShooter(id, entry) {
  const laser = entry.state;
  if (!laser?.origin || !laser?.end) return;

  laserStart.set(laser.origin.x, laser.origin.y, laser.origin.z);
  laserEnd.set(laser.end.x, laser.end.y, laser.end.z);
  laserDirection.subVectors(laserEnd, laserStart);
  const length = laserDirection.length();
  const shooterPosition = otherPlayers[id]?.mesh?.position;
  const origin = shooterPosition || laserStart;

  entry.visualLaser.origin.x = origin.x;
  entry.visualLaser.origin.y = origin.y;
  entry.visualLaser.origin.z = origin.z;
  if (length > 0.001) {
    laserDirection.multiplyScalar(1 / length);
    entry.visualLaser.end.x = origin.x + laserDirection.x * length;
    entry.visualLaser.end.y = origin.y + laserDirection.y * length;
    entry.visualLaser.end.z = origin.z + laserDirection.z * length;
  } else {
    entry.visualLaser.end.x = origin.x;
    entry.visualLaser.end.y = origin.y;
    entry.visualLaser.end.z = origin.z;
  }
  entry.visualLaser.thickness = laser.thickness;
  updateLaserMesh(entry.mesh, entry.visualLaser);
}

function createLaserMesh(laser) {
  const group = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.065, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xc8f8ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  core.renderOrder = 11;
  core.frustumCulled = false;

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x28cfff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.renderOrder = 10;
  glow.frustumCulled = false;

  const lights = Array.from({ length: LASER_LIGHT_COUNT }, () => (
    new THREE.PointLight(0x35dfff, 2.5, 18, 2)
  ));

  group.add(glow, core, ...lights);
  group.userData.core = core;
  group.userData.glow = glow;
  group.userData.lights = lights;
  updateLaserMesh(group, laser);
  return group;
}

function updateLasers(laserStates = []) {
  if (!localScene) return;
  const seen = new Set();

  laserStates.forEach((laser) => {
    if (!laser?.id || !laser.origin || !laser.end) return;
    if (laser.id === socket.id) return;

    seen.add(laser.id);
    if (!lasers[laser.id]) {
      const mesh = createLaserMesh(laser);
      localScene.add(mesh);
      lasers[laser.id] = {
        mesh,
        state: laser,
        visualLaser: {
          origin: { x: 0, y: 0, z: 0 },
          end: { x: 0, y: 0, z: 0 },
          thickness: laser.thickness,
        },
      };
    } else {
      lasers[laser.id].state = laser;
    }

    updateLaserFromRenderedShooter(laser.id, lasers[laser.id]);
  });

  Object.keys(lasers).forEach((id) => {
    if (seen.has(id)) return;
    const entry = lasers[id];
    if (entry.mesh) {
      localScene.remove(entry.mesh);
      disposeGroup(entry.mesh);
    }
    delete lasers[id];
  });
}

function removeBullet(id) {
  const entry = bullets[id];
  if (!entry) return;
  if (entry.mesh && localScene) {
    localScene.remove(entry.mesh);
    disposeGroup(entry.mesh);
  }
  delete bullets[id];
}

function disposeGroup(group) {
  group.traverse((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
}

function removePelletHpBar(index) {
  const entry = pelletHpBars[index];
  if (!entry) return;
  if (localScene) localScene.remove(entry.bar);
  disposeGroup(entry.bar);
  delete pelletHpBars[index];
}

function showPelletHpBar(index, hp, maxHp) {
  if (!localScene || !pelletDataRef?.active[index] || !pelletDataRef?.positions[index]) return;
  const now = performance.now();
  const startingHp = maxHp || hp || 1;

  if (!pelletHpBars[index]) {
    const bar = createHpBar();
    bar.traverse((child) => {
      if (child.material) child.userData.baseOpacity = child.material.opacity;
    });
    localScene.add(bar);
    pelletHpBars[index] = {
      bar,
      hideAt: now + 1800,
      hp: startingHp,
      pendingHp: hp,
      maxHp: startingHp,
      revealUntil: now + 140,
    };
    updateHpBar(bar, pelletDataRef.positions[index], pelletDataRef.sizes[index] || 0.3, startingHp, startingHp);
    setBarOpacity(bar, 1);
    return;
  }

  const entry = pelletHpBars[index];
  entry.hp = hp;
  entry.pendingHp = hp;
  entry.maxHp = maxHp || entry.maxHp || startingHp;
  entry.hideAt = now + 1800;
  updateHpBar(
    entry.bar,
    pelletDataRef.positions[index],
    pelletDataRef.sizes[index] || 0.3,
    hp,
    maxHp
  );
  setBarOpacity(entry.bar, 1);
}

function updateLocalPlayer(playerState) {
  if (!localPlayerCell) return;
  if (!localPlayerTarget) {
    localPlayerTarget = createPlayerTarget(playerState);
    localPlayerCell.position.copy(localPlayerTarget.position);
    localPlayerCell.scale.setScalar(localPlayerTarget.radius / basePlayerRadius);
  } else {
    updatePlayerTarget(localPlayerTarget, playerState);
  }
  localPlayerCell.userData.viewDistance = localPlayerTarget.viewDistance;
  localPlayerCell.userData.currencyMass = localPlayerTarget.mass;
  window.dispatchEvent(
    new CustomEvent("local-player-state", {
      detail: {
        hp: localPlayerTarget.hp,
        maxHp: localPlayerTarget.maxHp,
        mass: localPlayerTarget.mass,
        isInCombat: localPlayerTarget.isInCombat,
      },
    })
  );
}

export function initNetworking(scene, playerCell, audioMgr = null, camera = null) {
  localScene = scene;
  localCamera = camera;
  localPlayerCell = playerCell;
  audioManager = audioMgr;
  basePlayerRadius = playerCell.geometry.parameters.radius;
  localPlayerTarget = null;
  clearRemotePlayers();
  Object.keys(lasers).forEach((id) => {
    if (lasers[id].mesh && localScene) {
      localScene.remove(lasers[id].mesh);
      disposeGroup(lasers[id].mesh);
    }
    delete lasers[id];
  });
  Object.keys(pelletHpBars).forEach(removePelletHpBar);

  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  socket.on("world-update", ({
    players,
    bullets: bulletStates = [],
    lasers: laserStates = [],
    movedPellets = [],
    isBeingLasered = false,
  }) => {
    // The server sends every player's latest position and size.
    // This client applies its own state locally and creates/updates meshes
    // for everyone else.
    window.dispatchEvent(
      new CustomEvent("local-laser-hit-state", {
        detail: { active: isBeingLasered },
      })
    );
    updateBullets(bulletStates);
    updateLasers(laserStates);
    updateMovedPellets(movedPellets);
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

  socket.on("bullet-removed", ({ id } = {}) => {
    if (!id) return;
    removeBullet(id);
  });

  socket.on("player-joined", (player) => {
    if (!localScene || player.id === socket.id) return;
    upsertOtherPlayer(player);
  });

  socket.on("player-left", (id) => {
    if (otherPlayers[id]) {
      removeOtherPlayer(id);
      console.log("Player left:", id);
    }
  });

  socket.on("powerup-activated", ({ durationMs = 8000 } = {}) => {
    if (!localPlayerCell) return;
    localPlayerCell.pelletMagnetToggle = true;
    window.clearTimeout(magnetDeactivateTimeout);
    magnetDeactivateTimeout = window.setTimeout(() => {
      if (localPlayerCell) {
        localPlayerCell.pelletMagnetToggle = false;
      }
    }, durationMs);
  });

  socket.on("bullet-magnet-activated", () => {
    if (localPlayerCell) {
      localPlayerCell.pelletMagnetToggle = false;
    }
    window.clearTimeout(magnetDeactivateTimeout);
  });

  socket.on("world-sound", playWorldSound);
}

export function sendPlayerInput({ forward, movement, rotation, shoot, aim, weaponMode }) {
  // Input is intentionally small. The server receives this and decides how far
  // the player actually moves during its next tick.
  socket.emit("player-input", {
    forward,
    movement,
    rotation,
    shoot,
    aim,
    weaponMode: weaponMode || "bullet",
  });
}

export function applyNetworkSmoothing(deltaTime = 1 / 60) {
  const smoothing = 1 - Math.exp(-REMOTE_PLAYER_FOLLOW_RATE * deltaTime);
  const localSmoothing = 1 - Math.exp(-LOCAL_PLAYER_FOLLOW_RATE * deltaTime);
  const laserTintSmoothing =
    1 - Math.exp(-LASER_TINT_FOLLOW_RATE * deltaTime);

  if (localPlayerCell && localPlayerTarget) {
    localPlayerCell.position.lerp(localPlayerTarget.position, localSmoothing);
    const targetScale = localPlayerTarget.radius / basePlayerRadius;
    localPlayerCell.scale.setScalar(
      THREE.MathUtils.lerp(localPlayerCell.scale.x, targetScale, localSmoothing)
    );
    updateLaserHitTint(
      localPlayerCell,
      localPlayerTarget.isBeingLasered,
      laserTintSmoothing
    );
    updatePositionDisplay(localPlayerCell);
  }

  for (const id in otherPlayers) {
    const otherPlayer = otherPlayers[id];
    if (!otherPlayer.mesh || !otherPlayer.target) continue;
    otherPlayer.mesh.position.lerp(otherPlayer.target.position, smoothing);
    const baseRadius = otherPlayer.mesh.geometry.parameters.radius || 1;
    const targetScale = otherPlayer.target.radius / baseRadius;
    otherPlayer.mesh.scale.setScalar(
      THREE.MathUtils.lerp(otherPlayer.mesh.scale.x, targetScale, smoothing)
    );
    updateLaserHitTint(
      otherPlayer.mesh,
      otherPlayer.target.isBeingLasered,
      laserTintSmoothing
    );
    updateHpBar(
      otherPlayer.hpBar,
      otherPlayer.mesh.position,
      otherPlayer.target.radius,
      otherPlayer.target.hp,
      otherPlayer.target.maxHp
    );
  }

  // Remote player meshes are interpolated, so anchor their beams after that
  // interpolation. This keeps the laser attached even at low frame rates.
  for (const id in lasers) {
    updateLaserFromRenderedShooter(id, lasers[id]);
  }

  for (const id in bullets) {
    const bullet = bullets[id];
    if (!bullet.mesh || !bullet.velocity) continue;
    bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);
  }

  const now = performance.now();
  for (const index in pelletHpBars) {
    const entry = pelletHpBars[index];
    if (!pelletDataRef?.active[index]) {
      removePelletHpBar(index);
      continue;
    }

    const opacity = Math.min(1, Math.max(0, (entry.hideAt - now) / 500));
    const displayHp =
      entry.revealUntil && now < entry.revealUntil
        ? entry.maxHp
        : entry.pendingHp ?? entry.hp;
    updateHpBar(
      entry.bar,
      pelletDataRef.positions[index],
      pelletDataRef.sizes[index] || 0.3,
      displayHp,
      entry.maxHp
    );
    setBarOpacity(entry.bar, opacity);
    if (opacity <= 0) removePelletHpBar(index);
  }
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
  currentPlayerName = playerName;
  joinCurrentPlayer();
}

let pelletDataRef = null;
let pelletHandlersRegistered = false;

function updatePelletInstance(index) {
  if (!pelletDataRef) return;
  const tier = Math.trunc(
    Math.max(
      0,
      Math.min(
        pelletDataRef.meshes.length - 1,
        Number(pelletDataRef.tiers[index]) || 0
      )
    )
  );
  const isPowerUp = pelletDataRef.powerUps[index];
  const mesh = isPowerUp
    ? pelletDataRef.powerupMeshes[tier]
    : pelletDataRef.meshes[tier];
  if (!mesh) return;
  const dummy = pelletDataRef.dummy;

  const previousTier = pelletDataRef.renderedTiers[index];
  const previousPowerUp = pelletDataRef.renderedPowerUps[index];
  // A respawn may change tier, so remove the old instance before showing the
  // same pellet index in its new tier mesh.
  if (
    previousTier !== undefined &&
    (previousTier !== tier || previousPowerUp !== isPowerUp)
  ) {
    const previousMesh = previousPowerUp
      ? pelletDataRef.powerupMeshes[previousTier]
      : pelletDataRef.meshes[previousTier];
    dummy.position.set(0, 0, 0);
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    previousMesh.setMatrixAt(index, dummy.matrix);
    previousMesh.instanceMatrix.needsUpdate = true;
  }

  if (pelletDataRef.active[index]) {
    dummy.position.copy(pelletDataRef.positions[index]);
    dummy.scale.setScalar(pelletDataRef.sizes[index]);
  } else {
    dummy.position.set(0, 0, 0);
    dummy.scale.setScalar(0.0001);
  }
  dummy.rotation.set(
    (index * 0.37) % Math.PI,
    (index * 0.61) % Math.PI,
    (index * 0.83) % Math.PI
  );
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
  mesh.instanceMatrix.needsUpdate = true;
  pelletDataRef.renderedTiers[index] = tier;
  pelletDataRef.renderedPowerUps[index] = isPowerUp;
}

function updateMovedPellets(movedPellets) {
  if (!pelletDataRef || !Array.isArray(movedPellets)) return;

  for (const moved of movedPellets) {
    const index = moved?.index;
    const position = moved?.position;
    const current = pelletDataRef.positions[index];
    if (!Number.isInteger(index) || !current || !position) continue;

    const oldX = current.x;
    const oldY = current.y;
    const oldZ = current.z;
    current.set(position.x, position.y, position.z);
    pelletDataRef.spatialGrid?.updateItem(
      index,
      oldX,
      oldY,
      oldZ,
      current.x,
      current.y,
      current.z
    );
    updatePelletInstance(index);
  }
}

function applyPelletStateIndex(state, index) {
  pelletDataRef.active[index] = state.active[index];
  if (state.powerUps) {
    pelletDataRef.powerUps[index] = state.powerUps[index];
  }
  if (state.tiers) {
    pelletDataRef.tiers[index] = state.tiers[index];
  }
  if (state.sizes) {
    pelletDataRef.sizes[index] = state.sizes[index];
  }
  if (state.hp) {
    pelletDataRef.hp[index] = state.hp[index] ?? state.maxHp?.[index] ?? 1;
  }
  if (state.maxHp) {
    pelletDataRef.maxHp[index] = state.maxHp[index] ?? pelletDataRef.hp[index] ?? 1;
  }
  pelletDataRef.positions[index].set(
    state.positions[index].x,
    state.positions[index].y,
    state.positions[index].z
  );
  updatePelletInstance(index);
}

function applyPelletStateInBatches(state) {
  if (!pelletDataRef) return;
  if (pelletSyncJob) {
    cancelAnimationFrame(pelletSyncJob.frameId);
    pelletSyncJob = null;
  }

  const count = Math.min(state.active.length, pelletDataRef.active.length);
  pelletDataRef.mesh.visible = false;
  pelletDataRef.meshPowerup.visible = false;
  pelletDataRef.hp = state.hp
    ? state.hp.map((hp, index) => hp ?? state.maxHp?.[index] ?? 1)
    : new Array(count).fill(1);
  pelletDataRef.maxHp = state.maxHp
    ? state.maxHp.map((maxHp, index) => maxHp ?? pelletDataRef.hp[index] ?? 1)
    : pelletDataRef.hp.slice();

  let index = 0;
  const step = () => {
    if (!pelletDataRef) return;
    const end = Math.min(index + PELLET_SYNC_BATCH_SIZE, count);
    for (; index < end; index++) {
      applyPelletStateIndex(state, index);
    }

    if (index < count) {
      pelletSyncJob = { frameId: requestAnimationFrame(step) };
    } else {
      pelletDataRef.spatialGrid?.buildFromPelletData(pelletDataRef);
      pelletDataRef.mesh.visible = true;
      pelletDataRef.meshPowerup.visible = true;
      pelletSyncJob = null;
    }
  };

  step();
}

function registerPelletHandlers() {
  if (pelletHandlersRegistered) return;
  pelletHandlersRegistered = true;

  socket.on("pellet-state", (state) => {
    if (!pelletDataRef) return;
    console.log("Received pellet state from server");
    applyPelletStateInBatches(state);
  });

  socket.on("pellet-eaten", (data) => {
    if (!pelletDataRef || typeof data.index !== "number") return;
    pelletDataRef.active[data.index] = false;
    updatePelletInstance(data.index);
    removePelletHpBar(data.index);
    playWorldSound({ type: "pellet-eaten", position: data.position });
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
    if (typeof data.tier === "number") {
      pelletDataRef.tiers[data.index] = data.tier;
    }
    if (typeof data.hp === "number") {
      pelletDataRef.hp ||= [];
      pelletDataRef.maxHp ||= [];
      pelletDataRef.hp[data.index] = data.hp;
      pelletDataRef.maxHp[data.index] = data.maxHp;
    }
    pelletDataRef.active[data.index] = true;
    updatePelletInstance(data.index);
    removePelletHpBar(data.index);
  });

  socket.on("pellet-damaged", (data) => {
    if (!pelletDataRef || typeof data.index !== "number") return;
    if (!pelletDataRef.positions[data.index]) return;
    if (typeof data.size === "number") {
      pelletDataRef.sizes[data.index] = data.size;
    }
    if (typeof data.hp === "number") {
      pelletDataRef.hp ||= [];
      pelletDataRef.maxHp ||= [];
      pelletDataRef.hp[data.index] = data.hp;
      pelletDataRef.maxHp[data.index] = data.maxHp;
    }
    pelletDataRef.active[data.index] = true;
    updatePelletInstance(data.index);
    if (typeof data.hp === "number") {
      showPelletHpBar(data.index, data.hp, data.maxHp);
    }
  });

  socket.on("pellet-depleted", (data) => {
    if (!pelletDataRef || typeof data.index !== "number") return;
    pelletDataRef.active[data.index] = false;
    updatePelletInstance(data.index);
    removePelletHpBar(data.index);
  });
}

export function setupPelletSync(pelletData) {
  pelletDataRef = pelletData;
  registerPelletHandlers();
  socket.emit("request-pellet-state");
}
