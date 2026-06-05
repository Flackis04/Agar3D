import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import Stats from "three/addons/libs/stats.module.js";
import { setupControls } from "./controls.js";
import { createCameraController } from "./camera.js";
import { initializeGame } from "./gameInit.js";
import { createAnimationLoop } from "./gameLoop.js";
import { pelletMinSize } from "./objects.js";
import { calculateCellMass } from "./utils/playerUtils.js";
import { otherPlayers, socket } from "./multiplayer.js";

const START_COST = 20;
const DEFAULT_BALANCE = 0;
const BALANCE_STORAGE_KEY = "agar3dBalance";
const AUTH_TOKEN_STORAGE_KEY = "agar3dAuthToken";
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

function getInitialBalance() {
  const balance = Number.parseFloat(
    localStorage.getItem(BALANCE_STORAGE_KEY) ?? `${DEFAULT_BALANCE}`,
  );
  return Number.isNaN(balance) ? DEFAULT_BALANCE : balance;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function GameScene({ playerName, onGameReady }) {
  const { scene, camera, gl } = useThree();
  const loopRef = useRef(null);
  const initializedRef = useRef(false);
  const statsRef = useRef(null);

  useEffect(() => {
    gl.toneMappingExposure = 1.1;
  }, [gl]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const stats = new Stats();
    stats.dom.style.display = "block";
    document.body.appendChild(stats.dom);
    statsRef.current = stats;

    initializeGame(
      scene,
      camera,
      (gameState) => {
        const cameraController = createCameraController(
          camera,
          gameState.playerCell
        );
        const controls = setupControls(gl.domElement, cameraController);

        loopRef.current = createAnimationLoop(
          null,
          scene,
          camera,
          gameState,
          cameraController,
          controls,
          stats
        );
        onGameReady(gameState);
      },
      playerName
    );

    return () => {
      if (statsRef.current?.dom.parentNode) {
        statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
      }
    };
  }, [camera, gl.domElement, onGameReady, playerName, scene]);

  useFrame((_, delta) => {
    loopRef.current?.tick(delta);
  });

  return null;
}

function MassCounter({ gameState, isPlaying }) {
  const [mass, setMass] = useState(null);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    if (!isPlaying || !gameState?.playerCell || gameState.playerCell.userData.isEaten) {
      setMass(null);
      return;
    }

    let frameId = null;
    const update = () => {
      if (!gameState.playerCell || gameState.playerCell.userData.isEaten) {
        setMass(null);
      } else {
        const nextMass = Math.floor(
          calculateCellMass(gameState.playerCell, pelletMinSize)
        );
        setMass((currentMass) => {
          if (currentMass !== null && currentMass !== nextMass) {
            setBump(true);
            window.setTimeout(() => setBump(false), 150);
          }
          return nextMass;
        });
      }
      frameId = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(frameId);
  }, [gameState, isPlaying]);

  if (mass === null) return null;

  return (
    <div id="mass-counter">
      <span className={bump ? "bump" : ""}>{mass}</span>
    </div>
  );
}

