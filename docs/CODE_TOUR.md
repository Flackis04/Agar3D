# Code Tour

This project is easier to understand if you follow one player action through the system instead of reading files alphabetically.

## The Big Idea

There are two programs running:

- The browser app on port `3000`
- The multiplayer server on port `3001`

The browser draws the world and collects input. The server decides the shared multiplayer state.

That means pressing `W` does not directly move your mesh in `controls.js`. Pressing `W` records intent, the browser sends that intent to the server, and the server sends back the updated position.

## First Read This Path

### 1. `src/main.js`

This is the smallest file and the true frontend entrypoint.

It says: create a React root and render `App`.

### 2. `src/App.jsx`

This is the screen manager.

Important state:

- `screen`: `"home"`, `"playing"`, or `"paused"`
- `playerName`: the name sent to the server
- `gameState`: a React ref that stores the current Three.js game objects

When you click Play, `startGame()` sets `screen` to `"playing"`. That makes React mount the `<Canvas>` and `<GameScene>`.

### 3. `src/GameScene.jsx`

This is the bridge between React and Three.js.

React Three Fiber gives this file:

- `scene`
- `camera`
- `gl`

Then `GameScene` calls `initializeGame(...)`.

Every rendered frame, `useFrame()` calls `frameStep.current?.()`, which comes from `gameLoop.js`.

### 4. `src/gameInit.js`

This builds one match.

It creates:

- The local player mesh
- Viruses
- Magnet sphere
- Map border
- Pellets
- Spatial grids
- Multiplayer networking

At the end it calls `onReady(gameState)`. That hands the created objects back to `App.jsx` and `GameScene.jsx`.

### 5. `src/controls.js`

This file listens to browser input.

For example:

```js
if (key === 'w') isForwardPressed = true;
```

That only records that the player wants to move forward.

Mouse movement changes `playerRotation`, which is the direction the player is facing.

### 6. `src/gameLoop.js`

This file runs once per browser frame.

It builds an input payload:

```js
{
  forward: controls.getForwardButtonPressed(),
  rotation: {
    yaw: controls.playerRotation.yaw,
    pitch: controls.playerRotation.pitch,
  },
}
```

Then it calls `sendPlayerInput(payload)`.

It also updates camera/fog visuals and runs simple client-side animations.

### 7. `src/multiplayer.js`

This is the browser networking layer.

It connects to:

```text
http://same-host-as-page:3001
```

It sends:

- `join`
- `player-input`
- `request-pellet-state`

It receives:

- `world-update`
- `player-joined`
- `player-left`
- `pellet-state`
- `pellet-eaten`
- `pellet-respawn`
- `powerup-activated`

When `world-update` arrives, it applies server positions to the local player and other players.

### 8. `server.js`

This is where multiplayer truth lives.

The server stores players in:

```js
const players = new Map();
```

Every server tick:

1. It calculates how much time passed.
2. It moves players from their latest input.
3. It checks pellet collisions.
4. It checks player collisions.
5. It emits `world-update` to every browser.

## Follow Pressing W

This is the most useful trace to memorize:

```text
controls.js
  W key becomes isForwardPressed = true

gameLoop.js
  reads controls.getForwardButtonPressed()
  sends { forward: true, rotation }

multiplayer.js
  socket.emit("player-input", payload)

server.js
  socket.on("player-input", ...)
  stores player.input.forward = true

server.js
  updatePlayers(delta)
  changes player.position

server.js
  broadcastWorldState()

multiplayer.js
  socket.on("world-update", ...)
  applies the new position to the mesh
```

## How To Read Console Output

Console output usually belongs to one of four layers:

- Vite: frontend dev server messages on port `3000`
- React: component render errors
- Three.js: rendering or WebGL warnings
- Socket.IO/server: multiplayer connection and event messages

When something breaks, first ask:

```text
Did this happen before the game rendered, during rendering, while connecting, or after input?
```

That question usually points you to the right file.

## Good Learning Exercises

Try these one at a time:

1. Change `BASE_SPEED` in `server.js` and feel the movement difference.
2. Add a `console.log(payload)` inside `sendInput` in `gameLoop.js`.
3. Add a `console.log(player.position)` inside `updatePlayers` in `server.js`.
4. Change a pellet color in `gameInit.js`.
5. Temporarily reduce `PELLET_COUNT` in `server.js` and `gameInit.js` to see faster startup.

Undo each experiment before trying the next one. Small changes teach faster than big rewrites.
