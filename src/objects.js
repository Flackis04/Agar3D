import { checkEatCondition, convertMassToRadius } from "./utils/playerUtils.js";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { SpatialGrid } from "./utils/spatialGrid.js";

export const mapSize = 250;
export const pelletMinSize = 0.3;
export const pelletMaxSize = 0.55;
export const startingMassUsd = 20;
const powerUpInterval = 24;
const pelletClusterCount = 96;
const pelletClusterChance = 0.28;
const pelletClusterRadius = 28;

function isPowerUpIndex(index) {
  return index % powerUpInterval === 0;
}

function randomClusterOffset(radius) {
  const distance = Math.pow(Math.random(), 1.8) * radius;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  return new THREE.Vector3(
    distance * Math.sin(phi) * Math.cos(theta),
    distance * Math.sin(phi) * Math.sin(theta),
    distance * Math.cos(phi)
  );
}

function randomMapPosition(radius) {
  const maxPos = mapSize / 2 - radius;
  return new THREE.Vector3(
    (Math.random() - 0.5) * 2 * maxPos,
    (Math.random() - 0.5) * 2 * maxPos,
    (Math.random() - 0.5) * 2 * maxPos
  );
}

function randomPelletPosition(radius, clusterCenters) {
  if (!clusterCenters?.length || Math.random() > pelletClusterChance) {
    return randomMapPosition(radius);
  }

  const center = clusterCenters[Math.floor(Math.random() * clusterCenters.length)];
  const position = center.clone().add(randomClusterOffset(pelletClusterRadius));
  const maxPos = mapSize / 2 - radius;
  position.x = Math.max(-maxPos, Math.min(maxPos, position.x));
  position.y = Math.max(-maxPos, Math.min(maxPos, position.y));
  position.z = Math.max(-maxPos, Math.min(maxPos, position.z));
  return position;
}

export function createPlayerCell(isBot, scene, camera) {
  const playerStartingRadius = isBot
    ? Math.random() * 5.75
    : convertMassToRadius(startingMassUsd, pelletMinSize);
  const playerDefaultOpacity = 0.65;
  const playerCellColor = isBot ? 0xff3333 : 0x00aaff;

  const geometry = new THREE.SphereGeometry(playerStartingRadius, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: playerCellColor,
    emissive: 0x002244,
    emissiveIntensity: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: playerDefaultOpacity,
  });

  const halfMapSize = mapSize / 2;
  const maxSpawnRange = halfMapSize - playerStartingRadius;

  const [x, y, z] = Array(3)
    .fill()
    .map(() => (Math.random() - 0.5) * 2 * maxSpawnRange);

  const cell = new THREE.Mesh(geometry, material);

  cell.position.set(x, y, z);
  cell.userData.isBot = isBot;
  cell.userData.defaultOpacity = playerDefaultOpacity;
  cell.userData.isEaten = false;
  scene.add(cell);

  return { cell, playerDefaultOpacity };
}

export function createMagnetSphere(playerCell, magnetRange) {
  const geometry = new THREE.SphereGeometry(magnetRange, 32, 32);

  const solidMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3333,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
  });

  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6666,
    transparent: true,
    opacity: 0.3,
    wireframe: true,
  });

  const magnetSphere = new THREE.Group();

  const solidMesh = new THREE.Mesh(geometry, solidMaterial);
  const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);

  magnetSphere.add(solidMesh);
  magnetSphere.add(wireframeMesh);
  magnetSphere.visible = false;

  playerCell.magnetSphere = magnetSphere;
  return magnetSphere;
}

