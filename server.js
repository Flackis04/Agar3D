import "dotenv/config";
import { Server } from "socket.io";
import http from "http";
import crypto from "crypto";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const databasePath = process.env.DATABASE_PATH || "./data/agar3d.sqlite";
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204);
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/api/auth/register") {
      await registerUser(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/auth/login") {
      await loginUser(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/auth/me") {
      sendCurrentUser(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/auth/terms") {
      await acceptTerms(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/create-checkout-session") {
      await createCheckoutSession(req, res);
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/checkout-session-status")) {
      await sendCheckoutSessionStatus(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/stripe-webhook") {
      await handleStripeWebhook(req, res);
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/balance")) {
      sendPlayerBalance(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/request-withdrawal") {
      await requestWithdrawal(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/start-game") {
      await startPaidGame(req, res);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
});
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8,
});

const WORLD_SIZE = 250;
const HALF_WORLD = WORLD_SIZE / 2;
const DEFAULT_STARTING_MASS_USD = 20;
const MIN_BET_USD = 5;
const BASE_SPEED = 10; // units per second
const SPEED_FALLOFF = 0.15;
const PELLET_COUNT = 100000;
const PELLET_MIN_RADIUS = 0.03;
const PELLET_MAX_RADIUS = 0.04;
const PELLET_GRID_SIZE = 4;
const POWERUP_RATIO = 0.15;
const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;

const pelletVolume = (4 / 3) * Math.PI * Math.pow(PELLET_MIN_RADIUS, 3);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    frozen INTEGER NOT NULL DEFAULT 0,
    terms_accepted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    type TEXT NOT NULL,
    provider TEXT,
    provider_reference TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    payment_intent TEXT,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    method TEXT NOT NULL,
    destination TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization,Content-Type,Stripe-Signature"
  );
}

function sendJson(res, statusCode, payload = {}) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const rawBody = await readRawBody(req);
  if (!rawBody.length) return {};
  return JSON.parse(rawBody.toString("utf8"));
}

function normalizeMoneyAmount(amount) {
  const normalized = Math.round(Number(amount) * 100) / 100;
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function dollarsToCents(amount) {
  const normalized = normalizeMoneyAmount(amount);
  return normalized ? Math.round(normalized * 100) : null;
}

function centsToDollars(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

function normalizeEmail(email) {
  const normalized = `${email || ""}`.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto
    .pbkdf2Sync(`${password || ""}`, salt, 210000, 32, "sha512")
    .toString("hex");
  return { salt, passwordHash };
}

function verifyPassword(password, user) {
  const { passwordHash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(
    Buffer.from(passwordHash, "hex"),
    Buffer.from(user.password_hash, "hex")
  );
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    balance: centsToDollars(user.balance_cents),
    frozen: Boolean(user.frozen),
    termsAccepted: Boolean(user.terms_accepted_at),
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, userId, expiresAt);
  return { token, expiresAt };
}

function getAuthToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function getUserByToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > CURRENT_TIMESTAMP
  `).get(token);
  return row || null;
}

function requireUser(req, res) {
  const user = getUserByToken(getAuthToken(req));
  if (!user) {
    sendJson(res, 401, { error: "Authentication required." });
    return null;
  }
  return user;
}

function getCheckoutReturnUrl(value) {
  try {
    const url = new URL(value || clientUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return clientUrl;
    }
    return url.origin;
  } catch {
    return clientUrl;
  }
}

function setUserFrozen(userId, frozen, note) {
  db.prepare("UPDATE users SET frozen = ? WHERE id = ?").run(frozen ? 1 : 0, userId);
  if (note) {
    addLedgerEntry({
      userId,
      amountCents: 0,
      type: frozen ? "account_frozen" : "account_unfrozen",
      notes: note,
    });
  }
}

function addLedgerEntry({
  userId,
  amountCents,
  type,
  provider = null,
  providerReference = null,
  notes = null,
}) {
  db.prepare(`
    INSERT INTO ledger_entries
      (id, user_id, amount_cents, type, provider, provider_reference, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    userId,
    amountCents,
    type,
    provider,
    providerReference,
    notes
  );
}

function adjustUserBalance({
  userId,
  amountCents,
  type,
  provider = null,
  providerReference = null,
  notes = null,
}) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return null;
  const nextBalanceCents = Math.max(0, user.balance_cents + amountCents);
  db.prepare("UPDATE users SET balance_cents = ? WHERE id = ?").run(
    nextBalanceCents,
    userId
  );
  addLedgerEntry({
    userId,
    amountCents,
    type,
    provider,
    providerReference,
    notes,
  });
  const balance = centsToDollars(nextBalanceCents);
  io.emit("balance-updated", { userId, balance });
  return balance;
}

