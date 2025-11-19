import { 
  createMapBox, 
  createPelletsInstanced, 
  createPlayerCell, 
  createViruses,
  createMagnetSphere, 
  createBot,
  createCellSpatialGrid
} from './objects.js';
import { initNetworking, emitJoin } from './multiplayer.js';

export function initializeGame(scene, camera, onReady, playerName = 'Player') {
  createViruses(scene);

  const { cell: playerCell, playerDefaultOpacity } = createPlayerCell(false, scene, camera);

  const botCount = 25;
  const bots = [];
  const magnetRange = 4;

  for (let index = 0; index < botCount; index++) {
    const cell = createBot(scene, camera);
    const botMagnetSphere = createMagnetSphere(cell, magnetRange);
    scene.add(botMagnetSphere);
    bots.push(cell);
  }
  
  const magnetSphere = createMagnetSphere(playerCell, magnetRange);
  scene.add(magnetSphere);

  // Multiplayer integration
  initNetworking(scene);
  emitJoin(playerName, playerCell);

  const cells = [];
  let lastSplitTime = null;

  createMapBox((loadedBorder) => {
    scene.add(loadedBorder);

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
    const pelletData = createPelletsInstanced(scene, PELLET_COUNT, pelletColors);
    const cellSpatialGrid = createCellSpatialGrid();

    onReady({
      playerCell,
      playerDefaultOpacity,
      bots,
      cells,
      lastSplitTime,
      border: loadedBorder,
      pelletData,
      cellSpatialGrid
    });
  });
}
