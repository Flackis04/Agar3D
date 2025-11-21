import { Server } from 'socket.io';
import http from 'http';

const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });

let players = {};
let pelletState = null; // Server-authoritative pellet state

io.on('connection', (socket) => {
  socket.on('join', (player) => {
    players[socket.id] = { ...player, id: socket.id };
    io.emit('players', players);
    socket.broadcast.emit('player-joined', players[socket.id]);
    
    // Send current pellet state to new player
    if (pelletState) {
      socket.emit('pellet-state', pelletState);
    }
  });
  
  socket.on('init-pellets', (data) => {
    // First client to connect initializes pellet state
    if (!pelletState) {
      pelletState = data;
      console.log('Pellet state initialized');
    }
  });
  
  socket.on('pellet-eaten', (data) => {
    // Update server pellet state
    if (pelletState && data.index < pelletState.active.length) {
      pelletState.active[data.index] = false;
      // Broadcast to all other clients
      socket.broadcast.emit('pellet-eaten', data);
    }
  });
  
  socket.on('pellet-respawn', (data) => {
    // Update server pellet state
    if (pelletState && data.index < pelletState.active.length) {
      pelletState.positions[data.index] = data.position;
      pelletState.active[data.index] = true;
      pelletState.powerUps[data.index] = data.isPowerUp;
      // Broadcast to all other clients
      socket.broadcast.emit('pellet-respawn', data);
    }
  });

  socket.on('player-move', (player) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...player };
      socket.broadcast.emit('player-moved', { ...players[socket.id], id: socket.id });
      
      console.log('All player positions:');
      for (const id in players) {
        const p = players[id];
        console.log(`  ${p.name} (${id}): (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
      }
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('player-left', socket.id);
  });
});

server.listen(3001, () => {
  console.log('Multiplayer server running on port 3001');
});