import { 
  createMapBox, 
  createPelletsInstanced, 
  createPlayerCell, 
  createViruses,
  createMagnetSphere, 
  createBot,
  createCellSpatialGrid
} from './objects.js';
import { initNetworking, emitJoin, emitInitPellets, setupPelletSync, emitPelletEaten, emitPelletRespawn } from './multiplayer.js';

export function initializeGame(scene, camera, onReady, playerName = 'Player') {
  createViruses(scene);

  const { cell: playerCell, playerDefaultOpacity } = createPlayerCell(false, scene, camera);

  const botCount = 25;
  const botCells = [];
  const magnetRange = 4;

  for (let index = 0; index < botCount; index++) {
    const cell = createBot(scene, camera);
    const botMagnetSphere = createMagnetSphere(cell, magnetRange);
    scene.add(botMagnetSphere);
    botCells.push(cell);
  }
  
  const magnetSphere = createMagnetSphere(playerCell, magnetRange);
  scene.add(magnetSphere);

  
  initNetworking(scene);
  emitJoin(playerName, playerCell);

  const cells = [];
  let lastSplitTime = null;

  createMapBox((loadedBorder) => {
    scene.add(loadedBorder);

    const pelletColors = [
      0xff0000, 
      0x0077ff, 
      0x00ff00, 
      0xffff00, 
      0x9b30ff, 
      0xff9900, 
      0x7ed6ff, 
      0xff69b4  
    ];

    const PELLET_COUNT = 25000;
    const pelletData = createPelletsInstanced(scene, PELLET_COUNT, pelletColors);
    const cellSpatialGrid = createCellSpatialGrid();
    
    // Initialize multiplayer pellet sync
    emitInitPellets(pelletData);
    setupPelletSync(pelletData, 
      (index) => {
        // When another player eats a pellet
        pelletData.active[index] = false;
      },
      (index, position, isPowerUp) => {
        // When a pellet respawns
        pelletData.positions[index].set(position.x, position.y, position.z);
        pelletData.active[index] = true;
        pelletData.powerUps[index] = isPowerUp;
      }
    );

    onReady({
      playerCell,
      playerDefaultOpacity,
      botCells,
      cells,
      lastSplitTime,
      border: loadedBorder,
      pelletData,
      cellSpatialGrid
    });
  });
}
