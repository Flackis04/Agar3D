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
    .map(() => THREE.MathUtils.randFloatSpread(200));

  player.position.set(x, y, z);
  camera.position.set(x, y, z + 5)
  scene.add(player);

  return player
}

export function createBox2(onReady) {
  const PARTICLE_SIZE = 2;

  let boxGeometry = new THREE.BoxGeometry(200, 200, 200, 64, 64, 64);
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
        alphaTest: { value: 0.9 }
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

export function addPellet(scene, color) {
  const pelletSize = Math.random() / 2
  const geometry = new THREE.SphereGeometry(pelletSize, 6, 6);
  const material = new THREE.MeshStandardMaterial({ 
    color: color,
    emissive: color,
    emissiveIntensity: 0.2,
    metalness: 0.05,
  });
  const pellet = new THREE.Mesh(geometry, material);

  const [x, y, z] = Array(3)
    .fill()
    .map(() => THREE.MathUtils.randFloatSpread(200));

  pellet.position.set(x, y, z);
  scene.add(pellet);
}
