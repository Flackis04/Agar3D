// Player module
import * as THREE from 'three';
import { ORBIT_SENSITIVITY, MAX_SPEED, ACCEL, DECEL, SPAWN_AREA_SIZE } from './config.js';

export let wHeld = false;
export let sHeld = false;
export let aHeld = false;
export let dHeld = false;
export let cameraMode = 'normal';
export let examineForward = new THREE.Vector3(0, 0, -1);

// Player movement state
let velocity = 0;
let strafeVelocity = 0;

// Camera orbit state
let orbitRadius = 10;
let targetOrbitRadius = 10;
let orbitLerpTime = 0;
let orbitLerpDuration = 4;
let orbitLerpActive = false;
let orbitAzimuth = 0;
let orbitPolar = Math.PI / 2;
const minPolar = 0.1;
const maxPolar = Math.PI - 0.1;


export function initPlayer() {
    wHeld = false;
    sHeld = false;
    aHeld = false;
    dHeld = false;
    cameraMode = 'normal';
    examineForward.set(0, 0, -1);
    velocity = 0;
    strafeVelocity = 0;
    orbitRadius = 10;
    targetOrbitRadius = 10;
    orbitLerpTime = 0;
    orbitLerpActive = false;
    orbitAzimuth = 0;
    orbitPolar = Math.PI / 2;
}

export function updatePlayer(deltaTime, mainSphere, camera) {
    // --- Player Movement ---
    const forwardVector = new THREE.Vector3();
    camera.getWorldDirection(forwardVector);
    forwardVector.y = 0;
    forwardVector.normalize();

    const rightVector = new THREE.Vector3().crossVectors(camera.up, forwardVector).normalize();

    if (wHeld) velocity = Math.min(velocity + ACCEL * deltaTime, MAX_SPEED);
    else if (sHeld) velocity = Math.max(velocity - ACCEL * deltaTime, -MAX_SPEED);
    else {
        if (velocity > 0) velocity = Math.max(0, velocity - DECEL * deltaTime);
        else velocity = Math.min(0, velocity + DECEL * deltaTime);
    }

    if (dHeld) strafeVelocity = Math.min(strafeVelocity + ACCEL * deltaTime, MAX_SPEED);
    else if (aHeld) strafeVelocity = Math.max(strafeVelocity - ACCEL * deltaTime, -MAX_SPEED);
    else {
        if (strafeVelocity > 0) strafeVelocity = Math.max(0, strafeVelocity - DECEL * deltaTime);
        else strafeVelocity = Math.min(0, strafeVelocity + DECEL * deltaTime);
    }

    mainSphere.position.addScaledVector(forwardVector, velocity * deltaTime);
    mainSphere.position.addScaledVector(rightVector, strafeVelocity * deltaTime);

    // --- Boundary Collision ---
    const half = SPAWN_AREA_SIZE / 2 - mainSphere.geometry.parameters.radius;
    mainSphere.position.x = Math.max(-half, Math.min(half, mainSphere.position.x));
    mainSphere.position.y = Math.max(-half, Math.min(half, mainSphere.position.y));
    mainSphere.position.z = Math.max(-half, Math.min(half, mainSphere.position.z));

    // --- Camera Update ---
    updateCamera(mainSphere, camera);
}

function updateCamera(mainSphere, camera) {
    const camOffset = new THREE.Vector3(
        Math.sin(orbitPolar) * Math.sin(orbitAzimuth),
        Math.cos(orbitPolar),
        Math.sin(orbitPolar) * Math.cos(orbitAzimuth)
    ).multiplyScalar(orbitRadius);
    
    const intendedPos = mainSphere.position.clone().add(camOffset);
    camera.position.copy(intendedPos);
    camera.lookAt(mainSphere.position);
}

export function initPlayerControls(renderer) {
    window.addEventListener('keydown', (event) => {
        if (document.getElementById('escMenu').style.display !== 'none') return;
        const k = event.key.toLowerCase();
        if (k === 'w') wHeld = true;
        if (k === 's') sHeld = true;
        if (k === 'a') aHeld = true;
        if (k === 'd') dHeld = true;
    });

    window.addEventListener('keyup', (event) => {
        if (document.getElementById('escMenu').style.display !== 'none') return;
        const k = event.key.toLowerCase();
        if (k === 'w') wHeld = false;
        if (k === 's') sHeld = false;
        if (k === 'a') aHeld = false;
        if (k === 'd') dHeld = false;
    });

    renderer.domElement.addEventListener('mousedown', (e) => {
        if (document.getElementById('operatorDiv').style.display !== 'none' && document.getElementById('operatorDiv').contains(e.target)) {
            e.preventDefault();
            return;
        }
        if (e.button === 2) {
            window.dispatchEvent(new CustomEvent('showModeBtn'));
            if (e.target !== document.getElementById('modeBtn')) {
                cameraMode = cameraMode === 'normal' ? 'examine' : 'normal';
                window.dispatchEvent(new CustomEvent('updateModeBtn'));
            }
            e.preventDefault();
        }
        if (document.getElementById('escMenu').style.display === 'none' && document.getElementById('operatorDiv').style.display === 'none') {
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
}
