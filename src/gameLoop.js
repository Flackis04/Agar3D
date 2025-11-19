import { updateFogDensity } from './scene.js';
import { removeFogIfDevMode } from './camera.js';
import { updateBot, respawnCell } from './objects.js';
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
    pelletData,
    cellSpatialGrid
  } = gameState;

  let lastSplitTime = gameState.lastSplitTime;
  
  // Cache fog density calculation
  let cachedFogDensity = null;
  let cachedPlayerSize = null;
  
  // Track mesh visibility state
  let meshesVisible = true;

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
    
    // Check if game is paused
    if (window.isPaused) {
      renderer.render(scene, camera);
      return;
    }

    const currentPlayerSize = playerCell.geometry.parameters.radius * playerCell.scale.x;
    
    // Only recalculate fog if player size changed significantly (>5%)
    if (!cachedPlayerSize || Math.abs(currentPlayerSize - cachedPlayerSize) / cachedPlayerSize > 0.05) {
      updateFogDensity(scene, currentPlayerSize);
      cachedPlayerSize = currentPlayerSize;
      cachedFogDensity = scene.fog?.density;
    }
    
    removeFogIfDevMode(scene, cameraController, pelletData);

    const isDevMode = cameraController.isDevMode && cameraController.isDevMode();
    
    // Handler for when a cell gets eaten
    const handleCellEaten = (eatenCell) => {
      // Respawn after 2 seconds
      setTimeout(() => {
        respawnCell(eatenCell, scene);
      }, 2000);
    };
    
    if (!isDevMode) {
      // Create combined array of all cells (player + bots + split cells)
      const allCells = [playerCell, ...bots, ...cells].filter(c => !c.userData.isEaten);
      
      // Update spatial grid with current cell positions
      if (cellSpatialGrid) {
        cellSpatialGrid.clear();
        allCells.forEach((cell, idx) => {
          const pos = cell.position;
          cellSpatialGrid.addItem(idx, pos.x, pos.y, pos.z);
        });
      }
      
      updatePlayerGrowth(false, playerCell, pelletData, scene, playerCell.magnetSphere, playerCell.position, allCells, handleCellEaten);
      // Update bots: move toward and eat pellets
      for (const bot of bots) {
        if (bot.userData.isEaten) continue;
        updateBot(bot, pelletData);
        updatePlayerGrowth(true, bot, pelletData, scene, bot.magnetSphere, playerCell.position, allCells, handleCellEaten);
      }

      // Add meshes if not visible
      if (pelletData && !meshesVisible) {
        if (pelletData.mesh) scene.add(pelletData.mesh);
        if (pelletData.meshPowerup) scene.add(pelletData.meshPowerup);
        meshesVisible = true;
      }
    } else {
      // Remove meshes if visible
      if (pelletData && meshesVisible) {
        if (pelletData.mesh) scene.remove(pelletData.mesh);
        if (pelletData.meshPowerup) scene.remove(pelletData.meshPowerup);
        meshesVisible = false;
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
