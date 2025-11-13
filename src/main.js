import * as THREE from 'three';
import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { createBox2, createPelletsInstanced, createPlayer } from './objects.js';
import { updateDistanceFadeInstanced } from './utils.js';
import Stats from 'three/addons/libs/stats.module.js';

const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const { scene, camera } = createScene();

const stats = new Stats();
document.body.appendChild(stats.dom);

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

const player = createPlayer(scene, camera);
const { updateCamera } = setupControls(canvas, camera, player, pointer);

let PARTICLE_SIZE, particles;

createBox2((loadedParticles, particleSize) => {
  particles = loadedParticles;
  PARTICLE_SIZE = particleSize;
  scene.add(particles);

  const pelletColors = [
    0xFF3333, 0x33FF33, 0x3333FF, 0xFFFF33,
    0xFF33FF, 0x33FFFF, 0xFFA500, 0xFF66B2,
    0x9966FF, 0x66FF66, 0x66FFFF, 0xFF9966, 0xFFFFFF
  ];
  const PELLET_COUNT = 200000;
  const {mesh, pelletTransforms} = createPelletsInstanced(scene, PELLET_COUNT, pelletColors);

  animate(mesh);
  console.log(mesh)
});

const FADE_START_DISTANCE = 15;
const FADE_END_DISTANCE = 5;

function animate(mesh) {
  requestAnimationFrame(() => animate(mesh));

  if (!particles) return;

  raycaster.setFromCamera(pointer, camera);
  updateCamera();

  // optionally fade pellets if utils.js has this function
  // updateDistanceFadeInstanced(mesh, player.position, FADE_START_DISTANCE, FADE_END_DISTANCE);

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}
