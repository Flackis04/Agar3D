import * as THREE from 'three';
import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { createBox2, createPelletsInstanced, createPlayer } from './objects.js';
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
const {player, cameraDistanceFromPlayer} = createPlayer(scene, camera);
const { updateCamera } = setupControls(canvas, camera, player, pointer);

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

  /**
   * Optionally fade pellets based on distance from player
   * Uncomment if `updateDistanceFadeInstanced` is implemented in utils.js
   */
  // updateDistanceFadeInstanced(particles, player.position, FADE_START_DISTANCE, FADE_END_DISTANCE);

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}
