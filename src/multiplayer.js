import { io } from 'socket.io-client';
import * as THREE from 'three';

export const socket = io('http://localhost:3001');
export const otherPlayers = {};

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

function createOtherPlayerSphere(player) {
    const geometry = new THREE.SphereGeometry(player.radius || 1, 32, 32);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00AAFF,
        emissive: 0x002244,
        emissiveIntensity: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.65
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(player.x, player.y, player.z);
    console.log('Created other player sphere:', {
        position: mesh.position,
        radius: player.radius || 1,
        visible: mesh.visible,
        playerData: player
    });
    return mesh;
}

export function initNetworking(scene) {
    socket.on('players', (players) => {
        console.log('Received players:', players);
        for (const id in otherPlayers) {
            if (otherPlayers[id].mesh) {
                scene.remove(otherPlayers[id].mesh);
            }
            delete otherPlayers[id];
        }
        for (const id in players) {
            if (id !== socket.id) {
                const mesh = createOtherPlayerSphere(players[id]);
                scene.add(mesh);
                otherPlayers[id] = { mesh, name: players[id].name };
                console.log('Added other player mesh:', mesh);
            }
        }
    });

    socket.on('player-joined', (player) => {
        if (player.id !== socket.id && !otherPlayers[player.id]) {
            const mesh = createOtherPlayerSphere(player);
            scene.add(mesh);
            otherPlayers[player.id] = { mesh, name: player.name };
            console.log('Player joined, mesh added:', mesh);
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
            console.log('Player moved:', player);
        }
    });

    socket.on('player-left', (id) => {
        if (otherPlayers[id]) {
            if (otherPlayers[id].mesh) {
                scene.remove(otherPlayers[id].mesh);
            }
            delete otherPlayers[id];
            console.log('Player left:', id);
        }
    });
}

export function emitPlayerMove(mainSphere) {
    socket.emit('player-move', {
        x: mainSphere.position.x,
        y: mainSphere.position.y,
        z: mainSphere.position.z,
        radius: mainSphere.geometry.parameters.radius
    });
    updatePositionDisplay(mainSphere);
}

function updatePositionDisplay(mainSphere) {
    const positionElement = document.getElementById('position');
    if (positionElement) {
        positionElement.textContent = `Position: (${mainSphere.position.x.toFixed(2)}, ${mainSphere.position.y.toFixed(2)}, ${mainSphere.position.z.toFixed(2)})`;
    }
}

export function emitJoin(playerName, mainSphere) {
    socket.emit('join', {
        name: playerName,
        x: mainSphere.position.x,
        y: mainSphere.position.y,
        z: mainSphere.position.z,
        radius: mainSphere.geometry.parameters.radius
    });
}

export function emitEat(data) {
    socket.emit('eat', data);
}

export function emitInitPellets(pelletData) {
    socket.emit('init-pellets', {
        positions: pelletData.positions.map(p => ({ x: p.x, y: p.y, z: p.z })),
        active: pelletData.active,
        powerUps: pelletData.powerUps
    });
}

export function emitPelletEaten(index) {
    socket.emit('pellet-eaten', { index });
}

export function emitPelletRespawn(index, position, isPowerUp) {
    socket.emit('pellet-respawn', {
        index,
        position: { x: position.x, y: position.y, z: position.z },
        isPowerUp
    });
}

export function setupPelletSync(pelletData, onPelletEaten, onPelletRespawn) {
    socket.on('pellet-state', (state) => {
        console.log('Received pellet state from server');
        // Update local pellet state to match server
        for (let i = 0; i < state.active.length; i++) {
            pelletData.active[i] = state.active[i];
            pelletData.positions[i].set(state.positions[i].x, state.positions[i].y, state.positions[i].z);
            pelletData.powerUps[i] = state.powerUps[i];
        }
    });
    
    socket.on('pellet-eaten', (data) => {
        if (onPelletEaten) onPelletEaten(data.index);
    });
    
    socket.on('pellet-respawn', (data) => {
        if (onPelletRespawn) onPelletRespawn(data.index, data.position, data.isPowerUp);
    });
}