export function createMapBox(onReady) {
  const PARTICLE_SIZE = 2;

  const borderSegments = mapSize / 4;
  let boxGeometry = new THREE.BoxGeometry(
    mapSize,
    mapSize,
    mapSize,
    borderSegments,
    borderSegments,
    borderSegments
  );
  boxGeometry.deleteAttribute("normal");
  boxGeometry.deleteAttribute("uv");
  boxGeometry = BufferGeometryUtils.mergeVertices(boxGeometry);

  const positionAttribute = boxGeometry.getAttribute("position");
  const colors = [];
  const sizes = [];

  const borderColor = new THREE.Color(0x66aaff);

  for (let i = 0; i < positionAttribute.count; i++) {
    borderColor.toArray(colors, i * 3);
    sizes[i] = PARTICLE_SIZE * 0.6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positionAttribute.clone());
  geometry.setAttribute(
    "customColor",
    new THREE.Float32BufferAttribute(colors, 3)
  );
  geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

  function createFallbackTexture() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.1,
      size / 2,
      size / 2,
      size * 0.45
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  function buildMaterial(texture) {
    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0xffffff) },
        pointTexture: { value: texture },
        alphaTest: { value: 0.9 },
        fogColor: { value: new THREE.Color(0x080020) },
        fogNear: { value: 0 },
        fogFar: { value: 100 },
      },
      vertexShader: document.getElementById("vertexshader").textContent,
      fragmentShader: document.getElementById("fragmentshader").textContent,
      transparent: false,
      depthWrite: true,
    });
  }

  function finalize(material) {
    material.needsUpdate = true;
    const particles = new THREE.Points(geometry, material);
    onReady(particles, PARTICLE_SIZE);
  }

  const loader = new THREE.TextureLoader();
  loader.load(
    "https://threejs.org/examples/textures/sprites/disc.png",
    (texture) => {
      finalize(buildMaterial(texture));
    },
    undefined,
    () => {
      console.warn("Falling back to canvas texture for border points");
      finalize(buildMaterial(createFallbackTexture()));
    }
  );
}

export function createPelletsInstanced(scene, count, colors) {
  const geometry = new THREE.SphereGeometry(1, 5, 3);
  const materialNormal = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    opacity: 1,
    transparent: false,
  });
  const materialPowerup = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    opacity: 0.25,
    transparent: true,
  });

  const dummy = new THREE.Object3D();
  const positions = [];
  const sizes = [];
  const active = new Array(count).fill(true);
  const powerUps = new Array(count);
  const pelletToMeshIndex = new Array(count);
  const clusterCenters = Array.from({ length: pelletClusterCount }, () =>
    randomMapPosition(pelletClusterRadius)
  );

  let powerupCount = 0;
  let normalCount = 0;
  for (let i = 0; i < count; i++) {
    const isPowerUp = isPowerUpIndex(i);
    powerUps[i] = isPowerUp;
    if (isPowerUp) powerupCount++;
    else normalCount++;
  }

  const meshNormal = new THREE.InstancedMesh(
    geometry,
    materialNormal,
    normalCount
  );
  const meshPowerup = new THREE.InstancedMesh(
    geometry,
    materialPowerup,
    powerupCount
  );

  let normalIdx = 0;
  let powerupIdx = 0;

  for (let i = 0; i < count; i++) {
    const isPowerUp = powerUps[i];
    const color = new THREE.Color(isPowerUp ? 0xff0000 : colors[i % colors.length]);

    const size =
      Math.random() * (pelletMaxSize - pelletMinSize) + pelletMinSize;
    sizes.push(size);

    // Use reusable pelletCell respawn function
    const position = respawnPellet({
      dummy,
      size,
      mapSize,
      color,
      isPowerUp,
      meshNormal,
      meshPowerup,
      normalIdx,
      powerupIdx,
      pelletToMeshIndex,
      clusterCenters,
      i,
      isInitialSpawn: true,
    });
    if (isPowerUp) {
      powerupIdx++;
    } else {
      normalIdx++;
    }
    positions.push(position.clone());
  }

  meshNormal.instanceMatrix.needsUpdate = true;
  if (meshNormal.instanceColor) meshNormal.instanceColor.needsUpdate = true;
  meshPowerup.instanceMatrix.needsUpdate = true;
  if (meshPowerup.instanceColor) meshPowerup.instanceColor.needsUpdate = true;

  meshNormal.frustumCulled = true;
  meshPowerup.frustumCulled = true;

  scene.add(meshNormal);
  scene.add(meshPowerup);

  // Create spatial grid for efficient collision detection
  // Voxel size should be roughly 2x the max interaction radius
  const voxelSize = 20; // Adjust based on typical cell + magnet radius
  const spatialGrid = new SpatialGrid(mapSize, voxelSize);

  // Build initial grid from pelletCell positions
  spatialGrid.buildFromPelletData({ positions, active });

  return {
    mesh: meshNormal,
    meshPowerup,
    positions,
    sizes,
    active,
    radius: geometry.parameters.radius,
    dummy,
    powerUps,
    pelletToMeshIndex,
    spatialGrid,
  };
}

export function createCellSpatialGrid() {
  const voxelSize = 30; // Larger voxel size for player/botCell interactions
  return new SpatialGrid(mapSize, voxelSize);
}

