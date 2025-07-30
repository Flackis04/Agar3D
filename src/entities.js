// Entities module
import * as THREE from 'three';
import { PELLET_COUNT, PELLET_COLORS, NEBULOSA_COUNT, NEBULOSA_COLOR, NEBULOSA_MIN_RADIUS, NEBULOSA_MAX_RADIUS, NEBULOSA_AVERAGE_RADIUS, BOTS_COUNT, BOTS_COLOR, BOT_MIN_RADIUS, BOT_AVERAGE_RADIUS, BOT_MAX_RADIUS, SPAWN_AREA_SIZE, MIN_SPAWN_RADIUS_SQ, BOT_SPEED } from './config.js';

export const pellets = [];
export const nebulosa = [];
export const bots = [];
export let pelletInstances, nebulosaInstances, botsInstances;

function normalRandom(mean, stdDev) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
}

function generateNebulosaRadius() {
    const stdDev = 8;
    let radius;
    do {
        radius = normalRandom(NEBULOSA_AVERAGE_RADIUS, stdDev);
    } while (radius < NEBULOSA_MIN_RADIUS || radius > NEBULOSA_MAX_RADIUS);
    return radius;
}

function generateBotRadius() {
    const stdDev = 7;
    let radius;
    do {
        radius = normalRandom(BOT_AVERAGE_RADIUS, stdDev);
    } while (radius < BOT_MIN_RADIUS || radius > BOT_MAX_RADIUS);
    return radius;
}

export function initEntities(state) {
    const tempMatrix = new THREE.Matrix4();
    const tempColor = new THREE.Color();
    const tempPosition = new THREE.Vector3();

    // Nebulosa
    const nebulosaGeometry = new THREE.SphereGeometry(1, 32, 32);
    const nebulosaMaterial = new THREE.MeshStandardMaterial({
        color: NEBULOSA_COLOR,
        roughness: 0.3,
        metalness: 0.1,
        opacity: 0.2,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending
    });
    nebulosaInstances = new THREE.InstancedMesh(nebulosaGeometry, nebulosaMaterial, NEBULOSA_COUNT);
    state.scene.add(nebulosaInstances);

    for (let i = 0; i < NEBULOSA_COUNT; i++) {
        const radius = generateNebulosaRadius();
        const half = SPAWN_AREA_SIZE / 2 - radius;
        let pos;
        let valid = false;
        while (!valid) {
            pos = new THREE.Vector3(
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE
            );
            pos.x = Math.max(-half, Math.min(half, pos.x));
            pos.y = Math.max(-half, Math.min(half, pos.y));
            pos.z = Math.max(-half, Math.min(half, pos.z));

            if (pos.lengthSq() > MIN_SPAWN_RADIUS_SQ) {
                valid = true;
            }
        }

        nebulosa.push({
            position: pos,
            radius: radius,
            active: true
        });

        tempPosition.copy(pos);
        tempMatrix.compose(tempPosition, new THREE.Quaternion(), new THREE.Vector3(radius, radius, radius));
        nebulosaInstances.setMatrixAt(i, tempMatrix);
    }
    nebulosaInstances.instanceMatrix.needsUpdate = true;

    // Pellets
    const pelletGeometry = new THREE.SphereGeometry(1, 16, 16);
    const pelletMaterial = new THREE.MeshStandardMaterial();
    pelletInstances = new THREE.InstancedMesh(pelletGeometry, pelletMaterial, PELLET_COUNT);
    state.scene.add(pelletInstances);

    for (let i = 0; i < PELLET_COUNT; i++) {
        const half = SPAWN_AREA_SIZE / 2;
        let pos;
        let valid = false;
        while (!valid) {
            pos = new THREE.Vector3(
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE
            );
            pos.x = Math.max(-half, Math.min(half, pos.x));
            pos.y = Math.max(-half, Math.min(half, pos.y));
            pos.z = Math.max(-half, Math.min(half, pos.z));

            if (pos.lengthSq() > MIN_SPAWN_RADIUS_SQ) {
                valid = true;
            }
        }

        pellets.push({
            position: pos,
            active: true
        });

        tempMatrix.makeTranslation(pos.x, pos.y, pos.z);
        pelletInstances.setMatrixAt(i, tempMatrix);

        const color = PELLET_COLORS[Math.floor(Math.random() * PELLET_COLORS.length)];
        tempColor.set(color);
        pelletInstances.setColorAt(i, tempColor);
    }
    pelletInstances.instanceMatrix.needsUpdate = true;
    pelletInstances.instanceColor.needsUpdate = true;

    // Bots
    const botsGeometry = new THREE.SphereGeometry(1, 32, 32);
    const botsMaterial = new THREE.MeshStandardMaterial({ color: BOTS_COLOR });
    botsInstances = new THREE.InstancedMesh(botsGeometry, botsMaterial, BOTS_COUNT);
    state.scene.add(botsInstances);

    for (let i = 0; i < BOTS_COUNT; i++) {
        const radius = generateBotRadius();
        const half = SPAWN_AREA_SIZE / 2 - radius;
        let pos;
        let valid = false;
        while (!valid) {
            pos = new THREE.Vector3(
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE
            );
            pos.x = Math.max(-half, Math.min(half, pos.x));
            pos.y = Math.max(-half, Math.min(half, pos.y));
            pos.z = Math.max(-half, Math.min(half, pos.z));

            if (pos.lengthSq() > MIN_SPAWN_RADIUS_SQ) {
                valid = true;
            }
        }

        bots.push({
            position: pos,
            radius: radius,
            active: true,
            targetPosition: null,
        });

        tempPosition.copy(pos);
        tempMatrix.compose(tempPosition, new THREE.Quaternion(), new THREE.Vector3(radius, radius, radius));
        botsInstances.setMatrixAt(i, tempMatrix);
    }
    botsInstances.instanceMatrix.needsUpdate = true;
}

