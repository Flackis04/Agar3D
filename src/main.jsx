import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PrivyProvider, useDepositAddress, usePrivy } from "@privy-io/react-auth";
import Stats from "three/addons/libs/stats.module.js";
import { setupControls } from "./controls.js";
import { createCameraController } from "./camera.js";
import { initializeGame } from "./gameInit.js";
import { createAnimationLoop } from "./gameLoop.js";
import { minBetUsd, pelletMinSize, startingMassUsd } from "./objects.js";
import { calculateCellMass } from "./utils/playerUtils.js";
import { otherPlayers, requestCashIn, socket } from "./multiplayer.js";

const MIN_BET_USD = minBetUsd;
const DEFAULT_BALANCE = 0;
const BALANCE_STORAGE_KEY = "agar3dBalance";
const AUTH_TOKEN_STORAGE_KEY = "agar3dAuthToken";
const DEFAULT_API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:3001`;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "";
const PRIVY_CLIENT_ID = import.meta.env.VITE_PRIVY_CLIENT_ID || undefined;
const PRIVY_DEPOSIT_CHAIN = import.meta.env.VITE_PRIVY_DEPOSIT_CHAIN || "eip155:8453";
const PRIVY_DEPOSIT_CURRENCY =
  import.meta.env.VITE_PRIVY_DEPOSIT_CURRENCY ||
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PRIVY_DEPOSIT_ADDRESS = import.meta.env.VITE_PRIVY_DEPOSIT_ADDRESS || "";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];
const IS_LOCAL_DEV = LOCAL_HOSTS.includes(window.location.hostname);
const CRYPTO_ASSETS = ["USDC", "USDT", "BTC", "ETH", "SOL", "BNB", "LTC", "XRP", "DOGE", "TRX"];
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

function GameScene({ playerName, startingMass, gameTicket, onGameReady }) {
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
      playerName,
      startingMass,
      gameTicket
    );

    return () => {
      if (statsRef.current?.dom.parentNode) {
        statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
      }
    };
  }, [
    camera,
    gameTicket,
    gl.domElement,
    onGameReady,
    playerName,
    scene,
    startingMass,
  ]);

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

function GameActions({ gameState, isPlaying, onCashIn }) {
  const [mass, setMass] = useState(null);

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
        setMass(calculateCellMass(gameState.playerCell, pelletMinSize));
      }
      frameId = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frameId);
  }, [gameState, isPlaying]);

  if (mass === null) return null;

  return (
    <div id="gameActions">
      <button type="button" id="cashInButton" onClick={onCashIn}>
        Cash In {formatMoney(mass)}
      </button>
    </div>
  );
}

function AppContent() {
  const { authenticated, login, ready: privyReady } = usePrivy();
  const { createDepositAddress } = useDepositAddress();
  const [balance, setBalance] = useState(getInitialBalance);
  const [gameState, setGameState] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [activePlayerName, setActivePlayerName] = useState("Player");
  const [betAmount, setBetAmount] = useState(`${startingMassUsd}`);
  const [activeStartingMass, setActiveStartingMass] = useState(startingMassUsd);
  const [activeGameTicket, setActiveGameTicket] = useState(null);
  const [savedMass, setSavedMass] = useState(null);
  const [walletMode, setWalletMode] = useState("deposit");
  const [walletAmount, setWalletAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0].id);
  const [cryptoAsset, setCryptoAsset] = useState(CRYPTO_ASSETS[0]);
  const [walletAddress, setWalletAddress] = useState("");
  const [payoutDestination, setPayoutDestination] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [apiStatus, setApiStatus] = useState("checking");
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ""
  );
  const [currentUser, setCurrentUser] = useState(null);
  const gameKey = useMemo(() => `${activePlayerName}-${Number(isPlaying)}`, [activePlayerName, isPlaying]);
  const parsedBetAmount = Number.parseFloat(betAmount);
  const selectedBet = Number.isFinite(parsedBetAmount)
    ? Math.round(parsedBetAmount * 100) / 100
    : 0;
  const betIsValid = selectedBet >= MIN_BET_USD;

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

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/health`)
      .then((response) => {
        setApiStatus(response.ok ? "online" : "offline");
      })
      .catch(() => setApiStatus("offline"));
  }, []);

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
    const sessionId = params.get("session_id");
    setWalletMessage("Payment successful. Updating balance...");

    const pollBalance = async () => {
      attempts += 1;
      let nextBalance = null;
      if (sessionId) {
        const response = await authFetch(
          `/api/checkout-session-status?session_id=${encodeURIComponent(sessionId)}`
        );
        if (response.ok) {
          const data = await response.json();
          if (typeof data.balance === "number") {
            saveBalance(data.balance);
            if (data.user) setCurrentUser(data.user);
            nextBalance = data.balance;
          }
        }
      }
      if (nextBalance === null) {
        nextBalance = await refreshServerBalance();
      }
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
  }, [authFetch, balance, refreshServerBalance, saveBalance]);

  useEffect(() => {
    const onBalanceUpdated = ({ userId: updatedUserId, balance: nextBalance }) => {
      if (updatedUserId === currentUser?.id && typeof nextBalance === "number") {
        saveBalance(nextBalance);
      }
    };
    socket.on("balance-updated", onBalanceUpdated);
    return () => socket.off("balance-updated", onBalanceUpdated);
  }, [currentUser?.id, saveBalance]);

  useEffect(() => {
    const onCashInResult = ({ ok, balance: nextBalance, amount, error }) => {
      if (!ok) {
        setWalletMessage(error || "Cash-in failed.");
        return;
      }
      if (typeof nextBalance === "number") saveBalance(nextBalance);
      setWalletMessage(`Cashed in ${formatMoney(amount)}.`);
      setIsPlaying(false);
      setGameState(null);
      setSavedMass(null);
    };
    socket.on("cash-in-result", onCashInResult);
    return () => socket.off("cash-in-result", onCashInResult);
  }, [saveBalance]);

  useEffect(() => {
    if (!isPlaying || !gameState?.playerCell) return;
    let frameId = null;
    const watchDeath = () => {
      if (gameState.playerCell?.userData?.isEaten) {
        setIsPlaying(false);
        setGameState(null);
        setSavedMass(null);
        setWalletMessage("You hit a bomb. Round ended.");
        return;
      }
      frameId = requestAnimationFrame(watchDeath);
    };
    watchDeath();
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [gameState, isPlaying]);

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
      if (paymentMethod === "crypto") {
        if (!PRIVY_APP_ID) {
          setWalletMessage("Set VITE_PRIVY_APP_ID before using Privy deposits.");
          return;
        }
        if (!PRIVY_DEPOSIT_ADDRESS) {
          setWalletMessage("Set VITE_PRIVY_DEPOSIT_ADDRESS to your receiving wallet.");
          return;
        }
        try {
          setWalletMessage("Opening Privy crypto deposit...");
          if (privyReady && !authenticated) {
            await login();
          }
          await createDepositAddress({
            destinationAddress: PRIVY_DEPOSIT_ADDRESS,
            destinationChain: PRIVY_DEPOSIT_CHAIN,
            destinationCurrency: PRIVY_DEPOSIT_CURRENCY,
          });
          setWalletMessage("Privy deposit completed. Balance credit requires confirmation handling.");
        } catch (error) {
          setWalletMessage(error?.message || "Privy deposit was cancelled or failed.");
        }
        return;
      }

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

    if (walletMode === "withdraw" && paymentMethod === "crypto" && !walletAddress.trim()) {
      setWalletMessage("Enter the crypto wallet address to receive funds.");
      return;
    }
    if (walletMode === "withdraw" && paymentMethod === "card" && !payoutDestination.trim()) {
      setWalletMessage("Enter the Mastercard payout destination.");
      return;
    }

    try {
      setWalletMessage("Submitting withdrawal...");
      const response = await authFetch("/api/request-withdrawal", {
        method: "POST",
        body: JSON.stringify({
          amountUsd: amount,
          method: paymentMethod === "crypto" ? "crypto" : "card",
          destination:
            paymentMethod === "crypto" ? walletAddress.trim() : payoutDestination.trim(),
          cryptoAsset,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setWalletMessage(data.error || "Withdrawal failed.");
        return;
      }
      if (typeof data.balance === "number") saveBalance(data.balance);
      setWalletMessage(`Withdrawal ${data.withdrawal?.status || "pending"}: ${formatMoney(amount)}.`);
      setWalletAmount("");
    } catch {
      setWalletMessage("Payment server is unavailable.");
    }
  }, [
    authFetch,
    balance,
    authenticated,
    createDepositAddress,
    cryptoAsset,
    currentUser,
    login,
    paymentMethod,
    payoutDestination,
    privyReady,
    saveBalance,
    walletAddress,
    walletAmount,
    walletMode,
  ]);

  const submitAuth = useCallback(async () => {
    setAuthMessage("");
    setApiStatus("checking");
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
        setApiStatus("online");
        setAuthMessage(data.error || "Authentication failed.");
        return;
      }
      setApiStatus("online");
      saveAuth(data.token, data.user);
      setAuthPassword("");
      setAuthMessage(authMode === "register" ? "Account created." : "Logged in.");
    } catch {
      setApiStatus("offline");
      setAuthMessage("Account server is unavailable.");
    }
  }, [authEmail, authMode, authPassword, saveAuth, termsAccepted]);

  const startGame = useCallback(async () => {
    if (!savedMass && !betIsValid) {
      alert("Minimum bet is $5 USD.");
      return;
    }

    if (IS_LOCAL_DEV) {
      setActivePlayerName(playerName.trim() || "Player");
      setActiveStartingMass(selectedBet);
      setActiveGameTicket(null);
      setGameState(null);
      window.isPaused = false;
      setIsPlaying(true);
      if (savedMass) setSavedMass(null);
      return;
    }

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
    if (!savedMass && balance < selectedBet) {
      alert(`You need ${formatMoney(selectedBet)} USD to start this game.`);
      return;
    }

    if (!savedMass) {
      const response = await authFetch("/api/start-game", {
        method: "POST",
        body: JSON.stringify({ betUsd: selectedBet }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Could not start paid game.");
        return;
      }
      if (typeof data.balance === "number") saveBalance(data.balance);
      if (data.gameTicket) setActiveGameTicket(data.gameTicket);
    } else {
      setActiveGameTicket(null);
    }

    setActivePlayerName(playerName.trim() || "Player");
    setActiveStartingMass(savedMass || selectedBet);
    setGameState(null);
    window.isPaused = false;
    setIsPlaying(true);
    if (savedMass) setSavedMass(null);
  }, [
    authFetch,
    balance,
    betIsValid,
    currentUser,
    playerName,
    saveBalance,
    savedMass,
    selectedBet,
  ]);

  const playButtonText = savedMass
    ? "Resume"
    : IS_LOCAL_DEV
      ? "Play Local"
    : !betIsValid
      ? "Minimum $5"
    : balance < selectedBet
      ? `Need ${formatMoney(selectedBet)}`
      : `Play - ${formatMoney(selectedBet)}`;

  const cashIn = useCallback(() => {
    if (!gameState?.playerCell) return;
    if (IS_LOCAL_DEV) {
      const localMass = calculateCellMass(gameState.playerCell, pelletMinSize);
      saveBalance(balance + localMass);
      setWalletMessage(`Cashed in ${formatMoney(localMass)} locally.`);
      setIsPlaying(false);
      setGameState(null);
      setSavedMass(null);
      return;
    }
    requestCashIn();
  }, [balance, gameState, saveBalance]);
  const visiblePaymentMethods =
    walletMode === "withdraw"
      ? PAYMENT_METHODS.filter((method) => ["card", "crypto"].includes(method.id))
      : PAYMENT_METHODS;

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
          <GameScene
            playerName={activePlayerName}
            startingMass={activeStartingMass}
            gameTicket={activeGameTicket}
            onGameReady={setGameState}
          />
        </Canvas>
      )}

      {!isPlaying && (
        <div id="homeScreen">
          <div id="menuContainer">
            <header id="homeHeader">
              <div>
                <h1>Agar3D</h1>
                <p>Real-money mass arena</p>
              </div>
              <div className={`api-status ${apiStatus}`}>
                API {apiStatus === "online" ? "online" : apiStatus === "offline" ? "offline" : "checking"}
              </div>
            </header>

            <div id="homeGrid">
              <section className="home-panel play-panel">
                <div className="panel-label">Play</div>
                <div id="balanceDisplay">Balance: {formatMoney(balance)} USD</div>
                <input
                  type="text"
                  id="playerName"
                  placeholder="Display name"
                  maxLength={20}
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") startGame();
                  }}
                  autoFocus
                />
                <input
                  type="number"
                  id="betAmount"
                  min={MIN_BET_USD}
                  step="0.01"
                  placeholder="Bet size USD"
                  value={betAmount}
                  onChange={(event) => setBetAmount(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") startGame();
                  }}
                />
                <div id="startCost">
                  Entry: {formatMoney(Math.max(selectedBet, 0))} USD ={" "}
                  {Math.max(selectedBet, 0).toFixed(2)} starting mass
                </div>
                <button
                  id="playButton"
                  onClick={startGame}
                  disabled={
                    !savedMass &&
                    (!betIsValid ||
                      (!IS_LOCAL_DEV && (!currentUser || balance < selectedBet)))
                  }
                >
                  {IS_LOCAL_DEV || currentUser ? playButtonText : "Log in to play"}
                </button>
              </section>

              <section id="accountPanel" className="home-panel">
                <div className="panel-label">Account</div>
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
                      onKeyDown={(event) => {
                        if (event.key === "Enter") submitAuth();
                      }}
                    />
                    {authMode === "register" && (
                      <label className="terms-check">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(event) => setTermsAccepted(event.target.checked)}
                        />
                        <span>
                          I accept the <a href="/terms.html" target="_blank" rel="noreferrer">Terms</a>.
                        </span>
                      </label>
                    )}
                    <button
                      type="button"
                      id="authButton"
                      onClick={submitAuth}
                      disabled={apiStatus === "offline"}
                    >
                      {authMode === "register" ? "Create Account" : "Log In"}
                    </button>
                  </>
                )}
                {authMessage && <div className="wallet-message">{authMessage}</div>}
              </section>

              <section id="walletPanel" className="home-panel">
                <div className="panel-label">Wallet</div>
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
                  {visiblePaymentMethods.map((method) => (
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
                  paymentMethod === "crypto" ? (
                    <div className="wallet-address">
                      {PRIVY_DEPOSIT_ADDRESS
                        ? `Privy -> ${PRIVY_DEPOSIT_CHAIN} / ${cryptoAsset}`
                        : "Configure VITE_PRIVY_DEPOSIT_ADDRESS"}
                    </div>
                  ) : (
                    <div className="provider-note">
                      Stripe Checkout opens after account login and Terms acceptance.
                    </div>
                  )
                ) : paymentMethod === "crypto" ? (
                  <input
                    type="text"
                    placeholder="Destination wallet address"
                    value={walletAddress}
                    onChange={(event) => setWalletAddress(event.target.value)}
                  />
                ) : (
                  <input
                    type="text"
                    placeholder="Mastercard payout destination"
                    value={payoutDestination}
                    onChange={(event) => setPayoutDestination(event.target.value)}
                  />
                )}
                <button type="button" id="walletButton" onClick={submitWalletTransfer}>
                  {walletMode === "deposit" ? "Deposit Funds" : "Request Withdrawal"}
                </button>
                {walletMessage && <div className="wallet-message">{walletMessage}</div>}
              </section>
            </div>
          </div>
        </div>
      )}

      <GameActions gameState={gameState} isPlaying={isPlaying} onCashIn={cashIn} />
      <Leaderboard
        gameState={gameState}
        playerName={activePlayerName}
        isPlaying={isPlaying}
      />
    </>
  );
}

function App() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID || "missing-privy-app-id"}
      clientId={PRIVY_CLIENT_ID}
      config={{
        loginMethods: ["email", "wallet"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <AppContent />
    </PrivyProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