function createWithdrawalRequest({
  userId,
  amountCents,
  method,
  destination = null,
}) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO withdrawals
      (id, user_id, amount_cents, method, destination, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(id, userId, amountCents, method, destination);
  return id;
}

async function requestWithdrawal(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.frozen) {
    sendJson(res, 403, { error: "Account is frozen pending payment review." });
    return;
  }
  if (!user.terms_accepted_at) {
    sendJson(res, 403, { error: "Terms must be accepted before withdrawing." });
    return;
  }

  const { amountUsd, method, destination, cryptoAsset } = await readJsonBody(req);
  const amountCents = dollarsToCents(amountUsd);
  if (!amountCents) {
    sendJson(res, 400, { error: "Enter a valid withdrawal amount." });
    return;
  }
  if (amountCents > user.balance_cents) {
    sendJson(res, 402, { error: "Insufficient balance." });
    return;
  }

  const normalizedMethod = `${method || ""}`.toLowerCase();
  if (!["card", "crypto"].includes(normalizedMethod)) {
    sendJson(res, 400, { error: "Choose Mastercard/card or crypto withdrawal." });
    return;
  }
  const payoutDestination =
    normalizedMethod === "crypto"
      ? `${cryptoAsset || "CRYPTO"}:${destination || ""}`.trim()
      : `${destination || "card payout method on file"}`;
  if (normalizedMethod === "crypto" && !destination) {
    sendJson(res, 400, { error: "Enter a crypto wallet address." });
    return;
  }

  const withdrawalId = createWithdrawalRequest({
    userId: user.id,
    amountCents,
    method: normalizedMethod,
    destination: payoutDestination,
  });
  const balance = adjustUserBalance({
    userId: user.id,
    amountCents: -amountCents,
    type: "withdrawal_requested",
    provider: normalizedMethod,
    providerReference: withdrawalId,
    notes: `Withdrawal requested via ${normalizedMethod}.`,
  });
  sendJson(res, 200, {
    balance,
    withdrawal: {
      id: withdrawalId,
      amount: centsToDollars(amountCents),
      method: normalizedMethod,
      status: "pending",
    },
  });
}

async function registerUser(req, res) {
  const { email, password, acceptTerms } = await readJsonBody(req);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || `${password || ""}`.length < 8) {
    sendJson(res, 400, { error: "Valid email and 8+ character password required." });
    return;
  }
  if (!acceptTerms) {
    sendJson(res, 400, { error: "Terms must be accepted before creating an account." });
    return;
  }

  const { salt, passwordHash } = hashPassword(password);
  const userId = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, salt, terms_accepted_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, normalizedEmail, passwordHash, salt);
  } catch {
    sendJson(res, 409, { error: "An account with that email already exists." });
    return;
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const session = createSession(user.id);
  sendJson(res, 201, { user: publicUser(user), token: session.token });
}

async function loginUser(req, res) {
  const { email, password } = await readJsonBody(req);
  const normalizedEmail = normalizeEmail(email);
  const user = normalizedEmail
    ? db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail)
    : null;
  if (!user || !verifyPassword(password, user)) {
    sendJson(res, 401, { error: "Invalid email or password." });
    return;
  }

  const session = createSession(user.id);
  sendJson(res, 200, { user: publicUser(user), token: session.token });
}

