import { checkEatCondition } from './utils/playerUtils.js';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export const mapSize = 250;

export function createPlayerCell(isBot, scene, camera) {
  const playerStartingMass = 1;
  const playerDefaultOpacity = 0.65;
  const playerCellColor = isBot ? 0xFF3333 : 0x00AAFF;

  const geometry = new THREE.SphereGeometry(playerStartingMass, 16, 16);
  const material = new THREE.MeshStandardMaterial({ 
    color: playerCellColor,
    emissive: 0x002244,
    emissiveIntensity: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: playerDefaultOpacity
  });

  const [x, y, z] = Array(3)
    .fill()
    .map(() => THREE.MathUtils.randFloatSpread(mapSize));

  const cell = new THREE.Mesh(geometry, material);

  cell.position.set(x, y, z);
  scene.add(cell);

  return cell;
}

export function createMagnetSphere(magnetRange = 4) {
  const geometry = new THREE.SphereGeometry(magnetRange, 32, 32);
  
  const solidMaterial = new THREE.MeshBasicMaterial({
    color: 0xFF3333,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide
  });
  
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0xFF6666,
    transparent: true,
    opacity: 0.3,
    wireframe: true
  });
  
  const magnetSphere = new THREE.Group();
  
  const solidMesh = new THREE.Mesh(geometry, solidMaterial);
  const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
  
  magnetSphere.add(solidMesh);
  magnetSphere.add(wireframeMesh);
  magnetSphere.visible = false;
  
  return magnetSphere;
}

export function createMapBox(onReady) {
  const PARTICLE_SIZE = 2;

  const borderSegments = mapSize / 4
  let boxGeometry = new THREE.BoxGeometry(mapSize, mapSize, mapSize, borderSegments, borderSegments, borderSegments);
  boxGeometry.deleteAttribute('normal');
  boxGeometry.deleteAttribute('uv');
  boxGeometry = BufferGeometryUtils.mergeVertices(boxGeometry);

  const positionAttribute = boxGeometry.getAttribute('position');
  const colors = [];
  const sizes = [];

  const borderColor = new THREE.Color(0x66AAFF);

  for (let i = 0; i < positionAttribute.count; i++) {
    borderColor.toArray(colors, i * 3);
    sizes[i] = PARTICLE_SIZE * 0.6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positionAttribute.clone());
  geometry.setAttribute('customColor', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

  const loader = new THREE.TextureLoader();
  loader.load('https://threejs.org/examples/textures/sprites/disc.png', (texture) => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0xffffff) },
        pointTexture: { value: texture },
        alphaTest: { value: 0.9 }, // fully opaque
        fogColor: { value: new THREE.Color(0x080020) },
        fogDensity: { value: 0.025 }
      },
      vertexShader: document.getElementById('vertexshader').textContent,
      fragmentShader: document.getElementById('fragmentshader').textContent,
      transparent: false,
      depthWrite: true
    });

    material.needsUpdate = true;
    const particles = new THREE.Points(geometry, material);

    onReady(particles, PARTICLE_SIZE);
  });
}

