// ========================================================================================
// AGAR3D - CLEAN MAIN ENTRY POINT
// ========================================================================================
import * as THREE from 'three';
import { initEntities, updateEntities } from './entities.js';
import { initNetworking } from './networking.js';
import { initUI } from './ui.js';
import { initPlayer, updatePlayer } from './player.js';
import { initEnvironment, updateEnvironment } from './environment.js';
import { initGame, updateGame, getGameStarted} from './game.js';

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

    if (!getGameStarted()) {
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


export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// Fog settings for gameplay

const FOG_COLOR = 0x222233;
const FOG_NEAR_BASE = 40;
const FOG_FAR_BASE = 120;
const FOG_FAR_MAX = 500; // Maximum fog distance for very large players

let FOG_NEAR = FOG_NEAR_BASE;
let FOG_FAR = FOG_FAR_BASE;


function enableGameFog() {
    if (!DEBUG) {
        scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
        renderer.setClearColor(FOG_COLOR);
    } else {
        disableGameFog();
    }
}
function disableGameFog() {
    scene.fog = null;
    renderer.setClearColor(0x000000);
}

function updateFogForPlayerSize(playerRadius) {
    if (DEBUG) return; // Don't update fog in debug mode
    // As player grows, increase FOG_FAR (and optionally FOG_NEAR)
    // FOG_FAR grows linearly with radius, capped at FOG_FAR_MAX
    // FOG_NEAR can also grow, but less aggressively
    const minRadius = 1;
    const maxRadius = 100; // Adjust as needed for your game
    const t = Math.min(1, Math.max(0, (playerRadius - minRadius) / (maxRadius - minRadius)));
    FOG_NEAR = FOG_NEAR_BASE + t * 60; // e.g., from 40 to 100
    FOG_FAR = FOG_FAR_BASE + t * (FOG_FAR_MAX - FOG_FAR_BASE); // e.g., from 120 to 500
    if (scene.fog) {
        scene.fog.near = FOG_NEAR;
        scene.fog.far = FOG_FAR;
    }
}

function findSafeSpawnPosition() {
    const radius = mainSphere.geometry.parameters.radius;
    const half = SPAWN_AREA_SIZE / 2 - radius;
    let pos = new THREE.Vector3();
    let valid = false;
    let attempts = 0;
    while (!valid && attempts < 100) {
        pos.set(
            (Math.random() - 0.5) * SPAWN_AREA_SIZE,
            (Math.random() - 0.5) * SPAWN_AREA_SIZE,
            (Math.random() - 0.5) * SPAWN_AREA_SIZE
        );
        pos.x = Math.max(-half, Math.min(half, pos.x));
        pos.y = Math.max(-half, Math.min(half, pos.y));
        pos.z = Math.max(-half, Math.min(half, pos.z));
        valid = true;
        
        // Check against blobs
        for (let c of scene.children) {
            if (c.geometry && c.geometry.type === 'SphereGeometry' && c !== mainSphere) {
                const otherR = c.userData.smallRadius || 0.8;
                if (pos.distanceTo(c.position) < radius + otherR + 0.1) {
                    valid = false;
                    break;
                }
            }
        }
        
        // Check against Nebulosa
        if (valid) {
            for (let i = 0; i < nebulosa.length; i++) {
                if (nebulosa[i].active) {
                    if (pos.distanceTo(nebulosa[i].position) < radius + nebulosa[i].radius + 1.0) {
                        valid = false;
                        break;
                    }
                }
            }
        }
        
        // Check against other players
        for (const id in otherPlayers) {
            const mesh = otherPlayers[id].mesh;
            if (pos.distanceTo(mesh.position) < radius + mesh.geometry.parameters.radius + 0.1) {
                valid = false;
                break;
            }
        }
        attempts++;
    }
    return pos;
}

function startGame() {
    const nameInput = document.getElementById('playerNameInput');
    playerName = nameInput ? nameInput.value.trim() : '';
    startMenu.style.display = 'none';
    escMenu.style.display = 'none';
    deathMenu.style.display = 'none';
    gameStarted = true;
    if (!DEBUG) enableGameFog();
    else disableGameFog();
    // Re-add the player's sphere to the scene if not present
    if (!scene.children.includes(mainSphere)) {
        scene.add(mainSphere);
    }
    // Set a random safe spawn position
    const spawnPos = findSafeSpawnPosition();
    mainSphere.position.copy(spawnPos);
    // Show the renderer canvas and all UI elements
    renderer.domElement.style.display = '';
    coordsDiv.style.display = '';
    fpsDiv.style.display = '';
    modeBtn.style.display = 'block'; // Show examine mode button
    leaderboardDiv.style.display = 'block';
    // Track survival time
    gameStartTime = Date.now();
    // Add this line to join the server
    socket.emit('join', {
        name: playerName,
        x: mainSphere.position.x,
        y: mainSphere.position.y,
        z: mainSphere.position.z,
        radius: mainSphere.geometry.parameters.radius
    });
}


document.getElementById('playBtn').addEventListener('click', startGame);

// Escape menu logic
const escYesBtn = escMenu.querySelector('#escYesBtn');
const escNoBtn = escMenu.querySelector('#escNoBtn');

escYesBtn.addEventListener('click', () => {
    // Return to home screen
    escMenu.style.display = 'none';
    startMenu.style.display = 'flex';
    gameStarted = false;
    // Remove the player's sphere and hide all UI elements
    scene.remove(mainSphere);
    renderer.domElement.style.display = 'none';
    coordsDiv.style.display = 'none';
    fpsDiv.style.display = 'none';
    modeBtn.style.display = 'none'; // Hide examine mode button
    leaderboardDiv.style.display = 'none';
    deathMenu.style.display = 'none';
    disableGameFog();
});

escNoBtn.addEventListener('click', () => {
    escMenu.style.display = 'none';
    renderer.domElement.style.cursor = 'none';
    // Only request pointer lock if menu is not up
    if (escMenu.style.display === 'none') {
        renderer.domElement.requestPointerLock();
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && gameStarted) {
        escMenu.style.display = 'flex';
        renderer.domElement.style.cursor = 'auto';
        if (document.pointerLockElement === renderer.domElement) {
            document.exitPointerLock();
        }
        event.preventDefault();
    }
});

const coordsDiv = document.createElement('div');
coordsDiv.style.position = 'absolute';
coordsDiv.style.bottom = '10px';
coordsDiv.style.right = '240px';
coordsDiv.style.padding = '5px 10px';
coordsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
coordsDiv.style.color = 'white';
coordsDiv.style.fontFamily = 'monospace';
coordsDiv.style.fontSize = '14px';
coordsDiv.style.borderRadius = '5px';
coordsDiv.style.display = 'none'; // Hide initially

// FPS Counter
const fpsDiv = document.createElement('div');
fpsDiv.style.position = 'absolute';
fpsDiv.style.bottom = '10px';
fpsDiv.style.right = '140px';
fpsDiv.style.padding = '5px 10px';
fpsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
fpsDiv.style.color = 'white';
fpsDiv.style.fontFamily = 'monospace';
fpsDiv.style.fontSize = '14px';
fpsDiv.style.borderRadius = '5px';
fpsDiv.style.display = 'none'; // Hide initially
fpsDiv.textContent = 'FPS: --';
document.body.appendChild(fpsDiv);

// Camera mode toggle button
const modeBtn = document.createElement('button');
modeBtn.style.position = 'fixed';
modeBtn.style.left = '50%';
modeBtn.style.top = '75%';
modeBtn.style.transform = 'translate(-50%, -50%)';
modeBtn.style.padding = '10px 20px';
modeBtn.style.fontSize = '1.2em';
modeBtn.style.borderRadius = '8px';
modeBtn.style.border = 'none';
modeBtn.style.background = '#222';
modeBtn.style.color = 'white';
modeBtn.style.cursor = 'pointer';
modeBtn.style.zIndex = '1001';
modeBtn.style.opacity = '0';
modeBtn.style.transition = 'opacity 0.2s';
modeBtn.style.display = 'none'; // Hide initially
modeBtn.textContent = 'Examine Mode: OFF';
document.body.appendChild(coordsDiv);
document.body.appendChild(modeBtn);

// Leaderboard UI
const leaderboardDiv = document.createElement('div');
leaderboardDiv.style.position = 'absolute';
leaderboardDiv.style.top = '10px';
leaderboardDiv.style.right = '10px';
leaderboardDiv.style.width = '220px';
leaderboardDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
leaderboardDiv.style.color = 'white';
leaderboardDiv.style.fontFamily = 'sans-serif';
leaderboardDiv.style.fontSize = '14px';
leaderboardDiv.style.borderRadius = '8px';
leaderboardDiv.style.padding = '10px';
leaderboardDiv.style.display = 'none'; // Hide initially
leaderboardDiv.style.border = '1px solid rgba(255, 255, 255, 0.2)';
leaderboardDiv.innerHTML = `<h3 style="margin: 0 0 10px; text-align: center; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 5px;">Leaderboard</h3><ul id="leaderboard-list" style="list-style: none; padding: 0; margin: 0;"></ul>`;
document.body.appendChild(leaderboardDiv);
const leaderboardList = leaderboardDiv.querySelector('#leaderboard-list');


let modeBtnFadeTimeout = null;
let lastToggleTime = Date.now();
let modeBtnVisible = false;


function showModeBtn() {
    if (gameStarted) {
        modeBtn.style.opacity = '0.85';
    }
    modeBtnVisible = true;
    if (modeBtnFadeTimeout) clearTimeout(modeBtnFadeTimeout);
}


function hideModeBtn() {
    if (gameStarted) {
        modeBtn.style.opacity = '0';
    }
    modeBtnVisible = false;
}

function scheduleModeBtnFade() {
    if (cameraMode !== 'examine') {
        if (modeBtnFadeTimeout) clearTimeout(modeBtnFadeTimeout);
        modeBtnFadeTimeout = setTimeout(() => {
            if (cameraMode !== 'examine') hideModeBtn();
        }, 5000);
    }
}


function updateModeBtn() {
    modeBtn.textContent = `Examine Mode: ${cameraMode === 'examine' ? 'ON' : 'OFF'}`;
    modeBtn.style.background = cameraMode === 'examine' ? '#0077ff' : '#222';
    showModeBtn();
    scheduleModeBtnFade();
}

// Hide the button initially
hideModeBtn();

modeBtn.addEventListener('click', (e) => {
    cameraMode = cameraMode === 'normal' ? 'examine' : 'normal';
    lastToggleTime = Date.now();
    updateModeBtn();
    e.stopPropagation();
});

// Only show the button on left click (handled below)

const MAX_SPEED = 24; // Speed in units per second
const ACCEL = 2.4;    // Acceleration rate
const DECEL = 3.6;    // Deceleration rate
const ORBIT_SENSITIVITY = 0.005;
const SPAWN_AREA_SIZE = 500 ;
const PELLET_COUNT = SPAWN_AREA_SIZE * 50;
const MIN_SPAWN_RADIUS_SQ = 5 * 5;

const mainSphereGeometry = new THREE.SphereGeometry(1, 32, 32);
const mainSphereMaterial = new THREE.MeshStandardMaterial({ color: 0x0077ff, opacity: 0.6, transparent: true });
export const mainSphere = new THREE.Mesh(mainSphereGeometry, mainSphereMaterial);
scene.add(mainSphere);


const PELLET_COLORS = [
    0xff0000, // Red
    0x0077ff, // Blue
    0x00ff00, // Green
    0xffff00, // Yellow
    0x9b30ff, // Purple
    0xff9900, // Orange
    0x7ed6ff, // Light Blue
    0xff69b4  // Pink
];

// Update these constants for normal distribution
const NEBULOSA_COUNT = Math.max(2, Math.floor(SPAWN_AREA_SIZE / 150)); // Fewer Nebulosa
const NEBULOSA_COLOR = 0xff69b4;
const NEBULOSA_MIN_RADIUS = 80; // Larger min size
const NEBULOSA_MAX_RADIUS = 250; // Larger max size
const NEBULOSA_AVERAGE_RADIUS = 120;

const bots_COUNT = 30; // Number of bots to spawn
const bots_color = 0xcd990000;
const BOT_SPEED = 3; // Speed of the bots
const BOT_MIN_RADIUS = 1;
const BOT_AVERAGE_RADIUS = 5;
const BOT_MAX_RADIUS = 9;

// Add normal distribution function
function normalRandom(mean, stdDev) {
    // Box-Muller transformation for normal distribution
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
}

function generateNebulosaRadius() {
    // Standard deviation to make the distribution reasonable
    // Using stdDev of 8 gives good spread while keeping most values reasonable
    const stdDev = 8;
    let radius;
    
    // Keep generating until we get a value in our desired range
    do {
        radius = normalRandom(NEBULOSA_AVERAGE_RADIUS, stdDev);
    } while (radius < NEBULOSA_MIN_RADIUS || radius > NEBULOSA_MAX_RADIUS);
    
    return radius;
}

function generateBotRadius() {
    // Standard deviation to make the distribution reasonable
    const stdDev = 7;
    let radius;
    
    // Keep generating until we get a value in our desired range
    do {
        radius = normalRandom(BOT_AVERAGE_RADIUS, stdDev);
    } while (radius < BOT_MIN_RADIUS || radius > BOT_MAX_RADIUS);
    
    return radius;
}


// --- Nebulosa must be initialized BEFORE pellets so their positions/volumes are known ---
const nebulosa = [];
const nebulosaGeometry = new THREE.SphereGeometry(1, 32, 32);
const nebulosaMaterial = new THREE.MeshStandardMaterial({ 
    color: NEBULOSA_COLOR, 
    roughness: 0.3, 
    metalness: 0.1,
    opacity: 0.2,
    transparent: true,
    depthWrite: false, // Allow seeing through for better visuals inside
    side: THREE.DoubleSide, // Render both sides for immersive interior
    blending: THREE.NormalBlending
});
export const nebulosaInstances = new THREE.InstancedMesh(nebulosaGeometry, nebulosaMaterial, NEBULOSA_COUNT);
scene.add(nebulosaInstances);

const tempMatrix = new THREE.Matrix4();
const tempColor = new THREE.Color();
const tempPosition = new THREE.Vector3();

// Initialize Nebulosa first
for (let i = 0; i < NEBULOSA_COUNT; i++) {
    let valid = false;
    let attempts = 0;
    let radius = 0;
    
    while (!valid && attempts < 100) {
        radius = generateNebulosaRadius();
        const half = SPAWN_AREA_SIZE / 2 - radius;
        tempPosition.set(
            (Math.random() - 0.5) * SPAWN_AREA_SIZE,
            (Math.random() - 0.5) * SPAWN_AREA_SIZE,
            (Math.random() - 0.5) * SPAWN_AREA_SIZE
        );
        tempPosition.x = Math.max(-half, Math.min(half, tempPosition.x));
        tempPosition.y = Math.max(-half, Math.min(half, tempPosition.y));
        tempPosition.z = Math.max(-half, Math.min(half, tempPosition.z));

        valid = true;
        
        // Check against other already placed Nebulosa
        for (let j = 0; j < i; j++) {
            if (nebulosa[j].active) {
                const distance = tempPosition.distanceTo(nebulosa[j].position);
                const minDistance = radius + nebulosa[j].radius + 5.0; // 5 unit buffer
                if (distance < minDistance) {
                    valid = false;
                    break;
                }
            }
        }
        
        attempts++;
    }

    nebulosa.push({
        position: tempPosition.clone(),
        radius: radius,
        active: true,
        rotationSpeed: (Math.random() - 0.5) * 0.002,
        rotationAxis: new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize(),
        currentRotation: 0
    });

    const scale = new THREE.Vector3(radius, radius, radius);
    tempMatrix.compose(tempPosition, new THREE.Quaternion(), scale);
    nebulosaInstances.setMatrixAt(i, tempMatrix);
}
nebulosaInstances.instanceMatrix.needsUpdate = true;

// --- Instanced Spheres for Performance ---
const pellets = []; // To hold data like position, radius, color
const pelletGeometry = new THREE.SphereGeometry(1, 16, 16); // Base geometry, scaled by instance matrix
const pelletMaterial = new THREE.MeshStandardMaterial(); // { vertexColors: true} was set in parenthasis
export const pelletInstances = new THREE.InstancedMesh(pelletGeometry, pelletMaterial, PELLET_COUNT);
scene.add(pelletInstances);

// Now initialize pellets, using Nebulosa positions/volumes
for (let i = 0; i < PELLET_COUNT; i++) {
    let valid = false;
    let attempts = 0;
    let radius = 0;
    // Compute total Nebulosa volume and world volume
    let nebulosaVolume = 0;
    for (let p = 0; p < nebulosa.length; p++) {
        if (nebulosa[p].active) {
            nebulosaVolume += (4/3) * Math.PI * Math.pow(nebulosa[p].radius, 3);
        }
    }
    const worldVolume = Math.pow(SPAWN_AREA_SIZE, 3);
    // Probability to spawn inside a Nebulosa so that density inside is 15x higher than outside
    // Let D_in = 15 * D_out, so Prob_in = (15 * nebulosaVolume) / (15 * nebulosaVolume + (worldVolume - nebulosaVolume))
    const nebulosaProb = (15 * nebulosaVolume) / (15 * nebulosaVolume + (worldVolume - nebulosaVolume));
    while (!valid && attempts < 100) {
        radius = 0.5 + Math.random() * 0.4;
        const half = SPAWN_AREA_SIZE / 2 - radius;
        let tryInsideNebulosa = false;
        if (nebulosa.length > 0 && Math.random() < nebulosaProb) {
            // Pick a random active Nebulosa
            const nebulosaCandidates = nebulosa.filter(p => p.active);
            if (nebulosaCandidates.length > 0) {
                const selectedNebulosa = nebulosaCandidates[Math.floor(Math.random() * nebulosaCandidates.length)];
                // Random point inside the Nebulosa
                const u = Math.random();
                const v = Math.random();
                const w = Math.random();
                // Spherical coordinates, uniform in volume
                const theta = 2 * Math.PI * u;
                const phi = Math.acos(2 * v - 1);
                const r = Math.cbrt(w) * (selectedNebulosa.radius - radius - 0.2); // stay inside
                tempPosition.set(
                    selectedNebulosa.position.x + r * Math.sin(phi) * Math.cos(theta),
                    selectedNebulosa.position.y + r * Math.sin(phi) * Math.sin(theta),
                    selectedNebulosa.position.z + r * Math.cos(phi)
                );
                tryInsideNebulosa = true;
            }
        }
        if (!tryInsideNebulosa) {
            tempPosition.set(
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE
            );
            tempPosition.x = Math.max(-half, Math.min(half, tempPosition.x));
            tempPosition.y = Math.max(-half, Math.min(half, tempPosition.y));
            tempPosition.z = Math.max(-half, Math.min(half, tempPosition.z));
        }

        valid = tempPosition.lengthSq() > MIN_SPAWN_RADIUS_SQ;

        if (valid) {
            // Check against other newly placed pellets in this loop
            for (let j = 0; j < i; j++) {
                if (pellets[j].active) {
                    if (tempPosition.distanceTo(pellets[j].position) < radius + pellets[j].radius + 0.1) {
                        valid = false;
                        break;
                    }
                }
            }
        }
        attempts++;
    }

    const color = PELLET_COLORS[Math.floor(Math.random() * PELLET_COLORS.length)];
    tempColor.set(color); 

    pellets.push({
        position: tempPosition.clone(),
        radius: radius,
        active: true,
        color: tempColor.clone()
    });

    // Set the matrix for this instance
    const scale = new THREE.Vector3(radius, radius, radius);
    tempMatrix.compose(tempPosition, new THREE.Quaternion(), scale);
    pelletInstances.setMatrixAt(i, tempMatrix);
    pelletInstances.setColorAt(i, tempColor);
}
pelletInstances.instanceMatrix.needsUpdate = true;
pelletInstances.instanceColor.needsUpdate = true;


// Bots
const bots = [];
const botsGeometry = new THREE.SphereGeometry(1, 32, 32);
const botsMaterial = new THREE.MeshStandardMaterial({ color: bots_color });
export const botsInstances = new THREE.InstancedMesh(botsGeometry, botsMaterial, bots_COUNT);
scene.add(botsInstances);

for (let i = 0; i < bots_COUNT; i++) {
    let valid = false;
    let attempts = 0;
    let radius = 0;

    // This initial placement can be slow, but only runs once at startup.
    while (!valid && attempts < 100) {
        radius = generateBotRadius();
        const half = SPAWN_AREA_SIZE / 2 - radius;
        tempPosition.set(
            (Math.random() - 0.5) * SPAWN_AREA_SIZE,
            (Math.random() - 0.5) * SPAWN_AREA_SIZE,
            (Math.random() - 0.5) * SPAWN_AREA_SIZE
        );
        tempPosition.x = Math.max(-half, Math.min(half, tempPosition.x));
        tempPosition.y = Math.max(-half, Math.min(half, tempPosition.y));
        tempPosition.z = Math.max(-half, Math.min(half, tempPosition.z));

        valid = tempPosition.lengthSq() > MIN_SPAWN_RADIUS_SQ;

        if (valid) {
            // Check against other newly placed spheres in this loop
            for (let j = 0; j < i; j++) {
                if (bots[j] && bots[j].active) {
                    if (tempPosition.distanceTo(bots[j].position) < radius + bots[j].radius + 0.1) {
                        valid = false;
                        break;
                    }
                }
            }
        }
        attempts++;
    }

    const color = bots_color; // Use a single color for bots
    tempColor.set(color); 

    bots.push({
        position: tempPosition.clone(),
        radius: radius,
        active: true,
        color: tempColor.clone()
    });

    // Set the matrix for this instance
    const scale = new THREE.Vector3(radius, radius, radius);
    tempMatrix.compose(tempPosition, new THREE.Quaternion(), scale);
    botsInstances.setMatrixAt(i, tempMatrix);
}

nebulosaInstances.instanceMatrix.needsUpdate = true;
botsInstances.instanceMatrix.needsUpdate = true;

// Nebulosa background effect
let nebulosaBackgroundActive = false;
export let nebulosaBackgroundStrength = 0.0; // 0.0 = off, 1.0 = full

// Enhanced Nebulosa background with multi-dimensional shader
const nebulosaBgGeometry = new THREE.PlaneGeometry(2000, 2000, 1, 1);
const nebulosaBgMaterial = new THREE.ShaderMaterial({
    uniforms: {
        time: { value: 0.0 },
        opacity: { value: 0.0 },
        cameraPos: { value: new THREE.Vector3() },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
            vUv = uv;
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform float opacity;
        uniform vec3 cameraPos;
        uniform vec2 resolution;
        varying vec2 vUv;
        varying vec3 vPosition;

        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            float aspectRatio = resolution.x / resolution.y;
            uv.x *= aspectRatio;
            
            // Simple effects without complex noise
            float dist = length(uv);
            
            // Simple animated swirls
            float angle = atan(uv.y, uv.x);
            float spiral = sin(angle * 6.0 + dist * 8.0 + time * 1.5) * 0.5 + 0.5;
            
            // Clean energy streams
            float streams = sin(uv.x * 12.0 + time * 2.0) * sin(uv.y * 10.0 + time * 1.8);
            streams = abs(streams);
            
            // Dimensional portal colors
            vec3 color1 = vec3(1.0, 0.2, 0.8);    // Hot pink
            vec3 color2 = vec3(0.4, 0.1, 1.0);    // Deep purple
            vec3 color3 = vec3(0.1, 0.9, 1.0);    // Cyan
            vec3 color4 = vec3(1.0, 0.8, 0.2);    // Golden
            vec3 color5 = vec3(0.2, 1.0, 0.4);    // Neon green
            
            // Smooth color mixing without noise
            vec3 finalColor = mix(color1, color2, sin(spiral * 3.14159) * 0.5 + 0.5);
            finalColor = mix(finalColor, color3, streams * 0.3);
            
            // Add energy pulses
            float pulse = sin(time * 3.0 + dist * 5.0) * 0.5 + 0.5;
            finalColor += pulse * 0.2 * vec3(1.0, 0.5, 1.0);
            
            // Radial fade with energy center
            float centerIntensity = 1.0 / (1.0 + dist * dist * 0.5);
            float edgeFade = 1.0 - smoothstep(0.5, 2.0, dist);
            
            // Final intensity and glow
            float intensity = (0.7 + spiral * 0.3) * centerIntensity * edgeFade;
            intensity += streams * 0.3;
            
            gl_FragColor = vec4(finalColor * intensity, opacity * intensity * 0.8);
        }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
});
const nebulosaBgMesh = new THREE.Mesh(nebulosaBgGeometry, nebulosaBgMaterial);
nebulosaBgMesh.position.set(0, 0, -900); // Far behind everything
// Background disabled - only particles: scene.add(nebulosaBgMesh);

// Add multiple background layers for depth
export const dimensionalLayers = [];
for (let i = 0; i < 3; i++) {
    const layerGeometry = new THREE.SphereGeometry(800 + i * 200, 32, 32);
    const layerMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 },
            opacity: { value: 0.0 },
            layer: { value: i }
        },
        vertexShader: `
            uniform float time;
            uniform float layer;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                vPosition = position;
                vNormal = normal;
                
                // Dimensional warping
                vec3 pos = position;
                pos += normal * sin(time * (1.0 + layer * 0.5) + length(position) * 0.01) * (5.0 + layer * 10.0);
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float opacity;
            uniform float layer;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                // Each layer has different colors and patterns
                vec3 color;
                if (layer < 0.5) {
                    color = vec3(0.2, 0.6, 1.0); // Deep blue
                } else if (layer < 1.5) {
                    color = vec3(1.0, 0.3, 0.7); // Magenta
                } else {
                    color = vec3(0.4, 1.0, 0.3); // Green
                }
                
                // Animated energy flows
                float flow = sin(time * 2.0 + vPosition.x * 0.1 + vPosition.y * 0.15 + vPosition.z * 0.12);
                flow += sin(time * 3.0 + length(vPosition.xy) * 0.05);
                color += vec3(0.3) * flow * 0.5;
                
                // Fresnel-like edge glow
                float fresnel = 1.0 - abs(dot(vNormal, normalize(vPosition)));
                fresnel = pow(fresnel, 2.0);
                
                float alpha = opacity * fresnel * (0.1 + layer * 0.05);
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
    });
    
    const layerMesh = new THREE.Mesh(layerGeometry, layerMaterial);
    scene.add(layerMesh);
    dimensionalLayers.push(layerMesh);
}

// Dimensional energy beams
const beamCount = 20;
const beamGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1000, 8);
const beamMaterial = new THREE.ShaderMaterial({
    uniforms: {
        time: { value: 0.0 },
        opacity: { value: 0.0 }
    },
    vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
            vUv = uv;
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform float opacity;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
            // Energy beam effect
            float dist = abs(vUv.x - 0.5) * 2.0;
            float beam = 1.0 - smoothstep(0.0, 0.8, dist);
            
            // Flowing energy
            float flow = sin(vUv.y * 20.0 - time * 5.0) * 0.5 + 0.5;
            beam *= flow * flow;
            
            vec3 color = vec3(0.5, 1.0, 1.0) + vec3(0.5, 0.0, 0.5) * sin(time * 2.0);
            
            gl_FragColor = vec4(color, beam * opacity * 0.3);
        }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
});

export const energyBeams = [];
for (let i = 0; i < beamCount; i++) {
    const beam = new THREE.Mesh(beamGeometry, beamMaterial.clone());
    beam.position.set(
        (Math.random() - 0.5) * 1000,
        (Math.random() - 0.5) * 1000,
        (Math.random() - 0.5) * 1000
    );
    beam.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
    );
    beam.visible = false;
    scene.add(beam);
    energyBeams.push(beam);
}

// Multi-layered dimensional particle systems
const particleCount = 2000;

// Energy particles
const energyParticleGeometry = new THREE.BufferGeometry();
const energyPositions = new Float32Array(particleCount * 3);
const energyVelocities = new Float32Array(particleCount * 3);
const energySizes = new Float32Array(particleCount);
const energyTypes = new Float32Array(particleCount); // Different particle types

for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    const radius = 200 + Math.random() * 600;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    energyPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    energyPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    energyPositions[i3 + 2] = radius * Math.cos(phi);
    
    // Complex motion patterns
    energyVelocities[i3] = (Math.random() - 0.5) * 0.5;
    energyVelocities[i3 + 1] = (Math.random() - 0.5) * 0.5;
    energyVelocities[i3 + 2] = (Math.random() - 0.5) * 0.5;
    
    energySizes[i] = 1.0 + Math.random() * 4.0;
    energyTypes[i] = Math.floor(Math.random() * 4); // 4 different particle types
}

energyParticleGeometry.setAttribute('position', new THREE.BufferAttribute(energyPositions, 3));
energyParticleGeometry.setAttribute('size', new THREE.BufferAttribute(energySizes, 1));
energyParticleGeometry.setAttribute('particleType', new THREE.BufferAttribute(energyTypes, 1));

export const energyParticleMaterial = new THREE.ShaderMaterial({
    uniforms: {
        time: { value: 0.0 },
        opacity: { value: 0.0 }
    },
    vertexShader: `
        attribute float size;
        attribute float particleType;
        uniform float time;
        uniform float opacity;
        varying float vOpacity;
        varying float vType;
        varying vec3 vPosition;
        
        void main() {
            vOpacity = opacity;
            vType = particleType;
            vPosition = position;
            
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float distanceScale = 400.0 / -mvPosition.z;
            
            // Pulsing size based on type and time
            float pulse = sin(time * (2.0 + particleType) + length(position) * 0.01) * 0.5 + 0.5;
            float finalSize = size * (0.5 + pulse * 0.5) * distanceScale;
            
            gl_PointSize = finalSize;
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform float time;
        varying float vOpacity;
        varying float vType;
        varying vec3 vPosition;
        
        void main() {
            vec2 center = gl_PointCoord - 0.5;
            float dist = length(center);
            if (dist > 0.5) discard;
            
            // Different visual styles based on particle type
            vec3 color;
            float alpha;
            
            if (vType < 1.0) {
                // Energy orbs - pulsing bright cores
                color = vec3(1.0, 0.3, 0.9);
                float core = 1.0 - smoothstep(0.0, 0.3, dist);
                alpha = core * vOpacity;
            } else if (vType < 2.0) {
                // Dimensional sparks - flickering
                color = vec3(0.2, 1.0, 1.0);
                float flicker = sin(time * 10.0 + length(vPosition) * 0.1) * 0.5 + 0.5;
                alpha = (1.0 - dist * 2.0) * vOpacity * flicker;
            } else if (vType < 3.0) {
                // Void fragments - dark with bright edges
                color = vec3(0.8, 0.2, 1.0);
                float ring = smoothstep(0.2, 0.4, dist) * (1.0 - smoothstep(0.4, 0.5, dist));
                alpha = ring * vOpacity * 2.0;
            } else {
                // Reality rifts - morphing colors
                float morph = sin(time * 3.0 + dist * 20.0) * 0.5 + 0.5;
                color = mix(vec3(1.0, 0.8, 0.2), vec3(0.2, 1.0, 0.4), morph);
                alpha = (1.0 - dist * 2.0) * vOpacity * 0.8;
            }
            
            // Add subtle glow
            alpha += (1.0 - dist) * vOpacity * 0.1;
            
            gl_FragColor = vec4(color, alpha);
        }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
});