function Leaderboard({ gameState, playerName, isPlaying }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!isPlaying || !gameState?.playerCell || gameState.playerCell.userData.isEaten) {
      setEntries([]);
      return;
    }

    let frameId = null;
    const update = () => {
      const allEntries = [];
      const playerMass = Math.floor(
        calculateCellMass(gameState.playerCell, pelletMinSize)
      );

      allEntries.push({ name: playerName, mass: playerMass, isPlayer: true });

      gameState.botCells.forEach((botCell, index) => {
        if (!botCell.userData.isEaten) {
          allEntries.push({
            name: botCell.userData.name || `Bot ${index + 1}`,
            mass: Math.floor(calculateCellMass(botCell, pelletMinSize)),
            isPlayer: false,
          });
        }
      });

      for (const id in otherPlayers) {
        const otherPlayer = otherPlayers[id];
        if (otherPlayer.mesh && !otherPlayer.mesh.userData?.isEaten) {
          const radius =
            otherPlayer.mesh.geometry.parameters.radius * otherPlayer.mesh.scale.x;
          allEntries.push({
            name: otherPlayer.name || "Player",
            mass: Math.floor((radius / pelletMinSize) ** 3),
            isPlayer: false,
          });
        }
      }

      allEntries.sort((a, b) => b.mass - a.mass);
      setEntries(allEntries);
      frameId = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(frameId);
  }, [gameState, isPlaying, playerName]);

  if (!entries.length) return null;

  const playerRank = entries.findIndex((entry) => entry.isPlayer) + 1;
  const visibleEntries = entries.slice(0, 10);
  const playerEntry = entries[playerRank - 1];

  return (
    <div id="leaderboard">
      <div className="leaderboard-title">Leaderboard</div>
      {visibleEntries.map((entry, index) => (
        <div
          className={`leaderboard-row ${entry.isPlayer ? "is-player" : ""}`}
          key={`${entry.name}-${index}`}
        >
          <span>
            {index + 1}. {entry.name}
          </span>
          <span>{entry.mass}</span>
        </div>
      ))}
      {playerRank > 10 && playerEntry && (
        <>
          <div className="leaderboard-separator" />
          <div className="leaderboard-row is-player">
            <span>
              {playerRank}. {playerEntry.name}
            </span>
            <span>{playerEntry.mass}</span>
          </div>
        </>
      )}
    </div>
  );
}

