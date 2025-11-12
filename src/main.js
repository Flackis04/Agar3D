import * as THREE from 'three';
import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { createBox2, addPellet, createPlayer } from './objects.js';

const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const { scene, camera } = createScene();
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const player = createPlayer(scene, camera)
const { updateCamera } = setupControls(canvas, camera, player, pointer);

let PARTICLE_SIZE, particles;

// Create particles **after texture loads**
createBox2((loadedParticles, particleSize) => {
  particles = loadedParticles;
  PARTICLE_SIZE = particleSize;
  scene.add(particles);
  animate(); // Start animation only now
});

const pelletColors = [0xFF3333,0x33FF33,0x3333FF,0xFFFF33,0xFF33FF,0x33FFFF,0xFFA500,0xFF66B2,0x9966FF,0x66FF66,0x66FFFF,0xFF9966,0xFFFFFF];
Array(20000).fill().forEach(() => addPellet(scene, pelletColors[Math.floor(Math.random() * pelletColors.length)]));

function animate() {
  requestAnimationFrame(animate);

  if (!particles) return;

  raycaster.setFromCamera(pointer, camera);
  // You can keep raycasting if you want hover detection without scaling,
  // or remove these two lines entirely if not needed
  // const intersects = raycaster.intersectObject(particles);

  updateCamera();
  stats.begin();

  renderer.render(scene, camera);

  stats.end();
}

