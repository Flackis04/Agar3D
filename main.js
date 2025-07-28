import { io } from 'socket.io-client';

const socket = io('https://383b24bec174.ngrok-free.app');
const otherPlayers = {};

function createOtherPlayerSphere(player) {
    const geometry = new THREE.SphereGeometry(player.radius || 1, 32, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xff4444, opacity: 0.7, transparent: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(player.x, player.y, player.z);
    return mesh;
}

socket.on('players', (players) => {
    for (const id in otherPlayers) {
        scene.remove(otherPlayers[id].mesh);
        delete otherPlayers[id];
    }
    for (const id in players) {
        if (id !== socket.id) {
            const mesh = createOtherPlayerSphere(players[id]);
            scene.add(mesh);
            otherPlayers[id] = { mesh, name: players[id].name };
        }
    }
});

socket.on('player-joined', (player) => {
    if (player.id !== socket.id && !otherPlayers[player.id]) {
        const mesh = createOtherPlayerSphere(player);
        scene.add(mesh);
        otherPlayers[player.id] = { mesh, name: player.name };
    }
});

socket.on('player-moved', (player) => {
    if (player.id !== socket.id && otherPlayers[player.id]) {
        const mesh = otherPlayers[player.id].mesh;
        mesh.position.set(player.x, player.y, player.z);
        if (mesh.geometry.parameters.radius !== player.radius) {
            mesh.geometry.dispose();
            mesh.geometry = new THREE.SphereGeometry(player.radius, 32, 32);
        }
    }
});

socket.on('player-left', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id].mesh);
        delete otherPlayers[id];
    }
});

// Update the 'you-were-eaten' event to accept a killer name
socket.on('you-were-eaten', (data) => {
    gameStarted = false;
    scene.remove(mainSphere);
    // Show the renderer and coordinates on death UI
    renderer.domElement.style.display = '';
    coordsDiv.style.display = '';
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
    lastSurvivalTime = ((Date.now() - gameStartTime) / 1000).toFixed(1);
    lastMass = mainSphere.geometry.parameters.radius.toFixed(2);
    let absorbedBy = '';
    if (data && data.killerName) {
        absorbedBy = `Absorbed by <b>${data.killerName ? data.killerName : 'a player'}</b>`;
    } else {
        absorbedBy = 'Absorbed by <b>a player</b>';
    }
    deathStatsDiv.innerHTML = `Survival Time: <b>${lastSurvivalTime}</b> seconds<br>Final Mass: <b>${lastMass}</b><br>${absorbedBy}`;
    deathMenu.style.display = 'flex';
    startMenu.style.display = 'none';
    escMenu.style.display = 'none';
});

import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// Fog settings for gameplay
const FOG_COLOR = 0x222233;
const FOG_NEAR = 40;
const FOG_FAR = 120;
function enableGameFog() {
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    renderer.setClearColor(FOG_COLOR);
}
function disableGameFog() {
    scene.fog = null;
    renderer.setClearColor(0x000000);
}

// --- Start Menu Overlay ---

// Camera mode: 'normal' or 'examine'
let cameraMode = 'normal';