function App() {
  const [balance, setBalance] = useState(getInitialBalance);
  const [gameState, setGameState] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEscMenuOpen, setIsEscMenuOpen] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [activePlayerName, setActivePlayerName] = useState("Player");
  const [savedMass, setSavedMass] = useState(null);
  const [saveIsSafe, setSaveIsSafe] = useState(false);
  const [walletMode, setWalletMode] = useState("deposit");
  const [walletAmount, setWalletAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0].id);
  const [cryptoAsset, setCryptoAsset] = useState(CRYPTO_ASSETS[0]);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ""
  );
  const [currentUser, setCurrentUser] = useState(null);
  const gameKey = useMemo(() => `${activePlayerName}-${Number(isPlaying)}`, [activePlayerName, isPlaying]);

  const saveBalance = useCallback((nextBalance) => {
    const normalizedBalance = Math.max(0, Math.round(nextBalance * 100) / 100);
    localStorage.setItem(BALANCE_STORAGE_KEY, `${normalizedBalance}`);
    setBalance(normalizedBalance);
  }, []);

  const saveAuth = useCallback((token, user) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    setAuthToken(token);
    setCurrentUser(user);
    if (typeof user?.balance === "number") saveBalance(user.balance);
  }, [saveBalance]);

  const authFetch = useCallback(async (path, options = {}) => {
    return fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers || {}),
      },
    });
  }, [authToken]);

  const refreshServerBalance = useCallback(async () => {
    if (!authToken) return null;
    const response = await authFetch("/api/balance");
    if (!response.ok) return null;
    const data = await response.json();
    if (typeof data.balance === "number") {
      saveBalance(data.balance);
      if (data.user) setCurrentUser(data.user);
      return data.balance;
    }
    return null;
  }, [authFetch, authToken, saveBalance]);

  useEffect(() => {
    if (!authToken) return;
    authFetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) throw new Error("Session expired");
        const data = await response.json();
        setCurrentUser(data.user);
        if (typeof data.user?.balance === "number") saveBalance(data.user.balance);
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        setAuthToken("");
        setCurrentUser(null);
      });
  }, [authFetch, authToken, saveBalance]);

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

  useEffect(() => {
    const onBalanceUpdated = ({ userId: updatedUserId, balance: nextBalance }) => {
      if (updatedUserId === currentUser?.id && typeof nextBalance === "number") {
        saveBalance(nextBalance);
      }
    };
    socket.on("balance-updated", onBalanceUpdated);
    return () => socket.off("balance-updated", onBalanceUpdated);
  }, [currentUser?.id, saveBalance]);

  const submitWalletTransfer = useCallback(async () => {
    if (!currentUser) {
      setWalletMessage("Create an account or log in before depositing.");
      return;
    }
    if (currentUser.frozen) {
      setWalletMessage("Account is frozen pending payment review.");
      return;
    }
    if (!currentUser.termsAccepted) {
      setWalletMessage("Accept the Terms before depositing.");
      return;
    }

    const amount = Number.parseFloat(walletAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWalletMessage("Enter a USD amount greater than $0.");
      return;
    }

    if (walletMode === "deposit") {
      setWalletMessage("Opening secure checkout...");
      try {
        const response = await authFetch("/api/create-checkout-session", {
          method: "POST",
          body: JSON.stringify({
            amountUsd: amount,
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

    if (
      walletMode === "withdraw" &&
      paymentMethod === "crypto" &&
      !walletAddress.trim()
    ) {
      setWalletMessage("Enter the crypto wallet address to receive funds.");
      return;
    }

    const methodLabel =
      PAYMENT_METHODS.find((method) => method.id === paymentMethod)?.label ||
      "payment method";
    setWalletMessage(
      `Withdrawals require payout-provider and legal approval before launch. Requested ${formatMoney(amount)} via ${methodLabel}${
        paymentMethod === "crypto" ? ` (${cryptoAsset})` : ""
      }.`
    );
  }, [
    authFetch,
    balance,
    cryptoAsset,
    currentUser,
    paymentMethod,
    saveBalance,
    walletAddress,
    walletAmount,
    walletMode,
  ]);

  const submitAuth = useCallback(async () => {
    setAuthMessage("");
    const path = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          acceptTerms: termsAccepted,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAuthMessage(data.error || "Authentication failed.");
        return;
      }
      saveAuth(data.token, data.user);
      setAuthPassword("");
      setAuthMessage(authMode === "register" ? "Account created." : "Logged in.");
    } catch {
      setAuthMessage("Account server is unavailable.");
    }
  }, [authEmail, authMode, authPassword, saveAuth, termsAccepted]);

  const checkEnemyProximity = useCallback(() => {
    if (!gameState) return false;
    const safeDistance = 50;
    const playerPos = gameState.playerCell.position;

    for (const botCell of gameState.botCells) {
      if (botCell.userData.isEaten) continue;
      if (playerPos.distanceTo(botCell.position) < safeDistance) return false;
    }

    return true;
  }, [gameState]);

  useEffect(() => {
    if (!isEscMenuOpen) return;
    let frameId = null;
    const update = () => {
      setSaveIsSafe(checkEnemyProximity());
      frameId = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frameId);
  }, [checkEnemyProximity, isEscMenuOpen]);

  useEffect(() => {
    const onPointerLockChange = () => {
      if (!document.pointerLockElement && gameState && !isEscMenuOpen) {
        setIsEscMenuOpen(true);
      }
    };
    document.addEventListener("pointerlockchange", onPointerLockChange);
    return () => document.removeEventListener("pointerlockchange", onPointerLockChange);
  }, [gameState, isEscMenuOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && gameState && isEscMenuOpen) {
        event.preventDefault();
        setIsEscMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameState, isEscMenuOpen]);

  const startGame = useCallback(async () => {
    if (!currentUser) {
      alert("Create an account or log in before playing.");
      return;
    }
    if (currentUser.frozen) {
      alert("Account is frozen pending payment review.");
      return;
    }
    if (!currentUser.termsAccepted) {
      alert("Accept the Terms before playing.");
      return;
    }
    if (!savedMass && balance < START_COST) {
      alert("You need $20 USD to start a game.");
      return;
    }

    if (!savedMass) {
      const response = await authFetch("/api/start-game", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Could not start paid game.");
        return;
      }
      if (typeof data.balance === "number") saveBalance(data.balance);
    }

    setActivePlayerName(playerName.trim() || "Player");
    setGameState(null);
    setIsEscMenuOpen(false);
    setIsPlaying(true);
    if (savedMass) setSavedMass(null);
  }, [authFetch, balance, currentUser, playerName, saveBalance, savedMass]);

  const saveProgress = useCallback(() => {
    if (!saveIsSafe) {
      alert("Cannot save! Enemies are too close. Get at least 50 units away.");
      return;
    }

    if (gameState?.playerCell?.geometry) {
      setSavedMass(calculateCellMass(gameState.playerCell, pelletMinSize));
    }

    setIsEscMenuOpen(false);
    setIsPlaying(false);
    setGameState(null);
    alert("Progress saved successfully!");
  }, [gameState, saveIsSafe]);

  const playButtonText = savedMass
    ? "Resume"
    : balance < START_COST
      ? "Need $20"
      : "Play - $20";

  return (
    <>
      {isPlaying && (
        <Canvas
          className="game-canvas"
          key={gameKey}
          camera={{ fov: 75, near: 0.2, far: 600 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#050010"]} />
          <fog attach="fog" args={["#050010", 0, 100]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[100, 200, 100]} intensity={1} />
          <GameScene playerName={activePlayerName} onGameReady={setGameState} />
        </Canvas>
      )}

      {!isPlaying && (
        <div id="homeScreen">
          <div id="menuContainer">
            <h1>Agar3D</h1>
            <div id="accountPanel">
              {currentUser ? (
                <>
                  <div className="account-row">
                    <span>{currentUser.email}</span>
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
                        setAuthToken("");
                        setCurrentUser(null);
                        saveBalance(0);
                      }}
                    >
                      Log out
                    </button>
                  </div>
                  {!currentUser.termsAccepted && (
                    <button
                      type="button"
                      id="termsButton"
                      onClick={async () => {
                        const response = await authFetch("/api/auth/terms", {
                          method: "POST",
                        });
                        const data = await response.json();
                        if (response.ok) {
                          setCurrentUser(data.user);
                          setAuthMessage("Terms accepted.");
                        } else {
                          setAuthMessage(data.error || "Could not accept Terms.");
                        }
                      }}
                    >
                      Accept Terms
                    </button>
                  )}
                  {currentUser.frozen && (
                    <div className="account-warning">Account frozen pending payment review.</div>
                  )}
                </>
              ) : (
                <>
                  <div className="wallet-tabs" aria-label="Account actions">
                    <button
                      className={authMode === "login" ? "active" : ""}
                      type="button"
                      onClick={() => setAuthMode("login")}
                    >
                      Login
                    </button>
                    <button
                      className={authMode === "register" ? "active" : ""}
                      type="button"
                      onClick={() => setAuthMode("register")}
                    >
                      Register
                    </button>
                  </div>
                  <input
                    type="email"
                    placeholder="Email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                  />
                  {authMode === "register" && (
                    <label className="terms-check">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(event) => setTermsAccepted(event.target.checked)}
                      />
                      <span>I accept the Terms and confirm this is not legal advice.</span>
                    </label>
                  )}
                  <button type="button" id="authButton" onClick={submitAuth}>
                    {authMode === "register" ? "Create Account" : "Log In"}
                  </button>
                </>
              )}
              {authMessage && <div className="wallet-message">{authMessage}</div>}
            </div>
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
              {playButtonText}
            </button>
          </div>
        </div>
      )}

      {isEscMenuOpen && (
        <div id="escMenu">
          <div id="escMenuContainer">
            <h2>Paused</h2>
            <button
              id="saveProgressButton"
              className={saveIsSafe ? "safe" : ""}
              onClick={saveProgress}
            >
              Save Progress
            </button>
            <button id="resumeButton" onClick={() => setIsEscMenuOpen(false)}>
              Resume
            </button>
          </div>
        </div>
      )}

      <MassCounter gameState={gameState} isPlaying={isPlaying} />
      <Leaderboard
        gameState={gameState}
        playerName={activePlayerName}
        isPlaying={isPlaying}
      />
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
