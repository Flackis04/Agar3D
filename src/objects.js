import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export function createPlayer(scene, camera){
  const playerStartingMass = 1
  const geometry = new THREE.SphereGeometry(playerStartingMass, 24, 24);
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
  camera.position.set(x, y, z + 5)
  scene.add(player);

  return player
}

export function createBox2(onReady) {
  const PARTICLE_SIZE = 2;

  let boxGeometry = new THREE.BoxGeometry(500, 500, 500, 128, 128, 128);
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
  const geometry = new THREE.SphereGeometry(0.3, 8, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geometry, material, count);

  const pellet = new THREE.Object3D();
  const halfSize = 250; // half of 500x500x500 cube

  const pelletTransforms = []
  
  for (let i = 0; i < count; i++) {
    const color = new THREE.Color(colors[i % colors.length]);
    pellet.position.set(
      (Math.random() - 0.5) * 500, // X: -250 to +250
      (Math.random() - 0.5) * 500, // Y: -250 to +250
      (Math.random() - 0.5) * 500  // Z: -250 to +250
    );
    pellet.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    pellet.scale.setScalar(1);
    pellet.updateMatrix();
    mesh.setMatrixAt(i, pellet.matrix);
    mesh.setColorAt(i, color);
    pelletTransforms.push([pellet.position, pellet.rotation, pellet.scale])
    console.log(pelletTransforms)
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  scene.add(mesh);
  return {mesh, pelletTransforms};
}
