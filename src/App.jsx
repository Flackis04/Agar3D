import { Canvas } from "@react-three/fiber";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { calculateCellMass } from "./utils/playerUtils.js";
import { pelletMinSize } from "./objects.js";
import { otherPlayers, socket } from "./multiplayer.js";
import { GameScene } from "./GameScene.jsx";

const START_COST = 20;
const DEFAULT_BALANCE = 0;
const BALANCE_STORAGE_KEY = "agar3dBalance";
const PLAYER_ID_STORAGE_KEY = "agar3dPlayerId";
const DEFAULT_API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:3001`;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
const CRYPTO_ASSETS = ["USDC", "USDT", "ETH", "BTC"];
const PAYMENT_METHODS = [
  { id: "card", label: "Card", helper: "Visa, Mastercard, Amex" },
  { id: "wallet", label: "Wallet", helper: "Apple Pay, Google Pay" },
  { id: "bank", label: "Bank", helper: "ACH, SEPA, local bank" },
  { id: "paypal", label: "PayPal", helper: "PayPal balance or linked card" },
  { id: "crypto", label: "Crypto", helper: "Stablecoins or crypto wallet" },
];

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function getInitialBalance() {
  const balance = Number.parseFloat(
    localStorage.getItem(BALANCE_STORAGE_KEY) ?? `${DEFAULT_BALANCE}`
  );
  return Number.isNaN(balance) ? DEFAULT_BALANCE : balance;
}

function getPlayerId() {
  const savedId = localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (savedId) return savedId;
  const nextId =
    crypto.randomUUID?.() || `player-${Date.now()}-${Math.random()}`;
  localStorage.setItem(PLAYER_ID_STORAGE_KEY, nextId);
  return nextId;
}

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
  const [balance, setBalance] = useState(getInitialBalance);
  const [walletMode, setWalletMode] = useState("deposit");
  const [walletAmount, setWalletAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0].id);
  const [cryptoAsset, setCryptoAsset] = useState(CRYPTO_ASSETS[0]);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const playerId = useMemo(getPlayerId, []);
  const gameState = useRef(null);
  const isPlaying = screen === "playing";
  const gameIsMounted = screen === "playing" || screen === "paused";
  const handleGameReady = useCallback((state) => {
    gameState.current = state;
  }, []);

  const saveBalance = useCallback((nextBalance) => {
    const normalizedBalance = Math.max(0, Math.round(nextBalance * 100) / 100);
    localStorage.setItem(BALANCE_STORAGE_KEY, `${normalizedBalance}`);
    setBalance(normalizedBalance);
  }, []);

  const refreshServerBalance = useCallback(async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/balance?playerId=${encodeURIComponent(playerId)}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (typeof data.balance === "number") {
      saveBalance(data.balance);
      return data.balance;
    }
    return null;
  }, [playerId, saveBalance]);

  useEffect(() => {
    refreshServerBalance().catch(() => {});
  }, [refreshServerBalance]);

  useEffect(() => {
    const onBalanceUpdated = ({ playerId: updatedPlayerId, balance: nextBalance }) => {
      if (updatedPlayerId === playerId && typeof nextBalance === "number") {
        saveBalance(nextBalance);
      }
    };
    socket.on("balance-updated", onBalanceUpdated);
    return () => socket.off("balance-updated", onBalanceUpdated);
  }, [playerId, saveBalance]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    if (paymentStatus === "cancelled") {
      setWalletMessage("Payment was cancelled.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (paymentStatus !== "success") return;

    let cancelled = false;
    let attempts = 0;
    const previousBalance = balance;
    setWalletMessage("Payment successful. Updating balance...");

    const pollBalance = async () => {
      attempts += 1;
      const nextBalance = await refreshServerBalance();
      if (cancelled) return;

      if (typeof nextBalance === "number" && nextBalance > previousBalance) {
        setWalletMessage("Payment added to your balance.");
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      if (attempts < 10) {
        window.setTimeout(pollBalance, 1000);
      } else {
        setWalletMessage("Payment succeeded. Waiting for Stripe confirmation...");
      }
    };

    pollBalance().catch(() => {
      if (!cancelled) setWalletMessage("Payment succeeded. Balance refresh failed.");
    });

    return () => {
      cancelled = true;
    };
  }, [balance, refreshServerBalance]);

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

  const submitWalletTransfer = useCallback(async () => {
    const amount = Number.parseFloat(walletAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWalletMessage("Enter a USD amount greater than $0.");
      return;
    }

    if (walletMode === "deposit") {
      setWalletMessage("Opening secure checkout...");
      try {
        const response = await fetch(`${API_BASE_URL}/api/create-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountUsd: amount,
            playerId,
            paymentMethod,
            returnUrl: window.location.origin,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          setWalletMessage(data.error || "Could not start checkout.");
          return;
        }
        window.location.href = data.url;
      } catch {
        setWalletMessage("Payment server is unavailable.");
      }
      return;
    }

    if (paymentMethod === "crypto" && !walletAddress.trim()) {
      setWalletMessage("Enter the crypto wallet address to receive funds.");
      return;
    }

    if (amount > balance) {
      setWalletMessage("Insufficient USD balance for that withdrawal.");
      return;
    }

    saveBalance(balance - amount);
    setWalletAmount("");
    const methodLabel =
      PAYMENT_METHODS.find((method) => method.id === paymentMethod)?.label ||
      "payment method";
    setWalletMessage(
      `Withdrawal requested for ${formatMoney(amount)} via ${methodLabel}${
        paymentMethod === "crypto" ? ` (${cryptoAsset})` : ""
      }.`
    );
  }, [
    balance,
    cryptoAsset,
    paymentMethod,
    playerId,
    saveBalance,
    walletAddress,
    walletAmount,
    walletMode,
  ]);

  function startGame() {
    if (!savedMass && balance < START_COST) {
      window.alert("You need $20 USD to start a game.");
      return;
    }

    if (!savedMass) {
      saveBalance(balance - START_COST);
    }

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
            <div id="balanceDisplay">Balance: {formatMoney(balance)} USD</div>
            <div id="walletPanel">
              <div className="wallet-tabs" aria-label="Wallet actions">
                <button
                  className={walletMode === "deposit" ? "active" : ""}
                  type="button"
                  onClick={() => setWalletMode("deposit")}
                >
                  Deposit
                </button>
                <button
                  className={walletMode === "withdraw" ? "active" : ""}
                  type="button"
                  onClick={() => setWalletMode("withdraw")}
                >
                  Withdraw
                </button>
              </div>
              <div className="payment-methods" aria-label="Payment methods">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    className={paymentMethod === method.id ? "active" : ""}
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id)}
                    title={method.helper}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
              <div className="wallet-row">
                {paymentMethod === "crypto" ? (
                  <select
                    value={cryptoAsset}
                    onChange={(event) => setCryptoAsset(event.target.value)}
                  >
                    {CRYPTO_ASSETS.map((asset) => (
                      <option key={asset} value={asset}>
                        {asset}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="method-chip">
                    {
                      PAYMENT_METHODS.find((method) => method.id === paymentMethod)
                        ?.helper
                    }
                  </div>
                )}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="USD amount"
                  value={walletAmount}
                  onChange={(event) => setWalletAmount(event.target.value)}
                />
              </div>
              {walletMode === "deposit" ? (
                <div className="provider-note">
                  Secure checkout opens with your selected method. The game balance updates after Stripe verifies payment.
                </div>
              ) : paymentMethod === "crypto" ? (
                <input
                  type="text"
                  placeholder="Destination wallet address"
                  value={walletAddress}
                  onChange={(event) => setWalletAddress(event.target.value)}
                />
              ) : (
                <div className="provider-note">
                  Production withdrawals need a payout provider such as Stripe Connect, PayPal Payouts, or Coinbase payouts.
                </div>
              )}
              <button type="button" id="walletButton" onClick={submitWalletTransfer}>
                {walletMode === "deposit" ? "Credit Deposit" : "Send Withdrawal"}
              </button>
              {walletMessage && <div className="wallet-message">{walletMessage}</div>}
            </div>
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
            <div id="startCost">Start cost: $20 USD = 20 starting mass</div>
            <button
              id="playButton"
              onClick={startGame}
              disabled={!savedMass && balance < START_COST}
            >
              {savedMass ? "Resume" : balance < START_COST ? "Need $20" : "Play - $20"}
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
