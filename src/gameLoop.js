import { updateFogDensity } from './scene.js';
import { removeFogIfDevMode } from './camera.js';
import { updateBot } from './objects.js';
import { 
  updateCells,
  updatePlayerFade,
  updatePlayerGrowth,
  executeSplit
} from './utils/playerUtils.js';
import { emitPlayerMove } from './multiplayer.js';

export function createAnimationLoop(
  renderer,
  scene,
  camera,
  gameState,
  cameraController,
  controls,
  stats
) {
  const {
    playerCell,
    playerDefaultOpacity,
    bots,
    cells,
    border,
    pelletData
  } = gameState;

  let lastSplitTime = gameState.lastSplitTime;

  const {
    updateCamera,
    getForwardButtonPressed,
    playerRotation,
    cellRotation,
    setViewingCell
  } = controls;

  function animate() {
    requestAnimationFrame(animate);

    if (!border) return;

    updateFogDensity(scene, playerCell.geometry.parameters.radius * playerCell.scale.x);
    removeFogIfDevMode(scene, cameraController, pelletData);

    if (!(cameraController.isDevMode && cameraController.isDevMode())) {
      updatePlayerGrowth(playerCell, pelletData, scene, playerCell.magnetSphere);
      // Update bots: move toward and eat pellets
      for (const bot of bots) {
        updateBot(bot, pelletData);
        updatePlayerGrowth(bot, pelletData, scene, bot.magnetSphere);
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
      const magnetActive = pelletData && playerCell.pelletMagnetToggle;
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

  return { animate, getLastSplitTime: () => lastSplitTime };
}

export function setupSplitHandler(playerCell, camera, scene, cells, playerSpeed, lastSplit, onSplit) {
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
}
