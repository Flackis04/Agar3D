import {
  createMapBox,
  createPelletsInstanced,
  createPlayerCell,
  createMagnetSphere,
  createCellSpatialGrid,
  pelletMinSize,
} from "./objects.js";
import { initNetworking, emitJoin, setupPelletSync } from "./multiplayer.js";
import { updateFogDistance, updateBorderFog } from "./scene.js";
import { calculateCameraDistanceTarget } from "./camera.js";

// Builds one playable match. It creates local Three.js objects first, then
// connects them to the multiplayer server so server updates can drive them.
export function initializeGame(scene, camera, onReady, playerName = "Player", audioManager = null) {
  const { cell: playerCell, playerDefaultOpacity } = createPlayerCell(
    false,
    scene,
    camera
  );

  const playerRadius =
    playerCell.geometry.parameters.radius *
    Math.max(playerCell.scale.x, playerCell.scale.y, playerCell.scale.z);
  const initialCameraDistance = calculateCameraDistanceTarget(playerCell, false);
  updateFogDistance(scene, initialCameraDistance, playerRadius);

  // Bots disabled for multiplayer - only players will be visible
  const botCount = 0;
  const botCells = [];
  const magnetRange = 3;

  // for (let index = 0; index < botCount; index++) {
  //   const cell = createBot(scene, camera);
  //   const botMagnetSphere = createMagnetSphere(cell, magnetRange);
  //   scene.add(botMagnetSphere);
  //   botCells.push(cell);
  // }

  const magnetSphere = createMagnetSphere(playerCell, magnetRange);
  scene.add(magnetSphere);

  // After this, multiplayer.js listens for server snapshots and applies them
  // to playerCell, pellets, and other players' meshes.
  initNetworking(scene, playerCell, audioManager, camera);
  emitJoin(playerName);

  const cells = [];
  let lastSplitTime = null;

  createMapBox((loadedBorder) => {
    scene.add(loadedBorder);

    // Update border fog uniforms to match scene fog
    updateBorderFog(scene);

    const pelletColors = [
      0xff0000, 0x0077ff, 0x00ff00, 0xffff00, 0x9b30ff, 0xff9900, 0x7ed6ff,
      0xff69b4,
    ];

    const PELLET_COUNT = 5000;
    const pelletData = createPelletsInstanced(
      scene,
      PELLET_COUNT,
      pelletColors
    );
    const cellSpatialGrid = createCellSpatialGrid();

    setupPelletSync(pelletData);

    onReady({
      playerCell,
      playerDefaultOpacity,
      botCells,
      cells,
      lastSplitTime,
      border: loadedBorder,
      pelletData,
      cellSpatialGrid,
      magnetSphere,
      audioManager,
    });
  });
}
