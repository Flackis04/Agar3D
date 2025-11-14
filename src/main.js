import * as THREE from 'three';
import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { createBox2, createPelletsInstanced, createPlayer, createViruses } from './objects.js';
import { updateDistanceFadeInstanced, checkEatCondition } from './utils.js';
import Stats from 'three/addons/libs/stats.module.js';

const canvas = document.querySelector('#c');

/**
 * Initialize the WebGL renderer.
 * - Antialiasing enabled
 * - High-performance GPU requested
 * - Tone mapping for realistic lighting
 */
const renderer = new THREE.WebGLRenderer({ 
  antialias: true, 
  canvas,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

/**
 * Create the main scene and camera
 */
const { scene, camera } = createScene();
createViruses(scene);

/**
 * Performance stats overlay
 */
const stats = new Stats();
document.body.appendChild(stats.dom);

/**
 * Pointer for mouse interaction
 */
const pointer = new THREE.Vector2();

/**
 * Initialize player and camera controls
 */
const {player, cameraDistanceFromPlayer, playerDefaultOpacity} = createPlayer(scene, camera);
let projectiles = [];
let lastShotTime = null;
let lastShotOpacity = null;
const { updateCamera } = setupControls(canvas, camera, player, pointer, scene, projectiles, () => {
  lastShotTime = performance.now();
  lastShotOpacity = player.material.opacity;
  player.material.opacity = 0.2;
});

let PARTICLE_SIZE, particles;
let pelletData = null;

/**
 * Load particle box and pellets
 * @param {function} callback - receives loaded particles and particle size
 */
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
  
  // Create instanced pellets for performance
  pelletData = createPelletsInstanced(scene, PELLET_COUNT, pelletColors);

  animate();
});

/**
 * Distance thresholds for pellet fading (optional)
 */
const FADE_START_DISTANCE = 15;
const FADE_END_DISTANCE = 5;

/**
 * Main animation loop
 */
function animate() {
  requestAnimationFrame(animate);
  if (!particles) return;
  updateCamera();
  if (scene.userData.animateViruses) {
    scene.userData.animateViruses(performance.now());
  }
  if (pelletData) {
    const { eatenCount, eatenSizes } = checkEatCondition(player, pelletData, cameraDistanceFromPlayer);

    if (eatenCount > 0) {
      /**
       * Realistic player growth based on eaten pellet volumes
       */
      const playerRadius = player.geometry.parameters.radius * player.scale.x;
      const playerVolume = (4/3) * Math.PI * Math.pow(playerRadius, 3);
      const pelletBaseRadius = pelletData.radius;
      let pelletsVolume = 0;

      for (let i = 0; i < eatenSizes.length; i++) {
        const pelletRadius = pelletBaseRadius * eatenSizes[i];
        pelletsVolume += (4/3) * Math.PI * Math.pow(pelletRadius, 3);
      }

      const newVolume = playerVolume + pelletsVolume;
      const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
      const scale = newRadius / player.geometry.parameters.radius;
      player.scale.setScalar(scale);
    }
  }

  // Update projectiles
  const now = performance.now();
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const t = (now - p.userData.startTime) / 1000;
    const playerRadius = player.geometry.parameters.radius * player.scale.x;
    const projRadius = p.geometry.parameters.radius * p.scale.x;
    const surfaceDist = playerRadius + projRadius;
    const toPlayer = player.position.clone().sub(p.position);
    const dist = toPlayer.length();

    if (p.userData.isSpaceShot) {
      // Space shot: return to player unless detached, 2s passed, and player is NOT moving forward
      if (t > 2) {
        const movingForward = window.keys && (window.keys['w'] || window.keys['W']);
        if (dist > surfaceDist && !movingForward) {
          // Return towards player only if detached and player not moving forward
          const step = toPlayer.normalize().multiplyScalar(Math.min(dist - surfaceDist, 0.2));
          p.position.add(step);
        } else if (dist <= surfaceDist) {
          // Stop at surface-to-surface
          p.position.copy(player.position.clone().add(toPlayer.normalize().multiplyScalar(surfaceDist)));
        }
        // If player is moving forward, projectile stays in place
      } else {
        // Exponential decay: v = v0 * exp(-2t)
        const decay = Math.exp(-2 * t);
        const velocity = p.userData.velocity.clone().multiplyScalar(decay);
        p.position.add(velocity);
      }
    } else {
      // Non-space shots disappear after 2 seconds
      if (t > 2) {
        scene.remove(p);
        projectiles.splice(i, 1);
        continue;
      }
      // Exponential decay: v = v0 * exp(-2t)
      const decay = Math.exp(-2 * t);
      const velocity = p.userData.velocity.clone().multiplyScalar(decay);
      p.position.add(velocity);
    }
  }

  if (lastShotTime) {
    const now = performance.now();
    const t = (now - lastShotTime) / 1000;
    const duration = 1.2; // seconds

    if (t >= duration) {
      player.material.opacity = playerDefaultOpacity;
      lastShotTime = null;
    } else {
      const x = t / duration;
      player.material.opacity = playerDefaultOpacity * Math.pow(x, 5);
    }
  }


  /**
   * Optionally fade pellets based on distance from player
   * Uncomment if `updateDistanceFadeInstanced` is implemented in utils.js
   */
  // updateDistanceFadeInstanced(particles, player.position, FADE_START_DISTANCE, FADE_END_DISTANCE);

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}
