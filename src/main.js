import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { createCameraController } from './camera.js';
import { createRenderer } from './renderer.js';
import { initializeGame } from './gameInit.js';
import { createAnimationLoop, setupSplitHandler } from './gameLoop.js';
import { createPelletsInstanced, pelletMinSize } from './objects.js';
import Stats from 'three/addons/libs/stats.module.js';
import * as THREE from 'three';
import { calculateCellMass } from './utils/playerUtils.js';

const canvas = document.querySelector('#c');
const renderer = createRenderer(canvas);
const { scene, camera } = createScene();
const stats = new Stats();
stats.dom.style.display = 'none'; 
document.body.appendChild(stats.dom);


const homeScreen = document.getElementById('homeScreen');
const playerNameInput = document.getElementById('playerName');
const playButton = document.getElementById('playButton');


const massCounter = document.createElement('div');
massCounter.id = 'mass-counter';
massCounter.style.position = 'fixed';
massCounter.style.left = '50%';
massCounter.style.bottom = '5%';
massCounter.style.transform = 'translateX(-50%)';
massCounter.style.fontSize = '2rem';
massCounter.style.color = '#fff';
massCounter.style.textShadow = '0 2px 8px #000';
massCounter.style.pointerEvents = 'none';
massCounter.style.zIndex = '1000';
massCounter.style.textAlign = 'center';
massCounter.innerText = '';
document.body.appendChild(massCounter);

function startGame() {
  const playerName = playerNameInput.value.trim() || 'Player';
  
  
  homeScreen.style.display = 'none';
  
  
  canvas.style.display = 'block';
  stats.dom.style.display = 'block';
  
  
  initializeGame(scene, camera, (gameState) => {
    gameStateRef = gameState; 
    const { playerCell, playerDefaultOpacity, cells } = gameState;
    const cameraController = createCameraController(camera, playerCell);
    const controls = setupControls(canvas, cameraController);
    const { playerSpeed, lastSplit } = controls;

    setupSplitHandler(playerCell, camera, scene, cells, playerSpeed);

    const { animate } = createAnimationLoop(
      renderer,
      scene,
      camera,
      gameState,
      cameraController,
      controls,
      stats
    );

      
      function updateMassCounter() {
        if (gameState.playerCell && gameState.playerCell.geometry && !gameState.playerCell.userData.isEaten) {
          
          const r = gameState.playerCell.geometry.parameters.radius * gameState.playerCell.scale.x;
          const mass = calculateCellMass(playerCell, pelletMinSize)
          massCounter.innerText = `Mass: ${Math.floor(mass)}`;
        } else {
          massCounter.innerText = '';
        }
        requestAnimationFrame(updateMassCounter);
      }
      updateMassCounter();

    animate();
  }, playerName);
}

playButton.addEventListener('click', startGame);
playerNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    startGame();
  }
});


playerNameInput.focus();


const escMenu = document.getElementById('escMenu');
const saveProgressButton = document.getElementById('saveProgressButton');
const resumeButton = document.getElementById('resumeButton');
let isPaused = false;
let gameStateRef = null;

function checkEnemyProximity() {
  if (!gameStateRef) return false;
  
  const { playerCell, botCells } = gameStateRef;
  const playerPos = playerCell.position;
  const safeDistance = 50;
  
  
  for (const botCell of botCells) {
    if (botCell.userData.isEaten) continue;
    const distance = playerPos.distanceTo(botCell.position);
    if (distance < safeDistance) {
      return false; 
    }
  }
  
  return true; 
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
  window.isPaused = isPaused; 
  if (isPaused) {
    escMenu.style.display = 'flex';
    updateSaveButtonState();
  } else {
    escMenu.style.display = 'none';
  }
}


document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && gameStateRef && !isPaused) {
    
    toggleEscMenu();
  }
});


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
    
    alert('Progress saved successfully!');
  } else {
    alert('Cannot save! Enemies are too close. Get at least 50 units away.');
  }
});

