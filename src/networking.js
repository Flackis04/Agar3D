import { io } from 'socket.io-client';
import * as THREE from 'three';
import { handlePlayerDeath } from './game.js';

export const socket = io('https://383b24bec174.ngrok-free.app');
export const otherPlayers = {};

function createOtherPlayerSphere(player) {
    const geometry = new THREE.SphereGeometry(player.radius || 1, 32, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xff4444, opacity: 0.7, transparent: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(player.x, player.y, player.z);
    return mesh;
}

export function initNetworking(scene) {
    socket.on('players', (players) => {
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
            if (otherPlayers[id].mesh) {
                scene.remove(otherPlayers[id].mesh);
            }
            delete otherPlayers[id];
        }
    });

    socket.on('you-were-eaten', (data) => {
        handlePlayerDeath(data);
    });
}

export function emitPlayerMove(mainSphere) {
    socket.emit('player-move', {
        x: mainSphere.position.x,
        y: mainSphere.position.y,
        z: mainSphere.position.z,
        radius: mainSphere.geometry.parameters.radius
    });
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