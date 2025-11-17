import { Server } from 'socket.io';
import http from 'http';

const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });

let players = {};

io.on('connection', (socket) => {
  socket.on('join', (player) => {
    players[socket.id] = { ...player, id: socket.id };
    io.emit('players', players);
    socket.broadcast.emit('player-joined', players[socket.id]);
  });

  socket.on('player-move', (player) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...player };
      socket.broadcast.emit('player-moved', { ...players[socket.id], id: socket.id });
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('player-left', socket.id);
  });
});

server.listen(3000, () => {
  console.log('Multiplayer server running on port 3000');
});