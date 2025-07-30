// ========================================================================================
// AGAR3D - CLEAN MAIN ENTRY POINT
// ========================================================================================
import * as THREE from 'three';
import { initEntities, updateEntities } from './src/entities.js';
import { initNetworking } from './src/networking.js';
import { initUI } from './src/ui.js';
import { initPlayer, updatePlayer } from './src/player.js';
import { initEnvironment, updateEnvironment } from './src/environment.js';
import { initGame, updateGame, getGameState, setPlayerName } from './src/game.js';

// ========================================================================================
// CORE APP STATE
// ========================================================================================
const state = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
    renderer: new THREE.WebGLRenderer({ antialias: true }),
    mainSphere: new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0x0077ff, opacity: 0.6, transparent: true })
    ),
    gameStarted: false,
    playerName: '',
    // Add other shared state properties here
};

// ========================================================================================
// INITIALIZATION
// ========================================================================================
function init() {
    // Setup renderer
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(state.renderer.domElement);
    state.scene.add(state.mainSphere);

    // Initialize all modules, passing the shared state object
    initUI(state);
    initEntities(state);
    initEnvironment(state);
    initNetworking(state);
    initPlayer(state);
    initGame(state);

    // Global event listeners to connect modules
    window.addEventListener('startGame', (e) => {
        setPlayerName(e.detail.playerName);
        window.dispatchEvent(new CustomEvent('gameStart'));
    });

    window.addEventListener('resize', () => {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start the main animation loop
    animate();
}

// ========================================================================================
// MAIN ANIMATION LOOP
// ========================================================================================
function animate() {
    requestAnimationFrame(animate);

    const now = performance.now() * 0.001;
    const deltaTime = Math.min(now - (animate.lastTime || now), 0.1);
    animate.lastTime = now;

    if (!getGameState().gameStarted) {
        // Potentially animate something in the main menu
        state.renderer.render(state.scene, state.camera);
        return;
    }

    // Core game loop updates
    updatePlayer(deltaTime);
    updateEnvironment(now);
    updateEntities(deltaTime);
    updateGame(deltaTime);
    
    // Render the scene
    state.renderer.render(state.scene, state.camera);
}

// Start the application
init();