// Escape menu overlay
const escMenu = document.createElement('div');
escMenu.style.position = 'fixed';
escMenu.style.top = '0';
escMenu.style.left = '0';
escMenu.style.width = '100vw';
escMenu.style.height = '100vh';
escMenu.style.background = 'rgba(0,0,0,0.7)';
escMenu.style.display = 'none';
escMenu.style.flexDirection = 'column';
escMenu.style.justifyContent = 'center';
escMenu.style.alignItems = 'center';
escMenu.style.zIndex = '2000';
escMenu.innerHTML = `
  <div style="background:#222;padding:2em 3em;border-radius:1em;box-shadow:0 0 30px #000;display:flex;flex-direction:column;align-items:center;">
    <h2 style="color:white;margin-bottom:1em;">Leave Game?</h2>
    <div style="display:flex;gap:2em;">
      <button id="escYesBtn" style="font-size:1.2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#ff4444;color:white;cursor:pointer;">Yes</button>
      <button id="escNoBtn" style="font-size:1.2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#0077ff;color:white;cursor:pointer;">No</button>
    </div>
  </div>
`;
document.body.appendChild(escMenu);
const startMenu = document.createElement('div');
startMenu.style.position = 'fixed';
startMenu.style.top = '0';
startMenu.style.left = '0';
startMenu.style.width = '100vw';
startMenu.style.height = '100vh';
startMenu.style.background = 'rgba(0,0,0,0.85)';
startMenu.style.display = 'flex';
startMenu.style.flexDirection = 'column';
startMenu.style.justifyContent = 'center';
startMenu.style.alignItems = 'center';
startMenu.style.zIndex = '1000';
startMenu.innerHTML = `
  <h1 style="color:white;font-size:3em;margin-bottom:1em;">Agar3D</h1>
  <input id="playerNameInput" type="text" placeholder="Enter your name (optional)" style="font-size:1.3em;padding:0.4em 1em;margin-bottom:1em;border-radius:0.5em;border:none;outline:none;width:300px;max-width:80vw;box-sizing:border-box;" />
  <button id="playBtn" style="font-size:2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#0077ff;color:white;cursor:pointer;">Play</button>
`;
document.body.appendChild(startMenu);
document.body.appendChild(renderer.domElement);


let playerName = '';
let gameStarted = false;

// Track survival time
let gameStartTime = 0;
let lastSurvivalTime = 0;
let lastMass = 0;

// Death UI overlay
const deathMenu = document.createElement('div');
deathMenu.style.position = 'fixed';
deathMenu.style.top = '0';
deathMenu.style.left = '0';
deathMenu.style.width = '100vw';
deathMenu.style.height = '100vh';
deathMenu.style.background = 'rgba(0,0,0,0.85)';
deathMenu.style.display = 'none';
deathMenu.style.flexDirection = 'column';
deathMenu.style.justifyContent = 'center';
deathMenu.style.alignItems = 'center';
deathMenu.style.zIndex = '3000';
deathMenu.innerHTML = `
  <div style="background:#222;padding:2em 3em;border-radius:1em;box-shadow:0 0 30px #000;display:flex;flex-direction:column;align-items:center;min-width:320px;">
    <h2 style="color:white;margin-bottom:1em;">You Died!</h2>
    <div id="deathStats" style="color:white;font-size:1.2em;margin-bottom:1.5em;text-align:center;"></div>
    <div style="display:flex;gap:2em;">
      <button id="deathHomeBtn" style="font-size:1.2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#ff4444;color:white;cursor:pointer;">Home</button>
      <button id="deathPlayBtn" style="font-size:1.2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#0077ff;color:white;cursor:pointer;">Play Again</button>
    </div>
  </div>
`;
document.body.appendChild(deathMenu);
const deathStatsDiv = deathMenu.querySelector('#deathStats');
const deathHomeBtn = deathMenu.querySelector('#deathHomeBtn');
const deathPlayBtn = deathMenu.querySelector('#deathPlayBtn');

deathHomeBtn.addEventListener('click', () => {
    deathMenu.style.display = 'none';
    startMenu.style.display = 'flex';
    // Remove the player's sphere and hide the renderer canvas
    scene.remove(mainSphere);
    renderer.domElement.style.display = 'none';
    coordsDiv.style.display = 'none';
    gameStarted = false;
    disableGameFog();
});

