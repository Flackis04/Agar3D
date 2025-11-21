import { updateFogDensity } from './scene.js';
import { removeFogIfDevMode } from './camera.js';
import { updateBot, respawnCell, pelletMinSize } from './objects.js';
import { 
  updateCells,
  updatePlayerFade,
  updatePlayerGrowth,
  executeSplit,
  calculateCellMass
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
  
  
  let cachedFogDensity = null;
  let cachedPlayerSize = null;
  
  
  let meshesVisible = true;

  const {
    updateCamera,
    getForwardButtonPressed,
    playerRotation,
    cellRotation,
    setViewingCell
  } = controls;

  let lastFrameTime = performance.now();
  
  
  let audioContext = null;
  let audioBuffer = null;
  let audioBufferLoading = null;
  let soundSourcePool = [];
  const MAX_CONCURRENT_SOUNDS = 16;
  
  function initAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('DEBUG: Audio context created');
    }
    
    if (audioContext.state === 'suspended') {
      console.log('DEBUG: Audio context was suspended, attempting to resume');
      audioContext.resume().then(() => {
        console.log('DEBUG: Audio context resumed successfully');
      }).catch(err => console.error('Failed to resume audio context:', err));
    }
    return audioContext;
  }
  
  
  function ensureAudioBufferLoaded() {
    if (audioBufferLoading) {
      return audioBufferLoading;
    }
    
    console.log('DEBUG: Starting to load audio buffer');
    audioBufferLoading = fetch('assets/blob.wav')
      .then(response => {
        console.log('DEBUG: Audio file fetch response:', response.status);
        return response.arrayBuffer();
      })
      .then(arrayBuffer => {
        console.log('DEBUG: Audio file loaded, decoding...');
        const ctx = initAudioContext();
        return ctx.decodeAudioData(arrayBuffer);
      })
      .then(buffer => {
        console.log('DEBUG: Audio buffer decoded successfully, duration:', buffer.duration);
        audioBuffer = buffer;
        return buffer;
      })
      .catch(err => {
        console.error('Failed to load audio buffer:', err);
        return null;
      });
    
    return audioBufferLoading;
  }
  
  
  ensureAudioBufferLoaded();
  
  
  function playEatSoundSegment(volume = 1.0, pitch = 1.0) {
    if (!audioBuffer) {
      console.log('DEBUG: Audio buffer not ready yet');
      return;
    }
    
    const ctx = initAudioContext();
    console.log(`DEBUG: Playing sound - volume: ${volume.toFixed(2)}, pitch: ${pitch.toFixed(2)}, context state: ${ctx.state}`);
    
    try {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      
      source.buffer = audioBuffer;
      gainNode.gain.value = Math.min(volume, 1.0); 
      source.playbackRate.value = pitch; 
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      
      source.start(ctx.currentTime, 2.1, 0.3);
      console.log(`DEBUG: Sound started - pool size: ${soundSourcePool.length + 1}/${MAX_CONCURRENT_SOUNDS}`);
      
      
      soundSourcePool.push(source);
      if (soundSourcePool.length > MAX_CONCURRENT_SOUNDS) {
        soundSourcePool.shift();
        console.log('DEBUG: Removed oldest sound from pool (max reached)');
      }
      
    } catch (err) {
      console.error('Failed to play eat sound:', err);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!border) return;
    
    
    if (window.isPaused) {
      renderer.render(scene, camera);
      return;
    }

    
    const now = performance.now();
    const deltaTime = (now - lastFrameTime) / 1000; 
    lastFrameTime = now;

    const currentPlayerSize = playerCell.geometry.parameters.radius * playerCell.scale.x;
    const currentPlayerMass = calculateCellMass(playerCell, pelletMinSize);
    
    
    if (!cachedPlayerSize || Math.abs(currentPlayerSize - cachedPlayerSize) / cachedPlayerSize > 0.05) {
      updateFogDensity(scene, currentPlayerMass);
      cachedPlayerSize = currentPlayerSize;
      cachedFogDensity = scene.fog?.density;
    }
    
    removeFogIfDevMode(scene, cameraController, pelletData);

    const isDevMode = cameraController.isDevMode && cameraController.isDevMode();
    
    
    const handleCellEaten = (eatenCell) => {
      console.log("HI")
      playEatSoundSegment();
      
      setTimeout(() => {
        respawnCell(eatenCell, scene);
      }, 2000);
    };
    
    
    const allCells = [playerCell, ...bots, ...cells].filter(c => !c.userData.isEaten);
    
    if (!isDevMode) {
      
      if (cellSpatialGrid) {
        cellSpatialGrid.clear();
        allCells.forEach((cell, idx) => {
          const pos = cell.position;
          cellSpatialGrid.addItem(idx, pos.x, pos.y, pos.z);
        });
      }
      
      
      let closestEnemyDistance = Infinity;
      let closestEnemyPosition = null;
      
      for (let i = 0; i < allCells.length; i++) {
        const enemy = allCells[i];
        if (enemy === playerCell) continue; 
        
        const distance = playerCell.position.distanceTo(enemy.position);
        if (distance < closestEnemyDistance) {
          closestEnemyDistance = distance;
          closestEnemyPosition = enemy.position;
        }
      }
      
      if (closestEnemyPosition) {
        
        
      }
      

      
      updatePlayerGrowth(false, playerCell, pelletData, scene, playerCell.magnetSphere, playerCell.position, allCells, handleCellEaten, playEatSoundSegment, deltaTime);
      
      
      for (const splitCell of cells) {
        if (splitCell.userData.isEaten) continue;
        updatePlayerGrowth(false, splitCell, pelletData, scene, splitCell.magnetSphere, playerCell.position, allCells, handleCellEaten, playEatSoundSegment, deltaTime);
      }

      
      if (pelletData && !meshesVisible) {
        if (pelletData.mesh) scene.add(pelletData.mesh);
        if (pelletData.meshPowerup) scene.add(pelletData.meshPowerup);
        meshesVisible = true;
      }
    } else {
      
      if (pelletData && meshesVisible) {
        if (pelletData.mesh) scene.remove(pelletData.mesh);
        if (pelletData.meshPowerup) scene.remove(pelletData.meshPowerup);
        meshesVisible = false;
      }
    }
    
    
    for (const bot of bots) {
      if (bot.userData.isEaten) continue;
      updateBot(bot, pelletData, deltaTime);
      updatePlayerGrowth(true, bot, pelletData, scene, bot.magnetSphere, playerCell.position, allCells, handleCellEaten, playEatSoundSegment, deltaTime);
    }

    const cellResult = updateCells(cells, scene, playerCell, camera, getForwardButtonPressed, playerRotation, cellRotation, deltaTime);
    setViewingCell(cellResult.viewingCell);

    if (!cellResult.viewingCell) {
      const magnetActive = pelletData && playerCell.pelletMagnetToggle;
      updateCamera(magnetActive);
    }

    if (scene.userData.animateViruses) {
      scene.userData.animateViruses(performance.now());
    }

    lastSplitTime = updatePlayerFade(playerCell, lastSplitTime, playerDefaultOpacity, deltaTime);
    emitPlayerMove(playerCell);

    stats.begin();
    renderer.render(scene, camera);
    stats.end();
  }

  return { animate, getLastSplitTime: () => lastSplitTime };
}

export function setupSplitHandler(playerCell, camera, scene, cells, playerSpeed) {
  window.addEventListener(
    'keydown',
    e => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (calculateCellMass(playerCell, pelletMinSize) < 20) {
            return;
        }
        console.log(calculateCellMass(playerCell, pelletMinSize))
        const newCells = executeSplit(playerCell, cells, camera, scene, playerSpeed);

        cells.length = 0;
        cells.push(...newCells);
      }
    },
    true
  );
}