export function regeneratePellet(index) {
    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempColor = new THREE.Color();

    const half = SPAWN_AREA_SIZE / 2;
    let newPos;
    let valid = false;
    while (!valid) {
        newPos = new THREE.Vector3(
            (Math.random() - 0.5) * SPAWN_AREA_SIZE,
            (Math.random() - 0.5) * SPAWN_AREA_SIZE,
            (Math.random() - 0.5) * SPAWN_AREA_SIZE
        );
        newPos.x = Math.max(-half, Math.min(half, newPos.x));
        newPos.y = Math.max(-half, Math.min(half, newPos.y));
        newPos.z = Math.max(-half, Math.min(half, newPos.z));

        if (newPos.lengthSq() > MIN_SPAWN_RADIUS_SQ) {
            valid = true;
        }
    }

    pellets[index].position.copy(newPos);
    pellets[index].active = true;

    tempMatrix.makeTranslation(newPos.x, newPos.y, newPos.z);
    pelletInstances.setMatrixAt(index, tempMatrix);

    const color = PELLET_COLORS[Math.floor(Math.random() * PELLET_COLORS.length)];
    tempColor.set(color);
    pelletInstances.setColorAt(index, tempColor);

    pelletInstances.instanceMatrix.needsUpdate = true;
    pelletInstances.instanceColor.needsUpdate = true;
}


export function updateEntities(deltaTime) {
    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempScale = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion();

    // Update bots
    let needsMatrixUpdate = false;
    for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (!bot.active) continue;

        // Simple AI: wander around
        if (!bot.targetPosition || bot.position.distanceTo(bot.targetPosition) < bot.radius * 2) {
            const half = SPAWN_AREA_SIZE / 2 - bot.radius;
            bot.targetPosition = new THREE.Vector3(
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE,
                (Math.random() - 0.5) * SPAWN_AREA_SIZE
            );
            bot.targetPosition.x = Math.max(-half, Math.min(half, bot.targetPosition.x));
            bot.targetPosition.y = Math.max(-half, Math.min(half, bot.targetPosition.y));
            bot.targetPosition.z = Math.max(-half, Math.min(half, bot.targetPosition.z));
        }

        const direction = new THREE.Vector3().subVectors(bot.targetPosition, bot.position).normalize();
        bot.position.add(direction.multiplyScalar(BOT_SPEED * deltaTime));

        // Keep bot within bounds
        const half = SPAWN_AREA_SIZE / 2 - bot.radius;
        bot.position.x = Math.max(-half, Math.min(half, bot.position.x));
        bot.position.y = Math.max(-half, Math.min(half, bot.position.y));
        bot.position.z = Math.max(-half, Math.min(half, bot.position.z));

        // Update instanced mesh
        tempPosition.copy(bot.position);
        tempScale.set(bot.radius, bot.radius, bot.radius);
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        botsInstances.setMatrixAt(i, tempMatrix);
        needsMatrixUpdate = true;
    }

    if (needsMatrixUpdate) {
        botsInstances.instanceMatrix.needsUpdate = true;
    }
}
