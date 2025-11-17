import * as THREE from 'three';
import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { 
  createMapBox, 
  createPelletsInstanced, 
  createPlayer, 
  createViruses 
} from './objects.js';
import { 
  updateProjectiles,
  updatePlayerFade,
  handlePelletEatingAndGrowth
} from './utils/utils.js';
import Stats from 'three/addons/libs/stats.module.js';

const canvas = document.querySelector('#c');

/* ------------------------- Renderer Setup ------------------------- */

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  powerPreference: 'high-performance'
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

/* ------------------------- Scene & Camera ------------------------- */

const { scene, camera } = createScene();
createViruses(scene);

/* --------------------------- Perf Stats --------------------------- */

const stats = new Stats();
document.body.appendChild(stats.dom);

/* ---------------------------- Controls ---------------------------- */

const pointer = new THREE.Vector2();

const {
  player,
  cameraDistanceFromPlayer,
  playerDefaultOpacity
} = createPlayer(scene, camera);

let projectiles = [];
let lastShotTime = null;
let lastShotOpacity = null;

const { 
  updateCamera, 
  getForwardButtonPressed 
} = setupControls(
  canvas, 
  camera, 
  player, 
  pointer, 
  scene, 
  projectiles, 
  () => {
    lastShotTime = performance.now();
    lastShotOpacity = player.material.opacity;
    player.material.opacity = 0.2;
  }
);

/* ------------------------- Particles & Pellets ------------------------- */

let PARTICLE_SIZE;
let particles = null;
let pelletData = null;

/* ------------------------ Load Particles Box ------------------------ */

createMapBox((loadedParticles, particleSize) => {
  particles = loadedParticles;
  PARTICLE_SIZE = particleSize;
  scene.add(particles);

  const pelletColors = [
    0xFF3333, 0x33FF33, 0x3333FF, 0xFFFF33,
    0xFF33FF, 0x33FFFF, 0xFFA500, 0xFF66B2,
    0x9966FF, 0x66FF66, 0x66FFFF, 0xFF9966, 
    0xFFFFFF
  ];

  const PELLET_COUNT = 200000;
  pelletData = createPelletsInstanced(scene, PELLET_COUNT, pelletColors);

  animate();
});

/* --------------------------- Split Logic --------------------------- */

let isSplit = false;
let splitProjectile = null;
let tempPosition = null;

/* --------------------------- Main Loop ---------------------------- */

function animate() {
  requestAnimationFrame(animate);

  if (!particles) return;

  updateCamera();

  if (scene.userData.animateViruses) {
    scene.userData.animateViruses(performance.now());
  }

  /* ---------------- Pellet Eating & Growth ---------------- */

  handlePelletEatingAndGrowth(player, pelletData, cameraDistanceFromPlayer);

  /* ------------------------ Projectile Updates ------------------------ */

  const projectileResult = updateProjectiles(projectiles, scene, player, camera, getForwardButtonPressed);
  isSplit = projectileResult.isSplit;
  splitProjectile = projectileResult.splitProjectile;

  /* ------------------------ Player Re-Fade After Shooting ------------------------ */

  lastShotTime = updatePlayerFade(player, lastShotTime, playerDefaultOpacity);

  /* ------------------------ Rendering ------------------------ */

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}

