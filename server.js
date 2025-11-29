import { Server } from "socket.io";
import http from "http";

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8, // allow larger payloads for pellet sync
});

let players = {};
let pelletState = null; // Server-authoritative pellet state

io.on("connection", (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);
  console.log(`Total clients: ${io.engine.clientsCount}`);

  socket.on("join", (player) => {
    console.log(`👤 Player joined: ${player.name} (${socket.id})`);
    players[socket.id] = { ...player, id: socket.id };
    console.log(`Total players: ${Object.keys(players).length}`);
    io.emit("players", players);
    socket.broadcast.emit("player-joined", players[socket.id]);

    // Send current pellet state to new player
    if (pelletState) {
      socket.emit("pellet-state", pelletState);
    }
  });

  socket.on("init-pellets", (data) => {
    // First client to connect initializes pellet state
    if (!pelletState) {
      pelletState = data;
      console.log("Pellet state initialized");
    }
  });

  socket.on("pellet-eaten", (data) => {
    // Update server pellet state
    if (pelletState && data.index < pelletState.active.length) {
      pelletState.active[data.index] = false;
      // Broadcast to all other clients
      socket.broadcast.emit("pellet-eaten", data);
    }
  });

  socket.on("pellet-respawn", (data) => {
    // Update server pellet state
    if (pelletState && data.index < pelletState.active.length) {
      pelletState.positions[data.index] = data.position;
      pelletState.active[data.index] = true;
      pelletState.powerUps[data.index] = data.isPowerUp;
      // Broadcast to all other clients
      socket.broadcast.emit("pellet-respawn", data);
    }
  });

  socket.on("player-move", (player) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...player };
      socket.broadcast.emit("player-moved", {
        ...players[socket.id],
        id: socket.id,
      });
    }
  });

  socket.on("ping", () => {
    // Keep-alive ping
    socket.emit("pong");
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ Client disconnected: ${socket.id}`);
    console.log(`Disconnect reason: ${reason}`);
    const playerName = players[socket.id]?.name || "Unknown";
    console.log(`Player left: ${playerName}`);
    delete players[socket.id];
    console.log(`Remaining players: ${Object.keys(players).length}`);
    io.emit("player-left", socket.id);
  });
});

server.listen(3001, "0.0.0.0", () => {
  console.log("Multiplayer server running on port 3001");
  console.log("Server is accessible on:");
  console.log("  - localhost:3001");
  console.log("  - <your-local-ip>:3001");
  console.log(
    "\nTo find your local IP, run: ip addr show (Linux) or ipconfig (Windows)"
  );
});
