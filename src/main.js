import { createScene } from "./scene.js";
import { setupControls } from "./controls.js";
import { createCameraController } from "./camera.js";
import { createRenderer } from "./renderer.js";
import { initializeGame } from "./gameInit.js";
import { createAnimationLoop, setupSplitHandler } from "./gameLoop.js";
import { createPelletsInstanced, pelletMinSize } from "./objects.js";
import Stats from "three/addons/libs/stats.module.js";
import * as THREE from "three";
import { calculateCellMass, convertMassToRadius } from "./utils/playerUtils.js";

const canvas = document.querySelector("#c");

const renderer = createRenderer(canvas);
const { scene, camera } = createScene();
const stats = new Stats();
stats.dom.style.display = "none";
document.body.appendChild(stats.dom);

const homeScreen = document.getElementById("homeScreen");
const playerNameInput = document.getElementById("playerName");
const playButton = document.getElementById("playButton");

let savedMass = null;

const massCounter = document.createElement("div");
massCounter.id = "mass-counter";
massCounter.style.position = "fixed";
massCounter.style.left = "50%";
massCounter.style.bottom = "8%";
massCounter.style.transform = "translateX(-50%)";
massCounter.style.fontSize = "2.5rem";
massCounter.style.color = "#00e676"; // bright green
massCounter.style.textShadow = "0 2px 8px #000";
massCounter.style.pointerEvents = "none";
massCounter.style.zIndex = "1000";
massCounter.style.textAlign = "center";
massCounter.style.display = "none";

// Label and value split for animation
const massValue = document.createElement("span");
massValue.style.display = "inline-block";
massValue.style.transition = "transform 0.15s cubic-bezier(.4,1.4,.6,1)";
massCounter.appendChild(massValue);
document.body.appendChild(massCounter);

// Create leaderboard
const leaderboard = document.createElement("div");
leaderboard.id = "leaderboard";
leaderboard.style.position = "fixed";
leaderboard.style.top = "20px";
leaderboard.style.right = "20px";
leaderboard.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
leaderboard.style.padding = "15px";
leaderboard.style.borderRadius = "8px";
leaderboard.style.color = "#fff";
leaderboard.style.fontFamily = "Arial, sans-serif";
leaderboard.style.fontSize = "14px";
leaderboard.style.minWidth = "200px";
leaderboard.style.zIndex = "1000";
leaderboard.style.display = "none";
leaderboard.style.backdropFilter = "blur(5px)";
document.body.appendChild(leaderboard);

function startGame() {
  const playerName = playerNameInput.value.trim() || "Player";

  homeScreen.style.display = "none";

  canvas.style.display = "block";
  stats.dom.style.display = "block";

  initializeGame(
    scene,
    camera,
    (gameState) => {
      gameStateRef = gameState;
      const { playerCell, playerDefaultOpacity, cells } = gameState;
      // If resuming, set player mass
      if (savedMass && playerCell && playerCell.geometry) {
        const newRadius = convertMassToRadius(savedMass, pelletMinSize);
        const scale = newRadius / playerCell.geometry.parameters.radius;
        playerCell.scale.setScalar(scale);
      }
      const cameraController = createCameraController(camera, playerCell);
      const controls = setupControls(canvas, cameraController);
      const { playerSpeed, lastSplit } = controls;

      setupSplitHandler(playerCell, camera, scene, cells, playerSpeed);

      const { animate } = createAnimationLoop(
        renderer,
        scene,
        camera,
        gameState,
        cameraController,
        controls,
        stats
      );

      function updateMassCounter() {
        if (
          homeScreen.style.display !== "none" ||
          !gameState.playerCell ||
          !gameState.playerCell.geometry ||
          gameState.playerCell.userData.isEaten
        ) {
          massCounter.style.display = "none";
          massValue.textContent = "";
        } else {
          massCounter.style.display = "block";
          const r =
            gameState.playerCell.geometry.parameters.radius *
            gameState.playerCell.scale.x;
          const mass = Math.floor(calculateCellMass(playerCell, pelletMinSize));
          if (massValue.textContent !== `${mass}`) {
            massValue.textContent = `${mass}`;
            // Animate only the number
            massValue.style.transform = "scale(1.18)";
            setTimeout(() => {
              massValue.style.transform = "scale(1)";
            }, 150);
          }
        }
        requestAnimationFrame(updateMassCounter);
      }
      updateMassCounter();

      function updateLeaderboard() {
        if (
          homeScreen.style.display !== "none" ||
          !gameState.playerCell ||
          gameState.playerCell.userData.isEaten
        ) {
          leaderboard.style.display = "none";
        } else {
          leaderboard.style.display = "block";

          // Collect all cells with their mass and names
          const allEntries = [];

          // Add player
          const playerMass = Math.floor(
            calculateCellMass(gameState.playerCell, pelletMinSize)
          );
          allEntries.push({
            name: playerName,
            mass: playerMass,
            isPlayer: true,
          });

          // Add bots
          gameState.botCells.forEach((botCell, index) => {
            if (!botCell.userData.isEaten) {
              const botMass = Math.floor(
                calculateCellMass(botCell, pelletMinSize)
              );
              const botName = botCell.userData.name || `Bot ${index + 1}`;
              allEntries.push({
                name: botName,
                mass: botMass,
                isPlayer: false,
              });
            }
          });

          // Sort by mass descending
          allEntries.sort((a, b) => b.mass - a.mass);

          // Find player's rank
          const playerIndex = allEntries.findIndex((entry) => entry.isPlayer);
          const playerRank = playerIndex + 1;

          // Display top 10
          let html =
            '<div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">Leaderboard</div>';
          allEntries.slice(0, 10).forEach((entry, index) => {
            const color = entry.isPlayer ? "#00e676" : "#fff";
            const rank = index + 1;
            html += `<div style="margin: 5px 0; color: ${color}; display: flex; justify-content: space-between;">`;
            html += `<span>${rank}. ${entry.name}</span>`;
            html += `<span style="margin-left: 15px;">${entry.mass}</span>`;
            html += `</div>`;
          });

          // If player is not in top 10, add their entry
          if (playerRank > 10) {
            const playerEntry = allEntries[playerIndex];
            html += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3);"></div>`;
            html += `<div style="margin: 5px 0; color: #00e676; display: flex; justify-content: space-between;">`;
            html += `<span>${playerRank}. ${playerEntry.name}</span>`;
            html += `<span style="margin-left: 15px;">${playerEntry.mass}</span>`;
            html += `</div>`;
          }

          leaderboard.innerHTML = html;
        }
        requestAnimationFrame(updateLeaderboard);
      }
      updateLeaderboard();

      animate();
      // Clear savedMass after resuming
      if (savedMass) {
        savedMass = null;
        updatePlayButtonText();
      }
    },
    playerName
  );
}