function sendCurrentUser(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  sendJson(res, 200, { user: publicUser(user) });
}

async function acceptTerms(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  db.prepare("UPDATE users SET terms_accepted_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    user.id
  );
  const updatedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  sendJson(res, 200, { user: publicUser(updatedUser) });
}

async function createCheckoutSession(req, res) {
  if (!stripe) {
    sendJson(res, 503, { error: "Stripe is not configured." });
    return;
  }

  const user = requireUser(req, res);
  if (!user) return;
  if (user.frozen) {
    sendJson(res, 403, { error: "Account is frozen pending payment review." });
    return;
  }
  if (!user.terms_accepted_at) {
    sendJson(res, 403, { error: "Terms must be accepted before depositing." });
    return;
  }

  const {
    amountUsd,
    paymentMethod = "auto",
    returnUrl,
  } = await readJsonBody(req);
  const normalizedAmount = normalizeMoneyAmount(amountUsd);
  if (!normalizedAmount) {
    sendJson(res, 400, { error: "amountUsd is required." });
    return;
  }

  const checkoutReturnUrl = getCheckoutReturnUrl(returnUrl);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${checkoutReturnUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${checkoutReturnUrl}?payment=cancelled`,
    payment_method_types:
      paymentMethod === "card" ? ["card"] : undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(normalizedAmount * 100),
          product_data: {
            name: "Agar3D USD balance",
            description: "Funds usable as in-game mass.",
          },
        },
      },
    ],
    metadata: {
      userId: user.id,
      amountUsd: `${normalizedAmount}`,
    },
  });

  sendJson(res, 200, { url: session.url });
}

function creditStripeCheckoutSession(session) {
  if (session.payment_status !== "paid") return null;

  const userId = session.metadata?.userId;
  const amountUsd = normalizeMoneyAmount(session.metadata?.amountUsd);
  const providerReference = session.payment_intent || session.id;
  if (!userId || !amountUsd || !providerReference) return null;

  const existingEntry = db.prepare(`
    SELECT id FROM ledger_entries
    WHERE provider = 'stripe' AND provider_reference = ?
    LIMIT 1
  `).get(providerReference);
  if (existingEntry) {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    return centsToDollars(user?.balance_cents || 0);
  }

  return adjustUserBalance({
    userId,
    amountCents: Math.round(amountUsd * 100),
    type: "deposit",
    provider: "stripe",
    providerReference,
    notes: `Stripe checkout session ${session.id}`,
  });
}

async function sendCheckoutSessionStatus(req, res) {
  if (!stripe) {
    sendJson(res, 503, { error: "Stripe is not configured." });
    return;
  }

  const user = requireUser(req, res);
  if (!user) return;

  const url = new URL(req.url, "http://localhost");
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    sendJson(res, 400, { error: "session_id is required." });
    return;
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.userId !== user.id) {
    sendJson(res, 403, { error: "Checkout session does not belong to this account." });
    return;
  }

  const balance = creditStripeCheckoutSession(session);
  const updatedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  sendJson(res, 200, {
    paid: session.payment_status === "paid",
    balance: balance ?? centsToDollars(updatedUser.balance_cents),
    user: publicUser(updatedUser),
  });
}

async function handleStripeWebhook(req, res) {
  if (!stripe || !stripeWebhookSecret) {
    sendJson(res, 503, { error: "Stripe webhook is not configured." });
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      stripeWebhookSecret
    );
  } catch (error) {
    sendJson(res, 400, { error: `Webhook signature failed: ${error.message}` });
    return;
  }

  if (db.prepare("SELECT id FROM stripe_events WHERE id = ?").get(event.id)) {
    sendJson(res, 200, { received: true, duplicate: true });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    creditStripeCheckoutSession(session);
  } else if (event.type === "charge.dispute.created") {
    handleStripeDispute(event.data.object);
  } else if (event.type === "charge.dispute.closed") {
    handleStripeDisputeClosed(event.data.object);
  }

  db.prepare("INSERT INTO stripe_events (id, type) VALUES (?, ?)").run(
    event.id,
    event.type
  );
  sendJson(res, 200, { received: true });
}

function handleStripeDispute(dispute) {
  const paymentIntent = dispute.payment_intent;
  const ledgerEntry = paymentIntent
    ? db.prepare(`
        SELECT * FROM ledger_entries
        WHERE provider = 'stripe' AND provider_reference = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(paymentIntent)
    : null;
  const userId = ledgerEntry?.user_id || null;

  db.prepare(`
    INSERT INTO disputes (id, user_id, payment_intent, amount_cents, status, reason)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      reason = excluded.reason,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    dispute.id,
    userId,
    paymentIntent,
    dispute.amount || 0,
    dispute.status || "needs_response",
    dispute.reason || null
  );

  if (userId) {
    adjustUserBalance({
      userId,
      amountCents: -Math.abs(dispute.amount || ledgerEntry.amount_cents || 0),
      type: "chargeback_hold",
      provider: "stripe",
      providerReference: dispute.id,
      notes: "Stripe dispute opened; balance debited pending review.",
    });
    setUserFrozen(userId, true, "Stripe dispute opened.");
  }
}

function handleStripeDisputeClosed(dispute) {
  db.prepare(`
    UPDATE disputes
    SET status = ?, reason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(dispute.status || "closed", dispute.reason || null, dispute.id);

  const storedDispute = db.prepare("SELECT * FROM disputes WHERE id = ?").get(dispute.id);
  if (!storedDispute?.user_id) return;

  if (dispute.status === "won") {
    adjustUserBalance({
      userId: storedDispute.user_id,
      amountCents: Math.abs(storedDispute.amount_cents),
      type: "chargeback_reversal",
      provider: "stripe",
      providerReference: dispute.id,
      notes: "Stripe dispute won; held balance restored.",
    });
    setUserFrozen(storedDispute.user_id, false, "Stripe dispute closed as won.");
  }
}

function sendPlayerBalance(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  sendJson(res, 200, { user: publicUser(user), balance: centsToDollars(user.balance_cents) });
}

function normalizeBetUsd(value) {
  const normalized = Math.round(Number(value) * 100) / 100;
  return Number.isFinite(normalized) ? normalized : DEFAULT_STARTING_MASS_USD;
}

async function startPaidGame(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.frozen) {
    sendJson(res, 403, { error: "Account is frozen pending payment review." });
    return;
  }
  if (!user.terms_accepted_at) {
    sendJson(res, 403, { error: "Terms must be accepted before playing." });
    return;
  }

  const { betUsd } = await readJsonBody(req);
  const startingMass = normalizeBetUsd(betUsd);
  if (startingMass < MIN_BET_USD) {
    sendJson(res, 400, { error: "Minimum bet is $5 USD." });
    return;
  }

  const startCostCents = Math.round(startingMass * 100);
  if (user.balance_cents < startCostCents) {
    sendJson(res, 402, { error: "Insufficient balance." });
    return;
  }

  const balance = adjustUserBalance({
    userId: user.id,
    amountCents: -startCostCents,
    type: "game_entry",
    notes: `Game entry converted to ${startingMass} starting mass.`,
  });
  const gameTicket = createGameTicket({ userId: user.id, startingMass });
  sendJson(res, 200, { balance, startingMass, gameTicket });
}

function volumeFromRadius(radius) {
  return (4 / 3) * Math.PI * Math.pow(radius, 3);
}

function radiusToMass(radius) {
  const volume = volumeFromRadius(radius);
  return volume / pelletVolume;
}

function massToRadius(mass) {
  const volume = mass * pelletVolume;
  return Math.cbrt((3 * volume) / (4 * Math.PI));
}

function pelletMassFromRadius(radius) {
  return volumeFromRadius(radius) / pelletVolume;
}

const PLAYER_BASE_RADIUS = massToRadius(DEFAULT_STARTING_MASS_USD);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomPosition(radius = PLAYER_BASE_RADIUS) {
  const minBound = -HALF_WORLD + radius;
  const maxBound = HALF_WORLD - radius;
  return {
    x: randomBetween(minBound, maxBound),
    y: randomBetween(minBound, maxBound),
    z: randomBetween(minBound, maxBound),
  };
}

function createPellet(index) {
  const size = randomBetween(PELLET_MIN_RADIUS, PELLET_MAX_RADIUS);
  const position = randomPosition(size);
  const isPowerUp = Math.random() < POWERUP_RATIO;
  const bombRoll = Math.random();
  return {
    index,
    position,
    size,
    isPowerUp,
    bombRoll,
    active: true,
  };
}

function getPelletGridKey(position) {
  const x = Math.floor((position.x + HALF_WORLD) / PELLET_GRID_SIZE);
  const y = Math.floor((position.y + HALF_WORLD) / PELLET_GRID_SIZE);
  const z = Math.floor((position.z + HALF_WORLD) / PELLET_GRID_SIZE);
  return `${x},${y},${z}`;
}

function addPelletToGrid(pellet) {
  const key = getPelletGridKey(pellet.position);
  pellet.gridKey = key;
  if (!pelletGrid.has(key)) {
    pelletGrid.set(key, new Set());
  }
  pelletGrid.get(key).add(pellet.index);
}

function removePelletFromGrid(pellet) {
  if (!pellet.gridKey) return;
  const bucket = pelletGrid.get(pellet.gridKey);
  if (!bucket) return;
  bucket.delete(pellet.index);
  if (bucket.size === 0) {
    pelletGrid.delete(pellet.gridKey);
  }
}

function getNearbyPelletIndices(position, radius) {
  const searchRadius = radius + PELLET_MAX_RADIUS;
  const minX = Math.floor((position.x + HALF_WORLD - searchRadius) / PELLET_GRID_SIZE);
  const maxX = Math.floor((position.x + HALF_WORLD + searchRadius) / PELLET_GRID_SIZE);
  const minY = Math.floor((position.y + HALF_WORLD - searchRadius) / PELLET_GRID_SIZE);
  const maxY = Math.floor((position.y + HALF_WORLD + searchRadius) / PELLET_GRID_SIZE);
  const minZ = Math.floor((position.z + HALF_WORLD - searchRadius) / PELLET_GRID_SIZE);
  const maxZ = Math.floor((position.z + HALF_WORLD + searchRadius) / PELLET_GRID_SIZE);
  const nearby = [];

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const bucket = pelletGrid.get(`${x},${y},${z}`);
        if (!bucket) continue;
        bucket.forEach((index) => nearby.push(index));
      }
    }
  }

  return nearby;
}

