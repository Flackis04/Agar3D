import * as THREE from 'three';
import { createScene, updateFogDensity} from './scene.js';
import { setupControls } from './controls.js';
import { createCameraController } from './camera.js';
import { 
  createMapBox, 
  createPelletsInstanced, 
  createPlayerCell, 
  createViruses,
  createMagnetSphere, 
  createBot,
  updateBot
} from './objects.js';
import { 
  updateCells,
  updatePlayerFade,
  updatePlayerGrowth,
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

const { playerCell, playerDefaultOpacity } = createPlayerCell(false, scene, camera);

const botCount = 25
const bots = []

for (let index = 0; index < botCount; index++) {
  const cell = createBot(scene, camera)
  bots.push(cell)
}

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
    0xff0000, // Red
    0x0077ff, // Blue
    0x00ff00, // Green
    0xffff00, // Yellow
    0x9b30ff, // Purple
    0xff9900, // Orange
    0x7ed6ff, // Light Blue
    0xff69b4  // Pink
  ];

  const PELLET_COUNT = 25000;
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

  updateFogDensity(scene, playerCell.geometry.parameters.radius * playerCell.scale.x);

  removeFogIfDevMode(scene, cameraController, pelletData);

  if (!(cameraController.isDevMode && cameraController.isDevMode())) {
    updatePlayerGrowth(playerCell, pelletData, scene, magnetSphere);
    // Update bots: move toward and eat pellets
    if (pelletData && bots) {
      for (const bot of bots) {
        updateBot(bot, pelletData);
      }
    }
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

