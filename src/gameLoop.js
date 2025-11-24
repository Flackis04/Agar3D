import { updateFogDistance, triggerFogTransition } from "./scene.js";
import { handleDevModeObjectVisibility } from "./camera.js";
import { updateBot, respawnCell, pelletMinSize } from "./objects.js";
import {
  updateCells,
  updatePlayerFade,
  updatePlayerGrowth,
  executeSplit,
  calculateCellMass,
} from "./utils/playerUtils.js";
import { emitPlayerMove } from "./multiplayer.js";
import { AudioManager } from "./audio.js";

export function createAnimationLoop(
  renderer,
  scene,
  camera,
  gameState,
  cameraController,
  controls,
  stats
) {
  let lastSplitTime = gameState.lastSplitTime;
  let lastFrameTime = performance.now();
  const audioManager = new AudioManager();

  function animate() {
    requestAnimationFrame(animate);
    if (!gameState.border) return;
    if (window.isPaused) return renderer.render(scene, camera);
    const now = performance.now();
    const deltaTime = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    handleDevModeObjectVisibility(
      scene,
      cameraController,
      gameState.pelletData,
      gameState.border
    );
    const handleCellEaten = (eatenCell) => {
      audioManager.playEatSoundSegment();
      setTimeout(() => respawnCell(eatenCell, scene), 2000);
    };
    const onPelletEaten = () =>
      triggerFogTransition(
        scene,
        cameraController.getCameraDistance(),
        cameraController.getPlayerRadius()
      );

    const allCells = [
      gameState.playerCell,
      ...gameState.botCells,
      ...gameState.cells,
    ].filter((c) => !c.userData.isEaten);
    updatePlayerGrowth(
      false,
      gameState.playerCell,
      gameState.pelletData,
      scene,
      gameState.playerCell.magnetSphere,
      gameState.playerCell.position,
      allCells,
      handleCellEaten,
      audioManager.playEatSoundSegment.bind(audioManager),
      deltaTime,
      onPelletEaten //
    );
    for (const botCell of gameState.botCells) {
      if (botCell.userData.isEaten) continue;
      updateBot(botCell, gameState.pelletData, deltaTime);
      updatePlayerGrowth(
        true,
        botCell,
        gameState.pelletData,
        scene,
        botCell.magnetSphere,
        gameState.playerCell.position,
        allCells,
        handleCellEaten,
        audioManager.playEatSoundSegment.bind(audioManager),
        deltaTime
      );
    }

    allCells.forEach((cell) => {
      updatePlayerGrowth(
        false,
        cell,
        gameState.pelletData,
        scene,
        cell.magnetSphere,
        gameState.playerCell.position,
        allCells,
        handleCellEaten,
        audioManager.playEatSoundSegment.bind(audioManager),
        deltaTime
      );
    });

    const cellResult = updateCells(
      gameState.cells,
      scene,
      gameState.playerCell,
      camera,
      controls.getForwardButtonPressed,
      controls.playerRotation,
      controls.cellRotation,
      deltaTime
    );
    controls.setViewingCell(cellResult.viewingCell);
    if (!cellResult.viewingCell)
      controls.updateCamera(
        gameState.pelletData && gameState.playerCell.pelletMagnetToggle
      );
    if (scene.userData.animateViruses)
      scene.userData.animateViruses(performance.now());
    lastSplitTime = updatePlayerFade(
      gameState.playerCell,
      lastSplitTime,
      gameState.playerDefaultOpacity,
      deltaTime
    );

    // Update fog distance every frame (handles animation)
    updateFogDistance(
      scene,
      cameraController.getCameraDistance(),
      cameraController.getPlayerRadius()
    );

    emitPlayerMove(gameState.playerCell);
    stats.begin();
    renderer.render(scene, camera);
    stats.end();
  }
  return { animate, getLastSplitTime: () => lastSplitTime };
}

export function setupSplitHandler(
  playerCell,
  camera,
  scene,
  cells,
  playerSpeed
) {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (calculateCellMass(playerCell, pelletMinSize) < 20) return;
        const newCells = executeSplit(
          playerCell,
          cells,
          camera,
          scene,
          playerSpeed
        );
        cells.length = 0;
        cells.push(...newCells);
      }
    },
    true
  );
}