const energyParticleSystem = new THREE.Points(energyParticleGeometry, energyParticleMaterial);
scene.add(energyParticleSystem);

// Border lines (keep as is, cool effect)
const borderLinesGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(SPAWN_AREA_SIZE, SPAWN_AREA_SIZE, SPAWN_AREA_SIZE));
export const borderLinesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
const borderLines = new THREE.LineSegments(borderLinesGeometry, borderLinesMaterial);
scene.add(borderLines);

// Border walls (faces) with animated shader
const borderWallGeometry = new THREE.BoxGeometry(SPAWN_AREA_SIZE, SPAWN_AREA_SIZE, SPAWN_AREA_SIZE);
export const borderWallShaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
        cameraPos: { value: new THREE.Vector3() },
        // Match fog distance for faces and border lines
        fadeNear: { value: FOG_NEAR },
        fadeFar: { value: FOG_FAR },
        borderHue: { value: 0.0 },
        time: { value: 0.0 },
    },
    vertexShader: `
        varying vec3 vPosition;
        void main() {
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 cameraPos;
        uniform float fadeNear;
        uniform float fadeFar;
        uniform float borderHue;
        uniform float time;
        varying vec3 vPosition;

        void main() {
            float dist = length(vPosition - cameraPos);
            float fade = smoothstep(fadeFar, fadeNear, dist);

            // Cyan base color with subtle animated variation
            float anim = 0.5
                + 0.18 * sin(0.18 * (vPosition.x + vPosition.y + vPosition.z) + time * 1.2)
                + 0.14 * sin(0.25 * (vPosition.x - vPosition.y) - time * 0.9)
                + 0.13 * sin(0.22 * vPosition.z + time * 1.1)
                + 0.13 * sin(0.19 * length(vPosition.xy) + time * 1.3)
                + 0.12 * sin(0.21 * length(vPosition.yz) - time * 1.0);
            anim = clamp(anim, 0.0, 1.0);

            // Cyan: RGB(0, 1, 1) with slight variation
            float cyanR = 0.0 + 0.08 * anim;
            float cyanG = 0.85 + 0.15 * anim;
            float cyanB = 0.95 + 0.05 * anim;
            vec3 borderColor = vec3(cyanR, cyanG, cyanB);

            float alpha = fade * mix(0.18, 0.32, anim);
            gl_FragColor = vec4(borderColor, alpha);
            if (gl_FragColor.a < 0.01) discard;
        }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide // Render inside faces only
});
const borderWalls = new THREE.Mesh(borderWallGeometry, borderWallShaderMaterial);
scene.add(borderWalls);

let borderHue = 0;

const light = new THREE.DirectionalLight(0xffffff, 5);
light.position.set(10, 20, 15);
scene.add(light);

export const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8888ff, 1.5);
scene.add(hemiLight);

camera.position.z = 10;


let wHeld = false;
let sHeld = false;
let aHeld = false;
let dHeld = false;
let velocity = 0;
let strafeVelocity = 0;

export let orbitRadius = 10;
export let targetOrbitRadius = orbitRadius;
export let orbitLerpTime = 0;
export let orbitLerpDuration = 4; // seconds
export let orbitLerpActive = false;
let prevOrbitRadius = orbitRadius;
export let orbitAzimuth = 0;
export let orbitPolar = Math.PI / 2;
export const minPolar = 0.1;
export const maxPolar = Math.PI - 0.1;

const forwardVector = new THREE.Vector3();


function updateCamera() {
    // Calculate intended camera position
    let camOffset = new THREE.Vector3(
        Math.sin(orbitPolar) * Math.sin(orbitAzimuth),
        Math.cos(orbitPolar),
        Math.sin(orbitPolar) * Math.cos(orbitAzimuth)
    ).multiplyScalar(orbitRadius);
    let intendedPos = mainSphere.position.clone().add(camOffset);

    // Cube barrier logic
    const half = SPAWN_AREA_SIZE / 2 - 0.01; // 0.01: stay just inside
    let clamped = false;
    let clampedPos = intendedPos.clone();
    // Clamp each axis
    ["x", "y", "z"].forEach(axis => {
        if (clampedPos[axis] > half) {
            clampedPos[axis] = half;
            clamped = true;
        } else if (clampedPos[axis] < -half) {
            clampedPos[axis] = -half;
            clamped = true;
        }
    });

    // If clamped, move camera closer to player along the view direction until inside
    if (clamped) {
        // Direction from player to camera
        let dir = camOffset.clone().normalize();
        // Binary search for closest point inside the cube
        let minT = 0.0, maxT = orbitRadius, t = orbitRadius;
        for (let i = 0; i < 10; i++) {
            let testPos = mainSphere.position.clone().add(dir.clone().multiplyScalar(t));
            if (
                testPos.x > half || testPos.x < -half ||
                testPos.y > half || testPos.y < -half ||
                testPos.z > half || testPos.z < -half
            ) {
                maxT = t;
            } else {
                minT = t;
            }
            t = (minT + maxT) / 2;
        }
        clampedPos = mainSphere.position.clone().add(dir.clone().multiplyScalar(t - 0.01));
    }

    camera.position.copy(clampedPos);
    camera.lookAt(mainSphere.position);
}



let examineForward = new THREE.Vector3(0, 0, -1);
let lastLeaderboardUpdateTime = 0;
const botsToRemove = [];
const nebulosaToRemove = [];

function updateLeaderboard() {
    const playersForLeaderboard = [];

    // Add main player
    playersForLeaderboard.push({
        name: playerName || 'You',
        mass: Math.floor(mainSphere.geometry.parameters.radius ** 2),
        isPlayer: true
    });

    // Add other players
    for (const id in otherPlayers) {
        const player = otherPlayers[id];
        playersForLeaderboard.push({
            name: player.name || 'Player',
            mass: Math.floor(player.mesh.geometry.parameters.radius ** 2)
        });
    }

    // Add bots
    for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (bot.active) {
            playersForLeaderboard.push({
                name: `Bot ${i + 1}`,
                mass: Math.floor(bot.radius ** 2)
            });
        }
    }

    // Sort by mass
    playersForLeaderboard.sort((a, b) => b.mass - a.mass);

    // Update UI
    leaderboardList.innerHTML = '';
    const top10 = playersForLeaderboard.slice(0, 10);
    top10.forEach(p => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.padding = '4px 0';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        if (p.isPlayer) {
            li.style.fontWeight = 'bold';
            li.style.color = '#7ed6ff';
        }
        li.innerHTML = `<span>${p.name}</span><span>${p.mass}</span>`;
        leaderboardList.appendChild(li);
    });
}

function checkEatCondition(radius1, radius2, distance) {
    // Bigger sphere must be at least 10% larger in radius.
    if (radius1 < radius2 * 1.1) {
        return false;
    }

    // Lower the threshold so bots can eat from further away (increase the multiplier and reduce the cap factor)
    // Original: 0.8 * radius2 + sqrt(radius1^2 - 0.36 * radius2^2)
    // New: 1.2 * radius2 + sqrt(radius1^2 - 0.16 * radius2^2)
    const thresholdDistance = 0.8 * radius2 + Math.sqrt(radius1 * radius1 - 0.36 * radius2 * radius2);
    return distance < thresholdDistance;
}

animate();

window.addEventListener('keydown', (event) => {
    if (escMenu.style.display !== 'none') return;
    const k = event.key.toLowerCase();
    if (k === 'w') wHeld = true;
    if (k === 's') sHeld = true;
    if (k === 'a') aHeld = true;
    if (k === 'd') dHeld = true;
});

window.addEventListener('keyup', (event) => {
    if (escMenu.style.display !== 'none') return;
    const k = event.key.toLowerCase();
    if (k === 'w') wHeld = false;
    if (k === 's') sHeld = false;
    if (k === 'a') aHeld = false;
    if (k === 'd') dHeld = false;
});

renderer.domElement.style.cursor = 'none';



renderer.domElement.addEventListener('mousedown', (e) => {
    // If operator UI is visible and click is inside it, do NOT request pointer lock
    if (operatorUIVisible && operatorDiv.style.display !== 'none') {
        if (operatorDiv.contains(e.target)) {
            // Prevent pointer lock and context menu
            e.preventDefault();
            return;
        }
    }
    if (e.button === 2) {
        showModeBtn();
        scheduleModeBtnFade();
        if (e.target !== modeBtn) {
            cameraMode = cameraMode === 'normal' ? 'examine' : 'normal';
            lastToggleTime = Date.now();
            updateModeBtn();
        }
        e.preventDefault();
    }
    // Only request pointer lock if menu is not up and operator UI is not visible
    if (escMenu.style.display === 'none' && !operatorUIVisible) {
        renderer.domElement.requestPointerLock();
    }
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
        document.addEventListener('mousemove', onPointerLockMove);
    } else {
        document.removeEventListener('mousemove', onPointerLockMove);
    }
});

function onPointerLockMove(event) {
    const dx = event.movementX || 0;
    const dy = event.movementY || 0;
    orbitAzimuth -= dx * ORBIT_SENSITIVITY;
    orbitPolar -= dy * ORBIT_SENSITIVITY;
    orbitPolar = Math.max(minPolar, Math.min(maxPolar, orbitPolar));
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});