deathPlayBtn.addEventListener('click', () => {
    deathMenu.style.display = 'none';
    startGame();
});

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
    enableGameFog();
    // Re-add the player's sphere to the scene if not present
    if (!scene.children.includes(mainSphere)) {
        scene.add(mainSphere);
    }
    // Set a random safe spawn position
    const spawnPos = findSafeSpawnPosition();
    mainSphere.position.copy(spawnPos);
    // Show the renderer canvas and coordinates
    renderer.domElement.style.display = '';
    coordsDiv.style.display = '';
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
    // Remove the player's sphere and hide the renderer canvas
    scene.remove(mainSphere);
    renderer.domElement.style.display = 'none';
    coordsDiv.style.display = 'none';
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
coordsDiv.style.right = '240px'; // moved left to avoid FPS overlay
coordsDiv.style.padding = '5px 10px';
coordsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
coordsDiv.style.color = 'white';
coordsDiv.style.fontFamily = 'monospace';
coordsDiv.style.fontSize = '14px';
coordsDiv.style.borderRadius = '5px';

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
modeBtn.textContent = 'Examine Mode: OFF';
document.body.appendChild(coordsDiv);
document.body.appendChild(modeBtn);



let modeBtnFadeTimeout = null;
let lastToggleTime = Date.now();
let modeBtnVisible = false;


function showModeBtn() {
    modeBtn.style.opacity = '0.85';
    modeBtnVisible = true;
    if (modeBtnFadeTimeout) clearTimeout(modeBtnFadeTimeout);
}


function hideModeBtn() {
    modeBtn.style.opacity = '0';
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

const MAX_SPEED = 0.4;
const ACCEL = 0.04;
const DECEL = 0.06;
const ORBIT_SENSITIVITY = 0.005;
const SPAWN_AREA_SIZE = 800;
const SMALL_SPHERE_COUNT = SPAWN_AREA_SIZE * 10;
const MIN_SPAWN_RADIUS_SQ = 5 * 5;

const mainSphereGeometry = new THREE.SphereGeometry(1, 32, 32);
const mainSphereMaterial = new THREE.MeshStandardMaterial({ color: 0x0077ff, opacity: 0.6, transparent: true });
const mainSphere = new THREE.Mesh(mainSphereGeometry, mainSphereMaterial);
scene.add(mainSphere);


const SMALL_COLORS = [
    0xff0000, // Red
    0x0077ff, // Blue
    0x00ff00, // Green
    0xffff00, // Yellow
    0x9b30ff, // Purple
    0xff9900, // Orange
    0x7ed6ff, // Light Blue
    0xff69b4  // Pink
];

// --- Instanced Spheres for Performance ---
const smallSpheres = []; // To hold data like position, radius, color
const smallSphereGeometry = new THREE.SphereGeometry(1, 16, 16); // Base geometry, scaled by instance matrix
const smallSphereMaterial = new THREE.MeshStandardMaterial({ vertexColors: true });
const smallSphereInstances = new THREE.InstancedMesh(smallSphereGeometry, smallSphereMaterial, SMALL_SPHERE_COUNT);
scene.add(smallSphereInstances);

const tempMatrix = new THREE.Matrix4();
const tempColor = new THREE.Color();


// Border lines (keep as is, cool effect)
const borderLinesGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(SPAWN_AREA_SIZE, SPAWN_AREA_SIZE, SPAWN_AREA_SIZE));
const borderLinesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
const borderLines = new THREE.LineSegments(borderLinesGeometry, borderLinesMaterial);
scene.add(borderLines);

// Border walls (faces) with animated shader
const borderWallGeometry = new THREE.BoxGeometry(SPAWN_AREA_SIZE, SPAWN_AREA_SIZE, SPAWN_AREA_SIZE);
const borderWallShaderMaterial = new THREE.ShaderMaterial({
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

const tempPosition = new THREE.Vector3();
// Initialization of instanced spheres
for (let i = 0; i < SMALL_SPHERE_COUNT; i++) {
    let valid = false;
    let attempts = 0;
    let radius = 0;

    // This initial placement can be slow, but only runs once at startup.
    while (!valid && attempts < 100) {
        radius = 0.5 + Math.random() * 0.4;
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
                if (smallSpheres[j].active) {
                    if (tempPosition.distanceTo(smallSpheres[j].position) < radius + smallSpheres[j].radius + 0.1) {
                        valid = false;
                        break;
                    }
                }
            }
        }
        attempts++;
    }

    const color = SMALL_COLORS[Math.floor(Math.random() * SMALL_COLORS.length)];
    tempColor.set(color); 

    smallSpheres.push({
        position: tempPosition.clone(),
        radius: radius,
        active: true,
        color: tempColor.clone()
    });

    // Set the matrix for this instance
    const scale = new THREE.Vector3(radius, radius, radius);
    tempMatrix.compose(tempPosition, new THREE.Quaternion(), scale);
    smallSphereInstances.setMatrixAt(i, tempMatrix);
    smallSphereInstances.setColorAt(i, tempColor);
}
smallSphereInstances.instanceMatrix.needsUpdate = true;
smallSphereInstances.instanceColor.needsUpdate = true;