function serializePelletState(pellets) {
  return {
    positions: pellets.map((pellet) => pellet.position),
    active: pellets.map((pellet) => pellet.active),
    powerUps: pellets.map((pellet) => pellet.isPowerUp),
  };
}

function rotationToForward(rotation = { yaw: 0, pitch: 0 }) {
  const sinYaw = Math.sin(rotation.yaw || 0);
  const cosYaw = Math.cos(rotation.yaw || 0);
  const sinPitch = Math.sin(rotation.pitch || 0);
  const cosPitch = Math.cos(rotation.pitch || 0);

  return {
    x: -sinYaw * cosPitch,
    y: -sinPitch,
    z: -cosYaw * cosPitch,
  };
}

function clampPosition(position, radius) {
  const minBound = -HALF_WORLD + radius;
  const maxBound = HALF_WORLD - radius;
  position.x = clamp(position.x, minBound, maxBound);
  position.y = clamp(position.y, minBound, maxBound);
  position.z = clamp(position.z, minBound, maxBound);
  return position;
}

const pelletGrid = new Map();
const pellets = Array.from({ length: PELLET_COUNT }, (_, i) => createPellet(i));
pellets.forEach(addPelletToGrid);
const pelletState = serializePelletState(pellets);

const players = new Map();
const gameTickets = new Map();
let lastTick = Date.now();

