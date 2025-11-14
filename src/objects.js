import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Creates the player mesh and positions the camera at a fixed distance behind it.
 * @param {THREE.Scene} scene - The scene to add the player to.
 * @param {THREE.PerspectiveCamera} camera - The camera to position relative to the player.
 * @returns {Object} - Contains `player` mesh and `cameraDistanceFromPlayer`.
 */
export function createPlayer(scene, camera) {
  const playerStartingMass = 1;

  // Lowered geometry resolution for performance (16x16 segments)
  const geometry = new THREE.SphereGeometry(playerStartingMass, 16, 16);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x00AAFF,
    emissive: 0x002244,
    emissiveIntensity: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85
  });
  const player = new THREE.Mesh(geometry, material);

  // Random initial position inside the box
  const [x, y, z] = Array(3)
    .fill()
    .map(() => THREE.MathUtils.randFloatSpread(500));

  player.position.set(x, y, z);

  const cameraDistanceFromPlayer = 5;
  camera.position.set(x, y, z + cameraDistanceFromPlayer);

  scene.add(player);

  return { player, cameraDistanceFromPlayer };
}

/**
 * Creates a box of particles for visual effect.
 * @param {Function} onReady - Callback executed when particles are loaded: receives (particles, PARTICLE_SIZE).
 */
export function createBox2(onReady) {
  const PARTICLE_SIZE = 2;

  // Reduced subdivisions for performance (64x64x64)
  let boxGeometry = new THREE.BoxGeometry(500, 500, 500, 96, 96, 96);
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
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geometry, material, count);

  const dummy = new THREE.Object3D();
  const positions = [];
  const sizes = [];
  const active = new Array(count).fill(true);

  for (let i = 0; i < count; i++) {
    const color = new THREE.Color(colors[i % colors.length]);
    const position = new THREE.Vector3(
      (Math.random() - 0.5) * 500,
      (Math.random() - 0.5) * 500,
      (Math.random() - 0.5) * 500
    );

    const size = Math.random() * 0.3 + 0.2; // random size
    sizes.push(size);

    dummy.position.copy(position);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();

    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color);
    positions.push(position.clone());
  }

  /**
   * Checks if player overlaps any pellet and "eats" it.
   * @param {THREE.Mesh} player - The player mesh.
   * @returns {number} - Number of pellets eaten in this check.
   */
  mesh.checkAndEatPellets = function(player) {
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
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.instanceMatrix.needsUpdate = true;

        eaten++;
      }
    }
    return eaten;
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  mesh.frustumCulled = true; // improve rendering performance

  scene.add(mesh);

  return { mesh, positions, sizes, active, radius: geometry.parameters.radius, dummy };
}
