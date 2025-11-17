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
  updateCells,
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

const {
  playerCell,
  playerDefaultOpacity
} = createPlayer(scene, camera);

let cells = [];
let lastSplitTime = null;

const cameraController = createCameraController(camera, playerCell);

const { 
  updateCamera, 
  getForwardButtonPressed,
  keys,
  playerSpeed,
  lastSplit,
  playerRotation,
  cellRotation,
  setViewingCell
} = setupControls(
  canvas,
  cameraController
);

let border = null;
let pelletData = null;

createMapBox((loadedBorder) => {
  border = loadedBorder;
  scene.add(border);

  const pelletColors = [
    0xFF3333, 0x33FF33, 0x3333FF, 0xFFFF33,
    0xFF33FF, 0x33FFFF, 0xFFA500, 0xFF66B2,
    0x9966FF, 0x66FF66, 0x66FFFF, 0xFF9966, 
    0xFFFFFF
  ];

  const PELLET_COUNT = 300000; // Increased from 200,000 (optimized with spatial grid)
  pelletData = createPelletsInstanced(scene, PELLET_COUNT, pelletColors);

  animate();
});

function onSplit() {
  lastSplitTime = performance.now();
  playerCell.material.opacity = 0.2;
}

function animate() {
  requestAnimationFrame(animate);

  if (!border) return;

  const cellResult = updateCells(cells, scene, playerCell, camera, getForwardButtonPressed, playerRotation, cellRotation);
  
  setViewingCell(cellResult.viewingCell);

  if (!cellResult.viewingCell) {
    updateCamera();
  }

  if (scene.userData.animateViruses) {
    scene.userData.animateViruses(performance.now());
  }

  handlePelletEatingAndGrowth(playerCell, pelletData);

  lastSplitTime = updatePlayerFade(playerCell, lastSplitTime, playerDefaultOpacity);

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}

window.addEventListener(
  'keydown',
  e => {
    if (e.code === 'Space') {
      e.preventDefault();
      const newLastSplit = executeSplit(playerCell, camera, scene, cells, playerSpeed, lastSplit, onSplit);
      if (newLastSplit !== lastSplit) {
        Object.assign(lastSplit, { value: newLastSplit });
      }
    }
  },
  true
);