function getPlayerSpeed(mass) {
  const slowFactor = 1 + SPEED_FALLOFF * Math.cbrt(mass);
  return BASE_SPEED / slowFactor;
}

function createGameTicket({ userId, startingMass }) {
  const ticket = crypto.randomUUID();
  gameTickets.set(ticket, {
    userId,
    startingMass,
    expiresAt: Date.now() + 60_000,
  });
  return ticket;
}

function consumeGameTicket(ticket) {
  if (!ticket || !gameTickets.has(ticket)) return null;
  const gameTicket = gameTickets.get(ticket);
  gameTickets.delete(ticket);
  if (gameTicket.expiresAt < Date.now()) return null;
  return gameTicket;
}

function isLocalSocket(socket) {
  const origin = socket.handshake.headers.origin || "";
  return origin.includes("localhost") || origin.includes("127.0.0.1");
}

function respawnPellet(pellet) {
  removePelletFromGrid(pellet);
  pellet.position = randomPosition(pellet.size);
  addPelletToGrid(pellet);
  pellet.active = true;
  pellet.bombRoll = Math.random();
  pelletState.positions[pellet.index] = pellet.position;
  pelletState.active[pellet.index] = true;
  pelletState.powerUps[pellet.index] = pellet.isPowerUp;
  io.emit("pellet-respawn", {
    index: pellet.index,
    position: pellet.position,
    isPowerUp: pellet.isPowerUp,
  });
}

