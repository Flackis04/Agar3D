import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { createCameraController } from './camera.js';
import { createRenderer } from './renderer.js';
import { initializeGame } from './gameInit.js';
import { createAnimationLoop, setupSplitHandler } from './gameLoop.js';
import Stats from 'three/addons/libs/stats.module.js';

const canvas = document.querySelector('#c');
const renderer = createRenderer(canvas);
const { scene, camera } = createScene();
const stats = new Stats();
stats.dom.style.display = 'none'; // Hide stats initially
document.body.appendChild(stats.dom);

// Home screen logic
const homeScreen = document.getElementById('homeScreen');
const playerNameInput = document.getElementById('playerName');
const playButton = document.getElementById('playButton');

function startGame() {
  const playerName = playerNameInput.value.trim() || 'Player';
  
  // Hide home screen
  homeScreen.style.display = 'none';
  
  // Show canvas and stats
  canvas.style.display = 'block';
  stats.dom.style.display = 'block';
  
  // Initialize game
  initializeGame(scene, camera, (gameState) => {
    gameStateRef = gameState; // Store reference for ESC menu
    const { playerCell, playerDefaultOpacity, cells } = gameState;
    const cameraController = createCameraController(camera, playerCell);
    const controls = setupControls(canvas, cameraController);
    const { playerSpeed, lastSplit } = controls;

    const onSplit = () => {
      gameState.lastSplitTime = performance.now();
      playerCell.material.opacity = 0.2;
    };

    setupSplitHandler(playerCell, camera, scene, cells, playerSpeed, lastSplit, onSplit);

    const { animate } = createAnimationLoop(
      renderer,
      scene,
      camera,
      gameState,
      cameraController,
      controls,
      stats
    );

    animate();
  }, playerName);
}

playButton.addEventListener('click', startGame);
playerNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    startGame();
  }
});

// Focus on name input
playerNameInput.focus();

// ESC menu logic
const escMenu = document.getElementById('escMenu');
const saveProgressButton = document.getElementById('saveProgressButton');
const resumeButton = document.getElementById('resumeButton');
let isPaused = false;
let gameStateRef = null;

function checkEnemyProximity() {
  if (!gameStateRef) return false;
  
  const { playerCell, bots } = gameStateRef;
  const playerPos = playerCell.position;
  const safeDistance = 50;
  
  // Check all bots for proximity
  for (const bot of bots) {
    if (bot.userData.isEaten) continue;
    const distance = playerPos.distanceTo(bot.position);
    if (distance < safeDistance) {
      return false; // Not safe
    }
  }
  
  return true; // Safe
}

function updateSaveButtonState() {
  const isSafe = checkEnemyProximity();
  if (isSafe) {
    saveProgressButton.classList.add('safe');
  } else {
    saveProgressButton.classList.remove('safe');
  }
}

function toggleEscMenu() {
  isPaused = !isPaused;
  window.isPaused = isPaused; // Share state with game loop
  if (isPaused) {
    escMenu.style.display = 'flex';
    updateSaveButtonState();
  } else {
    escMenu.style.display = 'none';
  }
}

// Listen for pointer lock exit to show menu
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && gameStateRef && !isPaused) {
    // Pointer lock was exited (ESC was pressed), show menu
    toggleEscMenu();
  }
});

// Allow closing menu with ESC when menu is already open
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && gameStateRef && isPaused) {
    e.preventDefault();
    toggleEscMenu();
  }
});

resumeButton.addEventListener('click', () => {
  toggleEscMenu();
});

saveProgressButton.addEventListener('click', () => {
  if (saveProgressButton.classList.contains('safe')) {
    console.log('Progress saved!');
    // Add your save logic here
    alert('Progress saved successfully!');
  } else {
    alert('Cannot save! Enemies are too close. Get at least 50 units away.');
  }
});

