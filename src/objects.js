
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Shared map size for all functions
export const mapSize = 500;

/**
 * Creates the player mesh and positions the camera at a fixed distance behind it.
 * @param {THREE.Scene} scene - The scene to add the player to.
 * @param {THREE.PerspectiveCamera} camera - The camera to position relative to the player.
 * @returns {Object} - Contains `player` mesh and `cameraDistanceFromPlayer`.
 */
export function createPlayer(scene, camera) {
  const playerStartingMass = 1;
  const playerDefaultOpacity = 0.65;

  // Lowered geometry resolution for performance (16x16 segments)
  const geometry = new THREE.SphereGeometry(playerStartingMass, 16, 16);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x00AAFF,
    emissive: 0x002244,
    emissiveIntensity: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: playerDefaultOpacity
  });
  const player = new THREE.Mesh(geometry, material);

  // Random initial position inside the box
  const [x, y, z] = Array(3)
    .fill()
    .map(() => THREE.MathUtils.randFloatSpread(mapSize));

  player.position.set(x, y, z);

  scene.add(player);

  return { player, playerDefaultOpacity };
}

/**
 * Creates a box of particles for visual effect.
 * @param {Function} onReady - Callback executed when particles are loaded: receives (particles, PARTICLE_SIZE).
 */
export function createMapBox(onReady) {
  const PARTICLE_SIZE = 2;

  // Reduced subdivisions for performance (64x64x64)
  let boxGeometry = new THREE.BoxGeometry(mapSize, mapSize, mapSize, 96, 96, 96);
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
        alphaTest: { value: 0.9 },
        fogColor: { value: new THREE.Color(0x080020) },
        fogDensity: { value: 0.025 }
      },
      vertexShader: document.getElementById('vertexshader').textContent,
      fragmentShader: document.getElementById('fragmentshader').textContent,
      transparent: true,
      depthWrite: false
    });

    material.needsUpdate = true;
    const particles = new THREE.Points(geometry, material);

    onReady(particles, PARTICLE_SIZE);
  });
}

/**
 * Creates instanced pellets for the player to interact with.
 * @param {THREE.Scene} scene - The scene to add the pellets to.
 * @param {number} count - Number of pellets to generate.
 * @param {number[]} colors - Array of hex colors for pellets.
 * @returns {Object} - Contains instanced mesh, positions, sizes, activity status, radius, and dummy object.
 */
export function createPelletsInstanced(scene, count, colors) {
  const geometry = new THREE.SphereGeometry(1, 8, 8); // base radius
  const materialNormal = new THREE.MeshStandardMaterial({ color: 0xffffff, opacity: 1, transparent: false });
  const materialPowerup = new THREE.MeshStandardMaterial({ color: 0xffffff, opacity: 0.25, transparent: true });

  const dummy = new THREE.Object3D();
  const positions = [];
  const sizes = [];
  const active = new Array(count).fill(true);
  const powerUps = new Array(count);
  const pelletToMeshIndex = new Array(count); // Maps global pellet index to mesh-specific index

  // First pass: count powerups and normals
  let powerupCount = 0;
  let normalCount = 0;
  for (let i = 0; i < count; i++) {
    const color = new THREE.Color(colors[i % colors.length]);
    const isPowerUp = (
      color.getHex() === 0xFF3333 &&
      Math.floor(Math.random() * 8) === 0
    );
    powerUps[i] = isPowerUp;
    if (isPowerUp) powerupCount++;
    else normalCount++;
  }

  // Create two separate instanced meshes
  const meshNormal = new THREE.InstancedMesh(geometry, materialNormal, normalCount);
  const meshPowerup = new THREE.InstancedMesh(geometry, materialPowerup, powerupCount);

  // Second pass: populate both meshes
  let normalIdx = 0;
  let powerupIdx = 0;

  for (let i = 0; i < count; i++) {
    const color = new THREE.Color(colors[i % colors.length]);
    const isPowerUp = powerUps[i];

    const position = new THREE.Vector3(
      (Math.random() - 0.5) * 500,
      (Math.random() - 0.5) * 500,
      (Math.random() - 0.5) * 500
    );

    const size = Math.random() * 0.3 + 0.2;
    sizes.push(size);

    dummy.position.copy(position);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();

    if (isPowerUp) {
      meshPowerup.setMatrixAt(powerupIdx, dummy.matrix);
      meshPowerup.setColorAt(powerupIdx, color);
      pelletToMeshIndex[i] = powerupIdx;
      powerupIdx++;
    } else {
      meshNormal.setMatrixAt(normalIdx, dummy.matrix);
      meshNormal.setColorAt(normalIdx, color);
      pelletToMeshIndex[i] = normalIdx;
      normalIdx++;
    }
    positions.push(position.clone());
  }

  /**
   * Checks if player overlaps any pellet and "eats" it.
   * @param {THREE.Mesh} player - The player mesh.
   * @returns {number} - Number of pellets eaten in this check.
   */
  const checkAndEatPellets = function(player) {
    let eaten = 0;
    for (let i = 0; i < count; i++) {
      if (!active[i]) continue;

      const pelletPos = positions[i];
      const playerPos = player.position;
      const playerRadius = player.geometry.parameters.radius * player.scale.x;
      const dist = playerPos.distanceTo(pelletPos);

      if (dist < playerRadius) {
        active[i] = false;

        dummy.position.copy(pelletPos);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        
        const meshIndex = pelletToMeshIndex[i];
        if (powerUps[i]) {
          meshPowerup.setMatrixAt(meshIndex, dummy.matrix);
          meshPowerup.instanceMatrix.needsUpdate = true;
        } else {
          meshNormal.setMatrixAt(meshIndex, dummy.matrix);
          meshNormal.instanceMatrix.needsUpdate = true;
        }

        eaten++;
      }
    }
    return eaten;
  };

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
    pelletToMeshIndex,
    checkAndEatPellets 
  };
}

/**
 * Creates virus spheres in the scene.
 * @param {THREE.Scene} scene - The scene to add the viruses to.
 */
export function createViruses(scene) {
  const VIRUS_COUNT = 250;
  const VIRUS_SIZE = 2.25;
  const virusColor = 0x32CD32; // lime green
  const geometry = new THREE.DodecahedronGeometry(VIRUS_SIZE);
  const material = new THREE.MeshStandardMaterial({ color: virusColor, opacity: 0.8, transparent: true });
  const border = mapSize / 2 - VIRUS_SIZE; // keep inside box
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
  // Animation function for viruses
  function animateViruses(time) {
    for (let i = 0; i < viruses.length; i++) {
      const mesh = viruses[i];
      mesh.rotation.y += 0.005;
      mesh.rotation.x += 0.002;
      // Breathing effect
      const scale = mesh.userData.baseScale + 0.08 * Math.sin(time * 0.001 + i);
      mesh.scale.setScalar(scale);
    }
  }
  // Attach to scene for main loop
  scene.userData.animateViruses = animateViruses;
}