function handlePelletCollisions(player) {
  const nearbyPelletIndices = getNearbyPelletIndices(player.position, player.radius);
  for (let i = 0; i < nearbyPelletIndices.length; i++) {
    const pellet = pellets[nearbyPelletIndices[i]];
    if (!pellet.active) continue;
    const dx = player.position.x - pellet.position.x;
    const dy = player.position.y - pellet.position.y;
    const dz = player.position.z - pellet.position.z;
    const eatRadius = player.radius + pellet.size;
    if (dx * dx + dy * dy + dz * dz <= eatRadius * eatRadius) {
      pellet.active = false;
      removePelletFromGrid(pellet);
      pelletState.active[pellet.index] = false;
      const gainedMass = pelletMassFromRadius(pellet.size);
      const bombChance = Math.min(
        1,
        gainedMass / Math.max(1, player.startingMass || DEFAULT_STARTING_MASS_USD)
      );
      if (pellet.bombRoll < bombChance) {
        players.delete(player.id);
        io.emit("pellet-eaten", { index: pellet.index });
        io.emit("player-killed", { id: player.id });
        setTimeout(() => respawnPellet(pellet), 2500);
        return;
      }
      player.mass += gainedMass;
      player.radius = massToRadius(player.mass);
      player.speed = getPlayerSpeed(player.mass);
      io.emit("pellet-eaten", { index: pellet.index });
      if (pellet.isPowerUp) {
        io.to(player.id).emit("powerup-activated");
      }
      setTimeout(() => respawnPellet(pellet), pellet.isPowerUp ? 5000 : 2500);
    }
  }
}

function handlePlayerCollisions(player) {
  players.forEach((other) => {
    if (other.id === player.id || other.radius <= 0 || player.radius <= 0)
      return;
    const dx = player.position.x - other.position.x;
    const dy = player.position.y - other.position.y;
    const dz = player.position.z - other.position.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    const minDistance = player.radius + other.radius * 0.85;
    if (distanceSq > minDistance * minDistance) return;
    if (player.radius <= other.radius * 1.1) return;

    player.mass += other.mass * 0.9;
    player.radius = massToRadius(player.mass);
    player.speed = getPlayerSpeed(player.mass);
    other.mass = DEFAULT_STARTING_MASS_USD;
    other.startingMass = DEFAULT_STARTING_MASS_USD;
    other.radius = PLAYER_BASE_RADIUS;
    other.speed = getPlayerSpeed(other.mass);
    other.position = randomPosition(other.radius);
  });
}

