# Agar3D

Agar3D is a small multiplayer 3D Agar-style game built with React, React Three Fiber, Three.js, Vite, and Socket.IO.

The browser renders the game. The Node server owns the multiplayer truth: player positions, pellet state, collisions, and world updates.

## Run It

```bash
npm install
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://localhost:3000/
```

For another player on the same reachable network, use the printed Network URL, for example:

```text
http://your-ip-address:3000/
```

The page runs on port `3000`. The multiplayer server runs on port `3001`.

## Learn The Code

Start here:

1. `src/main.js` mounts React.
2. `src/App.jsx` switches between home, playing, and paused screens.
3. `src/GameScene.jsx` connects React Three Fiber to the game setup and frame loop.
4. `src/gameInit.js` creates the player, map, pellets, and networking.
5. `src/controls.js` records keyboard and mouse input.
6. `src/gameLoop.js` sends input every frame and updates camera/fog visuals.
7. `src/multiplayer.js` receives server snapshots and applies them to meshes.
8. `server.js` moves players, handles collisions, and broadcasts world state.

For a guided explanation, read:

```text
docs/CODE_TOUR.md
```

## Useful Commands

```bash
npm run dev       # start client and multiplayer server
npm run build     # verify the frontend builds
npm run dev:server
npm run dev:client
```