// Reusable pelletCell respawn function
export function respawnPellet({
  dummy,
  size,
  mapSize,
  color,
  isPowerUp,
  meshNormal,
  meshPowerup,
  normalIdx,
  powerupIdx,
  pelletToMeshIndex,
  clusterCenters,
  i,
  isInitialSpawn = false,
}) {
  const pelletRadius = size;
  const position = randomPelletPosition(pelletRadius, clusterCenters);

  const initialScale = isInitialSpawn ? size : 0;

  dummy.position.copy(position);
  dummy.rotation.set(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    Math.random() * Math.PI
  );
  dummy.scale.setScalar(initialScale);
  dummy.updateMatrix();

  if (isPowerUp) {
    meshPowerup.setMatrixAt(powerupIdx, dummy.matrix);
    meshPowerup.setColorAt(powerupIdx, color);
    meshPowerup.instanceMatrix.needsUpdate = true;
    if (meshPowerup.instanceColor) meshPowerup.instanceColor.needsUpdate = true;
    pelletToMeshIndex[i] = powerupIdx;
  } else {
    meshNormal.setMatrixAt(normalIdx, dummy.matrix);
    meshNormal.setColorAt(normalIdx, color);
    meshNormal.instanceMatrix.needsUpdate = true;
    if (meshNormal.instanceColor) meshNormal.instanceColor.needsUpdate = true;
    pelletToMeshIndex[i] = normalIdx;
  }

  if (!isInitialSpawn) {
    const spawnTime = performance.now();
    const growDuration = 500;
    const rotationX = Math.random() * Math.PI;
    const rotationY = Math.random() * Math.PI;
    const rotationZ = Math.random() * Math.PI;

    function animateGrowth() {
      const elapsed = performance.now() - spawnTime;
      const progress = Math.min(elapsed / growDuration, 1);
      const currentScale = progress * size;

      dummy.position.copy(position);
      dummy.rotation.set(rotationX, rotationY, rotationZ);
      dummy.scale.setScalar(currentScale);
      dummy.updateMatrix();

      if (isPowerUp) {
        meshPowerup.setMatrixAt(powerupIdx, dummy.matrix);
        meshPowerup.instanceMatrix.needsUpdate = true;
      } else {
        meshNormal.setMatrixAt(normalIdx, dummy.matrix);
        meshNormal.instanceMatrix.needsUpdate = true;
      }

      if (progress < 1) {
        requestAnimationFrame(animateGrowth);
      }
    }

    requestAnimationFrame(animateGrowth);
  }

  return position;
}

export function createSplitSphere(playerCell) {
  const playerCellRadius =
    playerCell.geometry.parameters.radius * playerCell.scale.x;
  const geometry = new THREE.SphereGeometry(playerCellRadius, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: playerCell.material.color.clone(),
    transparent: true,
    opacity: playerCell.material.opacity,
  });
  const cell = new THREE.Mesh(geometry, material);
  return cell;
}

export function createBot(scene, camera) {
  const { cell } = createPlayerCell(true, scene, camera);
  return cell;
}

export function respawnCell(cell, scene) {
  const playerStartingMass = 1;
  const halfMapSize = mapSize / 2;
  const maxSpawnRange = halfMapSize - playerStartingMass;

  const [x, y, z] = Array(3)
    .fill()
    .map(() => (Math.random() - 0.5) * 2 * maxSpawnRange);

  cell.position.set(x, y, z);
  cell.scale.setScalar(1);
  cell.userData.isEaten = false;
  cell.material.opacity = cell.userData.isBot
    ? 0.65
    : cell.userData.defaultOpacity || 0.65;

  // Re-add to scene
  scene.add(cell);
  if (cell.magnetSphere) {
    scene.add(cell.magnetSphere);
  }
}

export function updateBot(botCell, pelletData, deltaTime = 1 / 60) {
  let minDist = Infinity;
  let closestIdx = -1;
  for (let i = 0; i < pelletData.positions.length; i++) {
    if (!pelletData.active[i]) continue;
    const dist = botCell.position.distanceTo(pelletData.positions[i]);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }
  if (closestIdx !== -1) {
    const target = pelletData.positions[closestIdx];
    const direction = target.clone().sub(botCell.position).normalize();
    const speed = 0.08 * (deltaTime * 60);
    botCell.position.addScaledVector(direction, speed);
  }
}