function cashInPlayer(socket, player) {
  if (!player?.userId) {
    socket.emit("cash-in-result", {
      ok: false,
      error: "Cash-in requires a paid account session.",
    });
    return;
  }
  const amountCents = Math.max(0, Math.round(player.mass * 100));
  const balance = adjustUserBalance({
    userId: player.userId,
    amountCents,
    type: "game_cash_in",
    notes: `Cashed in ${player.mass.toFixed(2)} mass.`,
  });
  players.delete(player.id);
  io.emit("player-left", player.id);
  socket.emit("cash-in-result", {
    ok: true,
    balance,
    amount: centsToDollars(amountCents),
  });
}

function updatePlayers(delta) {
  players.forEach((player) => {
    if (player.input.forward) {
      const direction = rotationToForward(player.input.rotation);
      player.position.x += direction.x * player.speed * delta;
      player.position.y += direction.y * player.speed * delta;
      player.position.z += direction.z * player.speed * delta;
      clampPosition(player.position, player.radius);
    }
    handlePelletCollisions(player);
  });

  players.forEach((player) => {
    handlePlayerCollisions(player);
  });
}

function broadcastWorldState() {
  const payload = [];
  players.forEach((player) => {
    payload.push({
      id: player.id,
      name: player.name,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      radius: player.radius,
      mass: player.mass,
    });
  });
  io.emit("world-update", { players: payload });
}

setInterval(() => {
  const now = Date.now();
  const delta = (now - lastTick) / 1000;
  lastTick = now;
  updatePlayers(delta);
  broadcastWorldState();
}, TICK_INTERVAL);

io.on("connection", (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);
  console.log(`Total clients: ${io.engine.clientsCount}`);

  socket.on("join", ({ name, startingMass, gameTicket }) => {
    const localSocket = isLocalSocket(socket);
    const ticket = consumeGameTicket(gameTicket);
    if (!localSocket && !ticket) {
      socket.emit("join-rejected", { error: "Paid game ticket is required." });
      return;
    }
    const requestedMass = normalizeBetUsd(ticket?.startingMass ?? startingMass);
    const mass =
      requestedMass >= MIN_BET_USD
        ? requestedMass
        : DEFAULT_STARTING_MASS_USD;
    const playerRadius = massToRadius(mass);
    const spawnPosition = randomPosition(playerRadius);
    const player = {
      id: socket.id,
      userId: ticket?.userId || null,
      name: name || "Player",
      position: spawnPosition,
      radius: playerRadius,
      mass,
      startingMass: mass,
      speed: getPlayerSpeed(mass),
      input: { forward: false, rotation: { yaw: 0, pitch: 0 } },
    };
    players.set(socket.id, player);
    socket.emit("pellet-state", pelletState);
    socket.emit("world-update", {
      players: Array.from(players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        radius: p.radius,
        mass: p.mass,
      })),
    });
    socket.broadcast.emit("player-joined", {
      id: player.id,
      name: player.name,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      radius: player.radius,
    });
  });

  socket.on("player-input", (input) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.input.forward = Boolean(input.forward);
    if (input.rotation) {
      player.input.rotation = {
        yaw: Number(input.rotation.yaw) || 0,
        pitch: Number(input.rotation.pitch) || 0,
      };
    }
  });

  socket.on("request-pellet-state", () => {
    socket.emit("pellet-state", pelletState);
  });

  socket.on("cash-in", () => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit("cash-in-result", {
        ok: false,
        error: "No active player to cash in.",
      });
      return;
    }
    cashInPlayer(socket, player);
  });

  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ Client disconnected: ${socket.id}`);
    console.log(`Disconnect reason: ${reason}`);
    const player = players.get(socket.id);
    if (player) {
      players.delete(socket.id);
      io.emit("player-left", socket.id);
    }
  });
});

const port = Number(process.env.PORT) || 3001;
server.listen(port, "0.0.0.0", () => {
  console.log(`Multiplayer server running on port ${port}`);
  console.log("Server is accessible on:");
  console.log(`  - localhost:${port}`);
  console.log(`  - <your-local-ip>:${port}`);
  console.log(
    "\nTo find your local IP, run: ip addr show (Linux) or ipconfig (Windows)"
  );
});
