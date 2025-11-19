import { 
  createMapBox, 
  createPelletsInstanced, 
  createPlayerCell, 
  createViruses,
  createMagnetSphere, 
  createBot
} from './objects.js';
import { initNetworking, emitJoin } from './multiplayer.js';

export function initializeGame(scene, camera, onReady) {
  createViruses(scene);

  const { cell: playerCell, playerDefaultOpacity } = createPlayerCell(false, scene, camera);

  const botCount = 1;
  const bots = [];

  for (let index = 0; index < botCount; index++) {
    const cell = createBot(scene, camera);
    bots.push(cell);
  }
  const magnetRange = 4
  const magnetSphere = createMagnetSphere(playerCell, magnetRange);
  scene.add(magnetSphere);

  // Multiplayer integration
  const playerName = 'Player';
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

    onReady({
      playerCell,
      playerDefaultOpacity,
      bots,
      magnetSphere,
      cells,
      lastSplitTime,
      border: loadedBorder,
      pelletData
    });
  });
}
