import * as THREE from 'three';
import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { createCameraController } from './camera.js';
import { 
  createMapBox, 
  createPelletsInstanced, 
  createPlayer, 
  createViruses 
} from './objects.js';
import { 
  updateProjectiles,
  updatePlayerFade,
  handlePelletEatingAndGrowth,
  executeSplit
} from './utils/playerUtils.js';
import Stats from 'three/addons/libs/stats.module.js';

const canvas = document.querySelector('#c');

// Renderer Setup

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  powerPreference: 'high-performance'
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const { scene, camera } = createScene();
createViruses(scene);

const stats = new Stats();
document.body.appendChild(stats.dom);

const pointer = new THREE.Vector2();

const {
  playerSphere,
  playerDefaultOpacity
} = createPlayer(scene, camera);

let projectiles = [];
let lastShotTime = null;
let lastShotOpacity = null;

const cameraController = createCameraController(camera, playerSphere);

const { 
  updateCamera, 
  getForwardButtonPressed,
  keys,
  playerSpeed,
  lastShot,
  playerRotation,
  projectileRotation,
  setViewingProjectile
} = setupControls(
  canvas, 
  pointer,
  cameraController
);

let PARTICLE_SIZE;
let particles = null;
let pelletData = null;

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

let isSplit = false;
let splitProjectile = null;
let tempPosition = null;

function animate() {
  requestAnimationFrame(animate);

  if (!particles) return;

  const projectileResult = updateProjectiles(projectiles, scene, playerSphere, camera, getForwardButtonPressed, playerRotation, projectileRotation);
  isSplit = projectileResult.isSplit;
  splitProjectile = projectileResult.splitProjectile;

  setViewingProjectile(projectileResult.viewingProjectile);

  if (!projectileResult.viewingProjectile) {
    updateCamera();
  }

  if (scene.userData.animateViruses) {
    scene.userData.animateViruses(performance.now());
  }

  handlePelletEatingAndGrowth(playerSphere, pelletData);

  lastShotTime = updatePlayerFade(playerSphere, lastShotTime, playerDefaultOpacity);

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}

function handleShootLoop() {
  if (keys['e']) {
    const newLastShot = executeSplit(false, playerSphere, camera, scene, projectiles, playerSpeed, lastShot, () => {
      lastShotTime = performance.now();
      lastShotOpacity = playerSphere.material.opacity;
      playerSphere.material.opacity = 0.2;
    });
    if (newLastShot !== lastShot) {
      Object.assign(lastShot, { value: newLastShot });
    }
  }
  requestAnimationFrame(handleShootLoop);
}
handleShootLoop();

window.addEventListener(
  'keydown',
  e => {
    if (e.code === 'Space') {
      e.preventDefault();
      const newLastShot = executeSplit(true, playerSphere, camera, scene, projectiles, playerSpeed, lastShot, () => {
        lastShotTime = performance.now();
        lastShotOpacity = playerSphere.material.opacity;
        playerSphere.material.opacity = 0.2;
      });
      if (newLastShot !== lastShot) {
        Object.assign(lastShot, { value: newLastShot });
      }
    }
  },
  true
);

