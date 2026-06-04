import { Canvas } from "@react-three/fiber";
import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { calculateCellMass } from "./utils/playerUtils.js";
import { pelletMinSize } from "./objects.js";
import { otherPlayers, socket } from "./multiplayer.js";
import { GameScene } from "./GameScene.jsx";

function useTimedTick(enabled, callback, intervalMs = 250) {
  useEffect(() => {
    if (!enabled) return undefined;

    callback();
    const intervalId = window.setInterval(callback, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [callback, enabled, intervalMs]);
}

function MassCounter({ gameState, visible }) {
  const [mass, setMass] = useState(null);
  const [pulse, setPulse] = useState(false);

  const updateMass = useCallback(() => {
    const playerCell = gameState.current?.playerCell;
    if (!visible || !playerCell?.geometry || playerCell.userData.isEaten) {
      setMass(null);
      return;
    }

    const nextMass = Math.floor(calculateCellMass(playerCell, pelletMinSize));
    setMass((currentMass) => {
      if (currentMass !== nextMass) {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 150);
      }
      return nextMass;
    });
  }, [gameState, visible]);

  useTimedTick(visible, updateMass, 150);

  if (mass === null) return null;

  return (
    <div id="mass-counter">
      <span className={pulse ? "mass-value pulse" : "mass-value"}>{mass}</span>
    </div>
  );
}

function Leaderboard({ gameState, playerName, visible }) {
  const [entries, setEntries] = useState([]);

  const updateLeaderboard = useCallback(() => {
    const state = gameState.current;
    const playerCell = state?.playerCell;
    if (!visible || !playerCell || playerCell.userData.isEaten) {
      setEntries([]);
      return;
    }

    const nextEntries = [
      {
        name: playerName || "Player",
        mass: Math.floor(calculateCellMass(playerCell, pelletMinSize)),
        isPlayer: true,
      },
    ];

    state.botCells.forEach((botCell, index) => {
      if (botCell.userData.isEaten) return;
      nextEntries.push({
        name: botCell.userData.name || `Bot ${index + 1}`,
        mass: Math.floor(calculateCellMass(botCell, pelletMinSize)),
        isPlayer: false,
      });
    });

    for (const id in otherPlayers) {
      const otherPlayer = otherPlayers[id];
      if (!otherPlayer.mesh || otherPlayer.mesh.userData?.isEaten) continue;
      const otherPlayerRadius =
        otherPlayer.mesh.geometry.parameters.radius * otherPlayer.mesh.scale.x;
      nextEntries.push({
        name: otherPlayer.name || "Player",
        mass: Math.floor((otherPlayerRadius / pelletMinSize) ** 3),
        isPlayer: false,
      });
    }

    nextEntries.sort((a, b) => b.mass - a.mass);
    setEntries(nextEntries);
  }, [gameState, playerName, visible]);

  useTimedTick(visible, updateLeaderboard, 500);

  if (!visible || entries.length === 0) return null;

  const playerRank = entries.findIndex((entry) => entry.isPlayer) + 1;
  const visibleEntries = entries.slice(0, 10);
  const playerOutsideTopTen = playerRank > 10 ? entries[playerRank - 1] : null;

  return (
    <div id="leaderboard">
      <div className="leaderboard-title">Leaderboard</div>
      {visibleEntries.map((entry, index) => (
        <div
          className={entry.isPlayer ? "leaderboard-row player" : "leaderboard-row"}
          key={`${entry.name}-${index}`}
        >
          <span>
            {index + 1}. {entry.name}
          </span>
          <span>{entry.mass}</span>
        </div>
      ))}
      {playerOutsideTopTen && (
        <>
          <div className="leaderboard-divider" />
          <div className="leaderboard-row player">
            <span>
              {playerRank}. {playerOutsideTopTen.name}
            </span>
            <span>{playerOutsideTopTen.mass}</span>
          </div>
        </>
      )}
    </div>
  );
}

function UpgradePanel({ visible }) {
  const [upgradeState, setUpgradeState] = useState(null);

  useEffect(() => {
    function onUpgradeState(state) {
      setUpgradeState(state);
    }

    socket.on("upgrade-state", onUpgradeState);
    return () => {
      socket.off("upgrade-state", onUpgradeState);
    };
  }, []);

  if (!visible || !upgradeState?.upgrades) return null;

  return (
    <div id="upgrade-panel">
      <div className="upgrade-title">Upgrades</div>
      <div className="upgrade-mass">Mass {upgradeState.mass}</div>
      {Object.entries(upgradeState.upgrades).map(([key, upgrade]) => {
        const isMaxed = upgrade.level >= upgrade.maxLevel;
        const canBuy = !isMaxed && upgradeState.mass >= upgrade.cost;
        return (
          <button
            className={canBuy ? "upgrade-row affordable" : "upgrade-row"}
            key={key}
            onClick={() => socket.emit("buy-upgrade", { key })}
            disabled={isMaxed}
          >
            <span>{upgrade.label}</span>
            <span>
              {upgrade.level}/{upgrade.maxLevel}
              {isMaxed ? " MAX" : ` - ${upgrade.cost}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlayerHpHud({ visible }) {
  const [hpState, setHpState] = useState({ hp: 100, maxHp: 100 });

  useEffect(() => {
    function onLocalPlayerState(event) {
      setHpState({
        hp: event.detail?.hp ?? 100,
        maxHp: event.detail?.maxHp ?? 100,
      });
    }

    window.addEventListener("local-player-state", onLocalPlayerState);
    return () => {
      window.removeEventListener("local-player-state", onLocalPlayerState);
    };
  }, []);

  if (!visible) return null;

  const ratio = Math.max(0, Math.min(1, hpState.hp / Math.max(1, hpState.maxHp)));
  const hpLabel = `${Math.ceil(hpState.hp)} / ${Math.ceil(hpState.maxHp)}`;

  return (
    <div id="player-hp-hud">
      <div className="player-hp-label">
        <span>HP</span>
        <span>{hpLabel}</span>
      </div>
      <div className="player-hp-track">
        <div
          className="player-hp-fill"
          style={{
            width: `${ratio * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

function MassGainPopups({ visible }) {
  const [popups, setPopups] = useState([]);
  const lastMassRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      lastMassRef.current = null;
      setPopups([]);
    }
  }, [visible]);

  useEffect(() => {
    function onLocalPlayerState(event) {
      const mass = event.detail?.mass;
      if (typeof mass !== "number") return;

      const previousMass = lastMassRef.current;
      lastMassRef.current = mass;
      if (previousMass === null || mass <= previousMass) return;

      const gained = Math.floor(mass - previousMass);
      if (gained <= 0) return;

      const id = `${Date.now()}-${Math.random()}`;
      setPopups((current) => [...current.slice(-4), { id, gained }]);
      window.setTimeout(() => {
        setPopups((current) => current.filter((popup) => popup.id !== id));
      }, 850);
    }

    window.addEventListener("local-player-state", onLocalPlayerState);
    return () => {
      window.removeEventListener("local-player-state", onLocalPlayerState);
    };
  }, []);

  if (!visible || popups.length === 0) return null;

  return (
    <div id="mass-gain-popups">
      {popups.map((popup) => (
        <div className="mass-gain-popup" key={popup.id}>
          +{popup.gained}
        </div>
      ))}
    </div>
  );
}

function DevControls({ visible }) {
  if (!visible) return null;

  return (
    <div id="dev-controls">
      <button
        id="dev-tp-near-player"
        type="button"
        onClick={() => socket.emit("dev-teleport-near-player")}
      >
        TP Near Player
      </button>
    </div>
  );
}

function Crosshair({ visible }) {
  if (!visible) return null;

  return <div id="crosshair" aria-hidden="true" />;
}

export function App() {
  // App owns the menu-level state. The Three.js world only exists while the
  // screen is "playing" or "paused"; returning home unmounts the Canvas.
  const [screen, setScreen] = useState("home");
  const [playerName, setPlayerName] = useState("");
  const [savedMass, setSavedMass] = useState(null);
  const [isSafeToSave, setIsSafeToSave] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const gameState = useRef(null);
  const isPlaying = screen === "playing";
  const gameIsMounted = screen === "playing" || screen === "paused";
  const handleGameReady = useCallback((state) => {
    gameState.current = state;
  }, []);

  const checkEnemyProximity = useCallback(() => {
    const state = gameState.current;
    if (!state?.playerCell) return false;

    const safeDistance = 50;
    for (const botCell of state.botCells) {
      if (botCell.userData.isEaten) continue;
      if (state.playerCell.position.distanceTo(botCell.position) < safeDistance) {
        return false;
      }
    }

    return true;
  }, []);

  useTimedTick(screen === "paused", () => {
    setIsSafeToSave(checkEnemyProximity());
  }, 250);

  useEffect(() => {
    window.isPaused = screen === "paused";
  }, [screen]);

  useEffect(() => {
    function onPlayerDied() {
      gameState.current = null;
      setScreen("home");
    }

    socket.on("player-died", onPlayerDied);
    return () => {
      socket.off("player-died", onPlayerDied);
    };
  }, []);

  useEffect(() => {
    function onPointerLockChange() {
      if (
        gameState.current &&
        screen === "playing" &&
        !document.pointerLockElement
      ) {
        setScreen("paused");
      }
    }

    function onKeyDown(event) {
      if (event.key === "Escape" && screen === "paused") {
        event.preventDefault();
        setScreen("playing");
      }
    }

    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [screen]);

  function startGame() {
    // Changing sessionKey forces GameScene to mount fresh, which creates a
    // new match instead of reusing old Three.js objects.
    gameState.current = null;
    setSessionKey((key) => key + 1);
    setScreen("playing");
  }

  function saveProgress() {
    const playerCell = gameState.current?.playerCell;
    if (!isSafeToSave || !playerCell?.geometry) {
      window.alert("Cannot save! Enemies are too close. Get at least 50 units away.");
      return;
    }

    setSavedMass(calculateCellMass(playerCell, pelletMinSize));
    setScreen("home");
    window.alert("Progress saved successfully!");
  }

  return (
    <>
      {gameIsMounted && (
        <Canvas
          camera={{ fov: 75, near: 0.2, far: 1000 }}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.1;
          }}
        >
          <GameScene
            key={sessionKey}
            playerName={playerName.trim() || "Player"}
            onReady={handleGameReady}
          />
        </Canvas>
      )}

      {screen === "home" && (
        <div id="homeScreen">
          <div id="menuContainer">
            <h1>Agar3D</h1>
            <input
              type="text"
              id="playerName"
              placeholder="Enter your name"
              maxLength={20}
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") startGame();
              }}
              autoFocus
            />
            <button id="playButton" onClick={startGame}>
              {savedMass ? "Resume" : "Play"}
            </button>
          </div>
        </div>
      )}

      {screen === "paused" && (
        <div id="escMenu">
          <div id="escMenuContainer">
            <h2>Paused</h2>
            <button
              id="saveProgressButton"
              className={isSafeToSave ? "safe" : ""}
              onClick={saveProgress}
            >
              Save Progress
            </button>
            <button id="resumeButton" onClick={() => setScreen("playing")}>
              Resume
            </button>
          </div>
        </div>
      )}

      <MassCounter gameState={gameState} visible={isPlaying} />
      <MassGainPopups visible={isPlaying} />
      <Crosshair visible={isPlaying} />
      <PlayerHpHud visible={isPlaying} />
      <DevControls visible={isPlaying} />
      <Leaderboard
        gameState={gameState}
        playerName={playerName.trim() || "Player"}
        visible={isPlaying}
      />
      <UpgradePanel visible={isPlaying} />
    </>
  );
}
