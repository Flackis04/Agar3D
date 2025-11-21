import { updateFogDensity } from './scene.js';
import { handleDevModeObjectVisibility } from './camera.js';
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
    botCells,
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
    }
    
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
      }).catch(err => console.error('Failed to resume audio context:', err));
    }
    return audioContext;
  }
  
  
  function ensureAudioBufferLoaded() {
    if (audioBufferLoading) {
      return audioBufferLoading;
    }
    
    audioBufferLoading = fetch('assets/blob.wav')
      .then(response => {
        return response.arrayBuffer();
      })
      .then(arrayBuffer => {
        const ctx = initAudioContext();
        return ctx.decodeAudioData(arrayBuffer);
      })
      .then(buffer => {
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
    
    try {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      
      source.buffer = audioBuffer;
      gainNode.gain.value = Math.min(volume, 1.0); 
      source.playbackRate.value = pitch; 
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      
      source.start(ctx.currentTime, 2.1, 0.3);
      
      
      soundSourcePool.push(source);
      if (soundSourcePool.length > MAX_CONCURRENT_SOUNDS) {
        soundSourcePool.shift();
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

    const currentPlayerMass = calculateCellMass(playerCell, pelletMinSize);
    
    handleDevModeObjectVisibility(scene, cameraController, pelletData, border);    
    
    const handleCellEaten = (eatenCell) => {
      playEatSoundSegment();
      
      setTimeout(() => {
        respawnCell(eatenCell, scene);
      }, 2000);
    };
    
    const onPelletEaten = () => {
      const mass = calculateCellMass(playerCell, pelletMinSize);
      updateFogDensity(scene, mass);
    };
    
    
    const allCells = [playerCell, ...botCells, ...cells].filter(c => !c.userData.isEaten);
    
    // Update player growth (eating pellets)
    updatePlayerGrowth(false, playerCell, pelletData, scene, playerCell.magnetSphere, playerCell.position, allCells, handleCellEaten, playEatSoundSegment, deltaTime, onPelletEaten);
        
    for (const botCell of botCells) {
      if (botCell.userData.isEaten) continue;
      updateBot(botCell, pelletData, deltaTime);
      updatePlayerGrowth(true, botCell, pelletData, scene, botCell.magnetSphere, playerCell.position, allCells, handleCellEaten, playEatSoundSegment, deltaTime);
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