function updatePlayButtonText() {
  if (savedMass) {
    playButton.textContent = "Resume";
  } else {
    playButton.textContent = "Play";
  }
}

updatePlayButtonText();

playButton.addEventListener("click", startGame);
playerNameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    startGame();
  }
});

playerNameInput.focus();

const escMenu = document.getElementById("escMenu");

const saveProgressButton = document.getElementById("saveProgressButton");
const resumeButton = document.getElementById("resumeButton");
let isInEscMenu = false;
let gameStateRef = null;

function checkEnemyProximity() {
  if (!gameStateRef) return false;

  const { playerCell, botCells } = gameStateRef;
  const playerPos = playerCell.position;
  const safeDistance = 50;

  for (const botCell of botCells) {
    if (botCell.userData.isEaten) continue;
    const distance = playerPos.distanceTo(botCell.position);
    if (distance < safeDistance) {
      return false;
    }
  }

  return true;
}

function updateSaveButtonState() {
  const isSafe = checkEnemyProximity();
  if (isSafe) {
    saveProgressButton.classList.add("safe");
  } else {
    saveProgressButton.classList.remove("safe");
  }
}

function toggleEscMenu() {
  isInEscMenu = !isInEscMenu;
  if (isInEscMenu) {
    escMenu.style.display = "flex";
    updateSaveButtonState();
    escMenuUpdateLoop();
  } else {
    escMenu.style.display = "none";
  }
}

let escMenuUpdateFrame = null;
function escMenuUpdateLoop() {
  if (escMenu.style.display === "flex") {
    updateSaveButtonState();
    escMenuUpdateFrame = requestAnimationFrame(escMenuUpdateLoop);
  }
}

document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && gameStateRef && !isInEscMenu) {
    toggleEscMenu();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && gameStateRef && isInEscMenu) {
    e.preventDefault();
    toggleEscMenu();
  }
});

resumeButton.addEventListener("click", () => {
  toggleEscMenu();
  // If there's saved progress, resume the game immediately
  if (savedMass) {
    startGame();
  }
});

saveProgressButton.addEventListener("click", () => {
  if (saveProgressButton.classList.contains("safe")) {
    if (
      gameStateRef &&
      gameStateRef.playerCell &&
      gameStateRef.playerCell.geometry
    ) {
      savedMass = calculateCellMass(gameStateRef.playerCell, pelletMinSize);
    }
    // Return to home screen
    escMenu.style.display = "none";
    canvas.style.display = "none";
    stats.dom.style.display = "none";
    homeScreen.style.display = "block";
    alert("Progress saved successfully!");
    updatePlayButtonText();
  } else {
    alert("Cannot save! Enemies are too close. Get at least 50 units away.");
  }
});