export function createPelletsInstanced(scene, count, colors) {
  const geometry = new THREE.SphereGeometry(1, 8, 8);
  const materialNormal = new THREE.MeshStandardMaterial({ color: 0xffffff, opacity: 1, transparent: false });
  const materialPowerup = new THREE.MeshStandardMaterial({ color: 0xffffff, opacity: 0.25, transparent: true });

  const dummy = new THREE.Object3D();
  const positions = [];
  const sizes = [];
  const active = new Array(count).fill(true);
  const powerUps = new Array(count);
  const pelletToMeshIndex = new Array(count);

  let powerupCount = 0;
  let normalCount = 0;
  for (let i = 0; i < count; i++) {
    const color = new THREE.Color(colors[i % colors.length]);
    const isPowerUp = (
      color.getHex() === 0xff0000 &&
      Math.floor(Math.random() * 3) === 0
    );
    powerUps[i] = isPowerUp;
    if (isPowerUp) powerupCount++;
    else normalCount++;
  }

  const meshNormal = new THREE.InstancedMesh(geometry, materialNormal, normalCount);
  const meshPowerup = new THREE.InstancedMesh(geometry, materialPowerup, powerupCount);

  let normalIdx = 0;
  let powerupIdx = 0;

  for (let i = 0; i < count; i++) {
    const color = new THREE.Color(colors[i % colors.length]);
    const isPowerUp = powerUps[i];

    const pelletMinSize = 0.2
    const pelletMaxSize = 0.5
    const size = Math.random() * (pelletMaxSize-pelletMinSize) + pelletMinSize;
    sizes.push(size);

    // Use reusable pellet respawn function
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
      i
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

  return { 
    mesh: meshNormal, 
    meshPowerup, 
    positions, 
    sizes, 
    active, 
    radius: geometry.parameters.radius, 
    dummy, 
    powerUps, 
    pelletToMeshIndex
  };
}

// Reusable pellet respawn function
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
  i
}) {
  const pelletRadius = size;
  const halfMapSize = mapSize / 2;
  const maxPos = halfMapSize - pelletRadius;

  const position = new THREE.Vector3(
    (Math.random() - 0.5) * 2 * maxPos,
    (Math.random() - 0.5) * 2 * maxPos,
    (Math.random() - 0.5) * 2 * maxPos
  );

  dummy.position.copy(position);
  dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  dummy.scale.setScalar(size);
  dummy.updateMatrix();

  if (isPowerUp) {
    meshPowerup.setMatrixAt(powerupIdx, dummy.matrix);
    meshPowerup.setColorAt(powerupIdx, color);
    pelletToMeshIndex[i] = powerupIdx;
  } else {
    meshNormal.setMatrixAt(normalIdx, dummy.matrix);
    meshNormal.setColorAt(normalIdx, color);
    pelletToMeshIndex[i] = normalIdx;
  }
  return position;
}

export function createViruses(scene) {
  const VIRUS_COUNT = 250;
  const VIRUS_SIZE = 2.25;
  const virusColor = 0x32CD32;
  const geometry = new THREE.DodecahedronGeometry(VIRUS_SIZE);
  const material = new THREE.MeshStandardMaterial({ color: virusColor, opacity: 0.8, transparent: true });
  const border = mapSize / 2 - VIRUS_SIZE;
  const positions = [];
  const viruses = [];
  for (let i = 0; i < VIRUS_COUNT; i++) {
    let pos;
    let tries = 0;
    do {
      pos = new THREE.Vector3(
        (Math.random() * (border * 2 - VIRUS_SIZE * 2)) - (border - VIRUS_SIZE),
        (Math.random() * (border * 2 - VIRUS_SIZE * 2)) - (border - VIRUS_SIZE),
        (Math.random() * (border * 2 - VIRUS_SIZE * 2)) - (border - VIRUS_SIZE)
      );
      tries++;
    } while (positions.some(p => p.distanceTo(pos) < VIRUS_SIZE * 2.1) && tries < 20);
    positions.push(pos);
    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.position.copy(pos);
    mesh.userData.baseScale = 1;
    viruses.push(mesh);
    scene.add(mesh);
  }
  scene.userData.viruses = viruses;
  function animateViruses(time) {
    for (let i = 0; i < viruses.length; i++) {
      const mesh = viruses[i];
      mesh.rotation.y += 0.005;
      mesh.rotation.x += 0.002;
      const scale = mesh.userData.baseScale + 0.08 * Math.sin(time * 0.001 + i);
      mesh.scale.setScalar(scale);
    }
  }
  scene.userData.animateViruses = animateViruses;
}

export function createBot(scene, camera){
  const cell = createPlayerCell(true, scene, camera);
  return cell;
}

export function updateBot(bot, pelletData) {
  let minDist = Infinity;
  let closestIdx = -1;
  for (let i = 0; i < pelletData.positions.length; i++) {
    if (!pelletData.active[i]) continue;
    const dist = bot.position.distanceTo(pelletData.positions[i]);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }
  if (closestIdx !== -1) {
    const target = pelletData.positions[closestIdx];
    const direction = target.clone().sub(bot.position).normalize();
    const speed = 0.08;
    bot.position.addScaledVector(direction, speed);
  }
  checkEatCondition(false, bot, pelletData);
}