// multiplayer-server.js
import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store all players: { [id]: { name, x, y, z, radius } }
const players = {};

io.on('connection', (socket) => {
  // When a new player joins
  socket.on('join', (player) => {
    players[socket.id] = {
      name: player.name || '',
      x: player.x,
      y: player.y,
      z: player.z,
      radius: player.radius
    };
    // Send all current players to the new player
    socket.emit('players', players);
    // Notify others about the new player
    socket.broadcast.emit('player-joined', { id: socket.id, ...players[socket.id] });
  });

  socket.on('move', (data) => {
    const movingPlayer = players[socket.id];
    if (!movingPlayer) return;

    movingPlayer.x = data.x;
    movingPlayer.y = data.y;
    movingPlayer.z = data.z;
    movingPlayer.radius = data.radius;

    for (const otherPlayerId in players) {
      if (otherPlayerId === socket.id) continue;

      const otherPlayer = players[otherPlayerId];
      const dx = movingPlayer.x - otherPlayer.x;
      const dy = movingPlayer.y - otherPlayer.y;
      const dz = movingPlayer.z - otherPlayer.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Only allow the larger player to eat the smaller one
      if (distance < Math.max(movingPlayer.radius, otherPlayer.radius)) {
        if (movingPlayer.radius > otherPlayer.radius * 1.1) {
          // movingPlayer eats otherPlayer
          const newRadius = Math.sqrt(movingPlayer.radius ** 2 + otherPlayer.radius ** 2);
          movingPlayer.radius = newRadius;
          io.to(otherPlayerId).emit('you-were-eaten', { killerName: movingPlayer.name || null });
          delete players[otherPlayerId];
          io.emit('player-left', otherPlayerId);
          break;
        } else if (otherPlayer.radius > movingPlayer.radius * 1.1) {
          // otherPlayer eats movingPlayer
          const newRadius = Math.sqrt(otherPlayer.radius ** 2 + movingPlayer.radius ** 2);
          otherPlayer.radius = newRadius;
          io.to(socket.id).emit('you-were-eaten', { killerName: otherPlayer.name || null });
          delete players[socket.id];
          io.emit('player-left', socket.id);
          break;
        }
        // If radii are too close, no one eats
      }
    }
    
    socket.broadcast.emit('player-moved', { id: socket.id, ...movingPlayer });
  });

  // When a player disconnects
  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('player-left', socket.id);
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Multiplayer server running on port ${PORT}`);
});
