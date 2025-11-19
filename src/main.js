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
document.body.appendChild(stats.dom);

initializeGame(scene, camera, (gameState) => {
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
});

