# Agar3D - React Three Fiber

This project is a 3D Agar.io-style game built with [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) and [Vite](https://vitejs.dev/).

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open your browser to the local server (usually http://localhost:5173) to play the game.

## Features
- 3D Agar.io-style gameplay
- Player movement and camera controls (WASD + mouse)
- Pellet eating and growth mechanics
- Projectile shooting system
- Virus obstacles
- Particle effects for visual boundaries
- Developer camera mode (press X to toggle)

## Controls
- **W**: Move forward
- **Mouse**: Look around (click to enable pointer lock)
- **E**: Shoot normal projectiles
- **Space**: Shoot split projectile
- **X**: Toggle developer camera mode

## Tech Stack
- React 18
- React Three Fiber
- Three.js
- Vite
- @react-three/drei

## Project Structure
- `src/App.jsx`: Main React application and scene setup
- `src/main.jsx`: React entry point
- `src/components/`: React Three Fiber components
  - `Player.jsx`: Player sphere
  - `Pellets.jsx`: Instanced pellets for eating
  - `Viruses.jsx`: Animated virus obstacles
  - `Particles.jsx`: Border particle effects
  - `Controls.jsx`: Camera and input controls
  - `Projectiles.jsx`: Projectile system
- `src/utils.js`: Utility functions for game mechanics

---

Feel free to modify the components to experiment with React Three Fiber!