const light = new THREE.DirectionalLight(0xffffff, 5);
light.position.set(10, 20, 15);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8888ff, 1.5);
scene.add(hemiLight);

camera.position.z = 10;


let wHeld = false;
let sHeld = false;
let velocity = 0;

let orbitRadius = 10;
let targetOrbitRadius = orbitRadius;
let orbitLerpTime = 0;
let orbitLerpDuration = 4; // seconds
let orbitLerpActive = false;
let prevOrbitRadius = orbitRadius;
let orbitAzimuth = 0;
let orbitPolar = Math.PI / 2;
const minPolar = 0.1;
const maxPolar = Math.PI - 0.1;

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


function animate() {
    requestAnimationFrame(animate);
    if (!gameStarted) {
        return;
    }
    const now = performance.now() * 0.001;
    // Use deltaTime for more accurate interpolation
    animate.lastTime = animate.lastTime || now;
    const deltaTime = Math.min(now - animate.lastTime, 0.1); // clamp to avoid big jumps
    animate.lastTime = now;
    if (orbitLerpActive) {
        orbitLerpTime += deltaTime;
        let t = Math.min(orbitLerpTime / orbitLerpDuration, 1);
        // S-curve (smoothstep)
        t = t * t * (3 - 2 * t);
        orbitRadius = prevOrbitRadius + (targetOrbitRadius - prevOrbitRadius) * t;
        if (t >= 1) {
            orbitRadius = targetOrbitRadius;
            orbitLerpActive = false;
        }
    }

    // Animate border hue and update shader uniforms
    borderHue = (borderHue + 0.5) % 360;
    // Border lines: keep as is
    borderLinesMaterial.color.setHSL(borderHue / 360, 1, 0.5);
    // Border wall faces: animated shader
    borderWallShaderMaterial.uniforms.borderHue.value = borderHue / 360;
    borderWallShaderMaterial.uniforms.cameraPos.value.copy(camera.position);
    // Match fog distance for faces and border lines
    borderWallShaderMaterial.uniforms.fadeNear.value = FOG_NEAR;
    borderWallShaderMaterial.uniforms.fadeFar.value = FOG_FAR;
    borderWallShaderMaterial.uniforms.time.value = now;

    // Acceleration and deceleration
    let target = 0;
    if (wHeld) target += 1;
    if (sHeld) target -= 1;
    // Lerp velocity toward target*MAX_SPEED
    if (target !== 0) {
        velocity += (target * MAX_SPEED - velocity) * ACCEL;
    } else {
        velocity += (0 - velocity) * DECEL;
    }

    // Move and clamp
    if (escMenu.style.display === 'none' && Math.abs(velocity) > 0.001) {
        let moveDir = new THREE.Vector3();
        if (cameraMode === 'normal') {
            camera.getWorldDirection(moveDir);
            examineForward.copy(moveDir);
        } else {
            // In examine mode, use the last direction from normal mode
            moveDir.copy(examineForward);
        }
        mainSphere.position.add(moveDir.clone().multiplyScalar(velocity));
        const radius = mainSphere.geometry.parameters.radius;
        const half = SPAWN_AREA_SIZE / 2 - radius;
        mainSphere.position.x = Math.max(-half, Math.min(half, mainSphere.position.x));
        mainSphere.position.y = Math.max(-half, Math.min(half, mainSphere.position.y));
        mainSphere.position.z = Math.max(-half, Math.min(half, mainSphere.position.z));

        // Only emit move if position changed significantly
        animate.lastEmitPos = animate.lastEmitPos || new THREE.Vector3();
        const emitThreshold = 0.01;
        if (mainSphere.position.distanceTo(animate.lastEmitPos) > emitThreshold) {
            socket.emit('move', {
                x: mainSphere.position.x,
                y: mainSphere.position.y,
                z: mainSphere.position.z,
                radius: mainSphere.geometry.parameters.radius
            });
            animate.lastEmitPos.copy(mainSphere.position);
        }
    }

    // Remove small spheres if more than a certain amount of their surface is covered
    let R = mainSphere.geometry.parameters.radius;
    const toRemoveIndexes = [];
    let newRadius = R;
    let anyAbsorbed = false;
    const maxAbsorbDist = R + 1.5; // Max small sphere radius is ~0.9

    for (let i = 0; i < smallSpheres.length; i++) {
        const sphereData = smallSpheres[i];
        if (!sphereData.active) continue;

        const r = sphereData.radius;
        const d = mainSphere.position.distanceTo(sphereData.position);

        if (d > maxAbsorbDist + r) continue; // skip far blobs

        if (d < R + r) {
            const h = r - (d * d - R * R + r * r) / (2 * d);
            if (h > 0) {
                const capArea = 2 * Math.PI * r * h;
                const totalArea = 4 * Math.PI * r * r;
                if (capArea / totalArea > 0.1) {
                    toRemoveIndexes.push(i);
                    newRadius = Math.sqrt(newRadius * newRadius + r * r);
                    anyAbsorbed = true;
                }
            }
        }
    }

    if (anyAbsorbed) {
        // Adjust camera orbitRadius to maintain same % distance, but animate smoothly
        const prevRadius = R;
        const prevOrbitRatio = orbitRadius / prevRadius;
        // If a lerp is already active, accumulate any remaining distance
        if (orbitLerpActive) {
            // Compute how much of the previous lerp was left
            let t = Math.min(orbitLerpTime / orbitLerpDuration, 1);
            t = t * t * (3 - 2 * t); // smoothstep
            // The actual radius at this moment is:
            const currentLerpRadius = prevOrbitRadius + (targetOrbitRadius - prevOrbitRadius) * t;
            // The remaining distance that was not lerped yet:
            const remainingDistance = targetOrbitRadius - currentLerpRadius;
            // Set prevOrbitRadius to the current camera radius
            prevOrbitRadius = currentLerpRadius;
            // The new target should be the new proportional target, plus the remaining distance
            targetOrbitRadius = prevOrbitRatio * newRadius + remainingDistance;
        } else {
            prevOrbitRadius = orbitRadius;
            targetOrbitRadius = prevOrbitRatio * newRadius;
        }
        orbitLerpTime = 0;
        orbitLerpActive = true;
        const newGeometry = new THREE.SphereGeometry(newRadius, 32, 32);
        mainSphere.geometry.dispose();
        mainSphere.geometry = newGeometry;
    }

    // Respawn eaten blobs
    let matrixNeedsUpdate = false;
    let colorNeedsUpdate = false;

    for (const index of toRemoveIndexes) {
        const sphereData = smallSpheres[index];
        sphereData.active = false; // Deactivate

        // Hide it by scaling to zero. We'll move it later if a valid spot is found.
        smallSphereInstances.getMatrixAt(index, tempMatrix);
        tempMatrix.decompose(tempPosition, new THREE.Quaternion(), new THREE.Vector3());
        tempMatrix.compose(tempPosition, new THREE.Quaternion(), new THREE.Vector3(0, 0, 0));
        smallSphereInstances.setMatrixAt(index, tempMatrix);
        matrixNeedsUpdate = true;

        // Find a valid random position and new color/size to respawn
        let valid = false;
        let attempts = 0;
        let pos = new THREE.Vector3();
        let newSphereRadius = 0;

        while (!valid && attempts < 100) {
            newSphereRadius = 0.5 + Math.random() * 0.4;
            const half = SPAWN_AREA_SIZE / 2 - newSphereRadius;
            pos.set(
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE
            );
            pos.x = Math.max(-half, Math.min(half, pos.x));
            pos.y = Math.max(-half, Math.min(half, pos.y));
            pos.z = Math.max(-half, Math.min(half, pos.z));

            valid = pos.distanceTo(mainSphere.position) > mainSphere.geometry.parameters.radius + newSphereRadius + 0.1;

            if (valid) {
                // Check against other small spheres
                for (let i = 0; i < smallSpheres.length; i++) {
                    if (i === index || !smallSpheres[i].active) continue;
                    const otherR = smallSpheres[i].radius;
                    if (pos.distanceTo(smallSpheres[i].position) < newSphereRadius + otherR + 0.1) {
                        valid = false;
                        break;
                    }
                }
            }
            attempts++;
        }

        if (valid) {
            const newColor = SMALL_COLORS[Math.floor(Math.random() * SMALL_COLORS.length)];
            tempColor.set(newColor);

            // Update data array
            sphereData.position.copy(pos);
            sphereData.radius = newSphereRadius;
            sphereData.color.copy(tempColor);
            sphereData.active = true;

            // Update instance
            const scale = new THREE.Vector3(newSphereRadius, newSphereRadius, newSphereRadius);
            tempMatrix.compose(pos, new THREE.Quaternion(), scale);
            smallSphereInstances.setMatrixAt(index, tempMatrix);
            smallSphereInstances.setColorAt(index, tempColor);
            matrixNeedsUpdate = true;
            colorNeedsUpdate = true;
        }
    }

    if (matrixNeedsUpdate) {
        smallSphereInstances.instanceMatrix.needsUpdate = true;
    }
    if (colorNeedsUpdate) {
        smallSphereInstances.instanceColor.needsUpdate = true;
    }


    const { x, y, z } = mainSphere.position;
    const currentRadius = mainSphere.geometry.parameters.radius;
    coordsDiv.textContent = `x: ${x.toFixed(2)}, y: ${y.toFixed(2)}, z: ${z.toFixed(2)}\nradius: ${currentRadius.toFixed(2)}`;

    // FPS calculation
    animate._frames = (animate._frames || 0) + 1;
    animate._lastFpsTime = animate._lastFpsTime || performance.now();
    const nowFps = performance.now();
    if (nowFps - animate._lastFpsTime > 500) {
        const fps = Math.round(1000 * animate._frames / (nowFps - animate._lastFpsTime));
        fpsDiv.textContent = `FPS: ${fps}`;
        animate._frames = 0;
        animate._lastFpsTime = nowFps;
    }
    updateCamera();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('keydown', (event) => {
    if (escMenu.style.display !== 'none') return;
    if (event.key.toLowerCase() === 'w') wHeld = true;
    if (event.key.toLowerCase() === 's') sHeld = true;
});

window.addEventListener('keyup', (event) => {
    if (escMenu.style.display !== 'none') return;
    if (event.key.toLowerCase() === 'w') wHeld = false;
    if (event.key.toLowerCase() === 's') sHeld = false;
});

renderer.domElement.style.cursor = 'none';



renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        // Show the button and schedule fade
        showModeBtn();
        scheduleModeBtnFade();
        // Only toggle if not clicking the button itself
        if (e.target !== modeBtn) {
            cameraMode = cameraMode === 'normal' ? 'examine' : 'normal';
            lastToggleTime = Date.now();
            updateModeBtn();
        }
        // Prevent context menu
        e.preventDefault();
    }
    // Only request pointer lock if menu is not up
    if (escMenu.style.display === 'none') {
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