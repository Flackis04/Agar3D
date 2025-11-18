import * as THREE from 'three';
import { createScene, updateFogDensity} from './scene.js';
import { setupControls } from './controls.js';
import { createCameraController } from './camera.js';
import { 
  createMapBox, 
  createPelletsInstanced, 
  createPlayer, 
  createViruses,
  createMagnetSphere 
} from './objects.js';
import { 
  updateCells,
  updatePlayerFade,
  handlePelletEatingAndGrowth,
  executeSplit
} from './utils/playerUtils.js';
import Stats from 'three/addons/libs/stats.module.js';
import { initNetworking, emitPlayerMove, emitJoin } from './multiplayer.js';
import { removeFogIfDevMode } from './camera.js';

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

const magnetSphere = createMagnetSphere();
scene.add(magnetSphere);

// Multiplayer integration
let playerName = 'Player';
initNetworking(scene);
emitJoin(playerName, playerCell);

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

  const PELLET_COUNT = 200000;
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

  updateFogDensity(scene, playerCell.geometry.parameters.radius * playerCell.scale.x)

  removeFogIfDevMode(scene, cameraController, pelletData);

  if (!(cameraController.isDevMode && cameraController.isDevMode())) {
    handlePelletEatingAndGrowth(playerCell, pelletData, scene, magnetSphere);
    if (pelletData) {
      if (pelletData.mesh && !scene.children.includes(pelletData.mesh)) scene.add(pelletData.mesh);
      if (pelletData.meshPowerup && !scene.children.includes(pelletData.meshPowerup)) scene.add(pelletData.meshPowerup);
    }
  } else {
    if (pelletData) {
      if (pelletData.mesh && scene.children.includes(pelletData.mesh)) scene.remove(pelletData.mesh);
      if (pelletData.meshPowerup && scene.children.includes(pelletData.meshPowerup)) scene.remove(pelletData.meshPowerup);
    }
  }

  const cellResult = updateCells(cells, scene, playerCell, camera, getForwardButtonPressed, playerRotation, cellRotation);
  setViewingCell(cellResult.viewingCell);

  if (!cellResult.viewingCell) {
    const magnetActive = pelletData && pelletData.pelletMagnetToggle;
    updateCamera(magnetActive);
  }

  if (scene.userData.animateViruses) {
    scene.userData.animateViruses(performance.now());
  }

  lastSplitTime = updatePlayerFade(playerCell, lastSplitTime, playerDefaultOpacity);

  emitPlayerMove(playerCell);

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

