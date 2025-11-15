import * as THREE from 'three';
import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { 
  createBox2, 
  createPelletsInstanced, 
  createPlayer, 
  createViruses 
} from './objects.js';
import { 
  updateDistanceFadeInstanced, 
  checkEatCondition 
} from './utils.js';
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

createBox2((loadedParticles, particleSize) => {
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

/* --------------------------- Main Loop ---------------------------- */

function animate() {
  requestAnimationFrame(animate);

  /* ---- Handle Split Re-Merging ---- */
  if (isSplit && splitProjectile) {
    const group = new THREE.Group();
    group.add(player);
    group.add(splitProjectile);
    scene.add(group);

    player.rotation.y += 0.02;

    isSplit = false;
    splitProjectile = null;
  }

  if (!particles) return;

  updateCamera();

  if (scene.userData.animateViruses) {
    scene.userData.animateViruses(performance.now());
  }

  /* ---------------- Pellet Eating & Growth ---------------- */

  if (pelletData) {
    const { eatenCount, eatenSizes } = checkEatCondition(
      player,
      pelletData,
      cameraDistanceFromPlayer
    );

    if (eatenCount > 0) {
      const playerRadius = player.geometry.parameters.radius * player.scale.x;
      const playerVolume = (4 / 3) * Math.PI * Math.pow(playerRadius, 3);

      const pelletBaseRadius = pelletData.radius;
      let pelletsVolume = 0;

      for (let i = 0; i < eatenSizes.length; i++) {
        const pelletRadius = pelletBaseRadius * eatenSizes[i];
        pelletsVolume += (4 / 3) * Math.PI * Math.pow(pelletRadius, 3);
      }

      const newVolume = playerVolume + pelletsVolume;
      const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
      const scale = newRadius / player.geometry.parameters.radius;

      player.scale.setScalar(scale);
    }
  }

  /* ------------------------ Projectile Updates ------------------------ */

  const now = performance.now();

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const t = (now - p.userData.startTime) / 1000;

    const playerRadius = player.geometry.parameters.radius * player.scale.x;
    const projRadius = p.geometry.parameters.radius * p.scale.x;
    const surfaceDist = playerRadius + projRadius;

    const toPlayer = player.position.clone().sub(p.position);
    const dist = toPlayer.length();

    /* ---- Space Shot Behavior ---- */
    if (p.userData.isSpaceShot) {
      if (t > 2) {
        isSplit = true;
        splitProjectile = p;

        if (!p.userData.peakDist) {
          p.userData.peakDist = dist;
        }

        const peakDist = p.userData.peakDist;
        const forwardPressed = getForwardButtonPressed();

        if (dist > surfaceDist && !forwardPressed) {
          const step = toPlayer.normalize().multiplyScalar(
            Math.min(dist - surfaceDist, 0.2)
          );
          p.position.add(step);
        } else if (dist > surfaceDist && forwardPressed) {
          p.position.copy(
            player.position.clone().add(
              toPlayer.normalize().multiplyScalar(
                surfaceDist + peakDist
              )
            )
          );
        } else if (dist <= surfaceDist) {
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          forward.normalize();

          p.position.copy(
            player.position.clone().add(
              forward.multiplyScalar(surfaceDist)
            )
          );
        }
      } else {
        const decay = Math.exp(-2 * t);
        const velocity = p.userData.velocity.clone().multiplyScalar(decay);
        p.position.add(velocity);
      }
    }

    /* ---- Normal Shot ---- */
    else {
      if (t > 2) {
        scene.remove(p);
        projectiles.splice(i, 1);
        continue;
      }

      const decay = Math.exp(-2 * t);
      const velocity = p.userData.velocity.clone().multiplyScalar(decay);
      p.position.add(velocity);
    }
  }

  /* ------------------------ Player Re-Fade After Shooting ------------------------ */

  if (lastShotTime) {
    const t = (now - lastShotTime) / 1000;
    const duration = 1.2;

    if (t >= duration) {
      player.material.opacity = playerDefaultOpacity;
      lastShotTime = null;
    } else {
      const x = t / duration;
      player.material.opacity = playerDefaultOpacity * Math.pow(x, 5);
    }
  }

  /* ------------------------ Rendering ------------------------ */

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}

