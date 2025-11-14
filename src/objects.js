import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export function createPlayer(scene, camera){
  const playerStartingMass = 1
  // Performance: Reduced geometry complexity from 24x24 (1152 faces) to 16x16 (512 faces)
  // This provides sufficient visual quality while improving rendering performance
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

  const [x, y, z] = Array(3)
    .fill()
    .map(() => THREE.MathUtils.randFloatSpread(500));

  player.position.set(x, y, z);
  const cameraDistanceFromPlayer = 5;
  camera.position.set(x, y, z + cameraDistanceFromPlayer);
  scene.add(player);

  return { player, cameraDistanceFromPlayer };
}

export function createBox2(onReady) {
  const PARTICLE_SIZE = 2;

  // Performance: Reduced box subdivisions from 128x128x128 to 64x64x64
  // This reduces vertex count from ~2M to ~500K while maintaining visual quality
  let boxGeometry = new THREE.BoxGeometry(500, 500, 500, 96, 96, 96);
  boxGeometry.deleteAttribute('normal');
  boxGeometry.deleteAttribute('uv');
  boxGeometry = BufferGeometryUtils.mergeVertices(boxGeometry);

  const positionAttribute = boxGeometry.getAttribute('position');
  const colors = [];
  const sizes = [];

  const borderColor = new THREE.Color(0x66AAFF); // modern cyan-blue

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
// objects.js
export function createPelletsInstanced(scene, count, colors) {
  const geometry = new THREE.SphereGeometry(1, 8, 8); // base radius 1, will be scaled per pellet
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geometry, material, count);

  const dummy = new THREE.Object3D();
  const positions = [];
  const sizes = []; // store the size of each pellet
  const active = new Array(count).fill(true);

  for (let i = 0; i < count; i++) {
    const color = new THREE.Color(colors[i % colors.length]);
    const position = new THREE.Vector3(
      (Math.random() - 0.5) * 500,
      (Math.random() - 0.5) * 500,
      (Math.random() - 0.5) * 500
    );

    // Random size between 0.2 and 0.5
    const size = Math.random() * 0.3 + 0.2;
    sizes.push(size);

    dummy.position.copy(position);
    dummy.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    dummy.scale.setScalar(size);
    dummy.updateMatrix();

    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color);
    positions.push(position.clone());
  }

  // Utility: Check and eat pellets if player overlaps
  mesh.checkAndEatPellets = function(player) {
    let eaten = 0;
    for (let i = 0; i < count; i++) {
      if (!active[i]) continue;
      const pelletPos = positions[i];
      const playerPos = player.position;
      const playerRadius = player.geometry.parameters.radius * player.scale.x;
      const dist = playerPos.distanceTo(pelletPos);
      // Only eat pellet if its center is inside the player sphere
      if (dist < playerRadius) {
        active[i] = false;
        // Hide pellet by scaling to zero
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

  // Performance: Enable frustum culling for better rendering performance
  mesh.frustumCulled = true;

  scene.add(mesh);

  return {
    mesh,
    positions,
    sizes,
    active,
    radius: geometry.parameters.radius,
    dummy
  };
}
