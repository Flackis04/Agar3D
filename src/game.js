// Game logic module
import * as THREE from 'three';
import { SPAWN_AREA_SIZE } from './config.js';
import { otherPlayers, emitEat, emitJoin } from './networking.js';
import { pellets, nebulosa, bots, regeneratePellet } from './entities.js';

let gameStarted = false;
let playerName = '';
let gameStartTime = 0;
let lastSurvivalTime = 0;
let lastMass = 0;
let lastLeaderboardUpdateTime = 0;
let borderHue = 0;

export function initGame() {
    gameStarted = false;
    playerName = '';
    gameStartTime = 0;
    lastSurvivalTime = 0;
    lastMass = 0;
    lastLeaderboardUpdateTime = 0;
    borderHue = 0;
}

export function setGameStarted(value) {
    gameStarted = value;
}

export function getGameStarted() {
    return gameStarted;
}

export function startGame(name) {
    playerName = name;
    document.getElementById('startMenu').style.display = 'none';
    document.getElementById('escMenu').style.display = 'none';
    document.getElementById('deathMenu').style.display = 'none';
    gameStarted = true;
    window.dispatchEvent(new CustomEvent('enableGameFog'));
    if (!scene.children.includes(mainSphere)) {
        scene.add(mainSphere);
    }
    const spawnPos = findSafeSpawnPosition();
    mainSphere.position.copy(spawnPos);
    window.dispatchEvent(new CustomEvent('showGameUI'));
    gameStartTime = Date.now();
    emitJoin(playerName, mainSphere);
}

export function handlePlayerDeath(data) {
    if (!gameStarted) return;
    gameStarted = false;
    scene.remove(mainSphere);
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
    lastSurvivalTime = ((Date.now() - gameStartTime) / 1000).toFixed(1);
    lastMass = Math.floor(mainSphere.geometry.parameters.radius ** 2);
    let absorbedBy = '';
    if (data && data.killerName) {
        absorbedBy = `Absorbed by <b>${data.killerName ? data.killerName : 'a player'}</b>`;
    } else {
        absorbedBy = 'Absorbed by <b>a player</b>';
    }
    window.dispatchEvent(new CustomEvent('showDeathUI', { detail: { lastSurvivalTime, lastMass, absorbedBy } }));
}

export function updateGame(deltaTime, mainSphere) {
    const now = performance.now();

    // Update leaderboard periodically
    if (now - lastLeaderboardUpdateTime > 1000) {
        updateLeaderboard(mainSphere);
        lastLeaderboardUpdateTime = now;
    }

    const playerRadius = mainSphere.geometry.parameters.radius;

    // Player vs Pellets
    for (let i = 0; i < pellets.length; i++) {
        const pellet = pellets[i];
        if (!pellet.active) continue;

        const distance = mainSphere.position.distanceTo(pellet.position);
        if (distance < playerRadius) {
            const newMass = playerRadius * playerRadius + 0.5; // Pellets have mass of 0.5
            const newRadius = Math.sqrt(newMass);
            mainSphere.geometry.dispose();
            mainSphere.geometry = new THREE.SphereGeometry(newRadius, 32, 32);
            pellet.active = false;
            regeneratePellet(i);
            // Optionally emit pellet eat event if server needs to know
        }
    }

    // Player vs Bots
    for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (!bot.active) continue;

        const distance = mainSphere.position.distanceTo(bot.position);
        if (checkEatCondition(playerRadius, bot.radius, distance)) {
            const newMass = playerRadius * playerRadius + bot.radius * bot.radius;
            const newRadius = Math.sqrt(newMass);
            mainSphere.geometry.dispose();
            mainSphere.geometry = new THREE.SphereGeometry(newRadius, 32, 32);
            bot.active = false; // Deactivate bot
            // Hide bot in instanced mesh by scaling to 0
            const tempMatrix = new THREE.Matrix4();
            botsInstances.getMatrixAt(i, tempMatrix);
            tempMatrix.scale(new THREE.Vector3(0, 0, 0));
            botsInstances.setMatrixAt(i, tempMatrix);
            botsInstances.instanceMatrix.needsUpdate = true;
        }
    }
    
    // Player vs Other Players
    for (const id in otherPlayers) {
        const other = otherPlayers[id];
        const distance = mainSphere.position.distanceTo(other.mesh.position);
        const otherRadius = other.mesh.geometry.parameters.radius;
        if (checkEatCondition(playerRadius, otherRadius, distance)) {
            emitEat({ type: 'player', id: id });
            // Server will confirm the eat and update our size
        }
    }
}

function findSafeSpawnPosition(mainSphere) {
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
        for (let c of scene.children) {
            if (c.geometry && c.geometry.type === 'SphereGeometry' && c !== mainSphere) {
                const otherR = c.userData.smallRadius || 0.8;
                if (pos.distanceTo(c.position) < radius + otherR + 0.1) {
                    valid = false;
                    break;
                }
            }
        }
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

function updateLeaderboard(mainSphere) {
    const playersForLeaderboard = [];
    playersForLeaderboard.push({
        name: playerName || 'You',
        mass: Math.floor(mainSphere.geometry.parameters.radius ** 2),
        isPlayer: true
    });
    for (const id in otherPlayers) {
        const player = otherPlayers[id];
        playersForLeaderboard.push({
            name: player.name || 'Player',
            mass: Math.floor(player.mesh.geometry.parameters.radius ** 2)
        });
    }
    for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (bot.active) {
            playersForLeaderboard.push({
                name: `Bot ${i + 1}`,
                mass: Math.floor(bot.radius ** 2)
            });
        }
    }
    playersForLeaderboard.sort((a, b) => b.mass - a.mass);
    window.dispatchEvent(new CustomEvent('updateLeaderboardUI', { detail: { players: playersForLeaderboard.slice(0, 10) } }));
}

function checkEatCondition(radius1, radius2, distance) {
    if (radius1 < radius2 * 1.1) {
        return false;
    }
    const thresholdDistance = 0.8 * radius2 + Math.sqrt(radius1 * radius1 - 0.36 * radius2 * radius2);
    return distance < thresholdDistance;
}
