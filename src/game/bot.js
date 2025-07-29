const bots_COUNT = 30; // Number of bots to spawn
const bots_color = 0xcd990000;
const BOT_SPEED = 3; // Speed of the bots
const BOT_MIN_RADIUS = 1;
const BOT_AVERAGE_RADIUS = 5;
const BOT_MAX_RADIUS = 9;

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

// Bots
const bots = [];
const botsGeometry = new THREE.SphereGeometry(1, 32, 32);
const botsMaterial = new THREE.MeshStandardMaterial({ color: bots_color });
const botsInstances = new THREE.InstancedMesh(botsGeometry, botsMaterial, bots_COUNT);
scene.add(botsInstances);



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

// --- Bot Logic (Movement, Eating) ---
let botsMatrixNeedsUpdate = false;
botsToRemove.length = 0;
nebulosaToRemove.length = 0;

botsInstances.instanceMatrix.needsUpdate = true;
const botsToRemove = [];

// At the end of your file
export { bots, botsInstances };
export function updateBots(params) {
  // Move your per-frame bot logic here, using params for dependencies

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

// Deactivate eaten bots
const uniqueBotsToRemove = [...new Set(botsToRemove)];
for (const index of uniqueBotsToRemove) {
    if (bots[index]) {
        bots[index].active = false;
        const scale = new THREE.Vector3(0, 0, 0);
        tempMatrix.compose(bots[index].position, new THREE.Quaternion(), scale);
        botsInstances.setMatrixAt(index, tempMatrix);
        botsMatrixNeedsUpdate = true;
    }
}

if (botsMatrixNeedsUpdate) {
    botsInstances.instanceMatrix.needsUpdate = true;
}

  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i];
    if (!bot.active) continue;

    // Calculate this bot's MAXfog distance (same as FOG_FAR for its radius)
    const minRadius = 1;
    const maxRadius = 100;
    const t = Math.min(1, Math.max(0, (bot.radius - minRadius) / (maxRadius - minRadius)));
    const botFogFar = FOG_FAR_BASE + t * (FOG_FAR_MAX - FOG_FAR_BASE);

    // Gather all entities (main player, all network players, all bots except self)
    const allEntities = [];
    allEntities.push({ radius: mainSphere.geometry.parameters.radius, position: mainSphere.position, type: 'player' });
    for (const id in otherPlayers) {
        allEntities.push({ radius: otherPlayers[id].mesh.geometry.parameters.radius, position: otherPlayers[id].mesh.position, type: 'otherPlayer', id });
    }
    for (let j = 0; j < bots.length; j++) {
        if (i === j || !bots[j].active) continue;
        allEntities.push({ radius: bots[j].radius, position: bots[j].position, type: 'bot', botIndex: j });
    }

    // Find the closest smaller bot/player within MAXfog distance
    let target = null;
    let minDistSq = Infinity;
    let chosenTargetType = 'pellet';
    let chosenTargetInfo = null;
    for (const entity of allEntities) {
        if (entity.radius < bot.radius) {
            const distSq = bot.position.distanceToSquared(entity.position);
            if (distSq < botFogFar * botFogFar && distSq < minDistSq) {
                minDistSq = distSq;
                target = entity.position;
                chosenTargetType = entity.type;
                chosenTargetInfo = entity;
            }
        }
    }

    // If no smaller bot/player in fog range, go for closest pellet
    if (target === null) {
        minDistSq = Infinity;
        for (let j = 0; j < pellets.length; j++) {
            const pellet = pellets[j];
            if (pellet.active) {
                const distSq = bot.position.distanceToSquared(pellet.position);
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    target = pellet.position;
                    chosenTargetType = 'pellet';
                    chosenTargetInfo = { pelletIndex: j };
                }
            }
        }
    }

    // Debug output
    const isSmallest = (chosenTargetType === 'pellet');
    // Uncomment for debugging:
    // console.log(`Bot ${i}: radius=${bot.radius.toFixed(2)}, isSmallest=${isSmallest}`);
    // console.log(`Bot ${i}: targeting ${chosenTargetType}${chosenTargetType === 'bot' && chosenTargetInfo ? ' #' + chosenTargetInfo.botIndex : ''}${chosenTargetType === 'otherPlayer' && chosenTargetInfo ? ' id=' + chosenTargetInfo.id : ''}${chosenTargetType === 'pellet' && chosenTargetInfo ? ' #' + chosenTargetInfo.pelletIndex : ''}`);

    // --- Bot Movement ---
    if (target) {
        const direction = new THREE.Vector3().subVectors(target, bot.position).normalize();
        bot.position.add(direction.multiplyScalar(BOT_SPEED * deltaTime));
        const half = SPAWN_AREA_SIZE / 2 - bot.radius;
        bot.position.x = Math.max(-half, Math.min(half, bot.position.x));
        bot.position.y = Math.max(-half, Math.min(half, bot.position.y));
        bot.position.z = Math.max(-half, Math.min(half, bot.position.z));
    }

    // --- Bot Eating Logic ---

    // Bot vs. Pellets
    for (let j = 0; j < pellets.length; j++) {
        const pellet = pellets[j];
        if (pellet.active && bot.position.distanceTo(pellet.position) < bot.radius + pellet.radius) {
            if (bot.radius > pellet.radius) { // Bots can always eat small pellets
                bot.radius = Math.sqrt(bot.radius ** 2 + pellet.radius ** 2);
                pellet.active = false; // Mark pellet as eaten
            }
        }
    }

    // Bot vs. Nebulosa
    for (let j = 0; j < nebulosa.length; j++) {
        const selectedNebulosa = nebulosa[j];
        if (selectedNebulosa.active) {
            const dist = bot.position.distanceTo(selectedNebulosa.position);
            if (checkEatCondition(bot.radius, selectedNebulosa.radius, dist)) {
                bot.radius = Math.sqrt(bot.radius ** 2 + selectedNebulosa.radius ** 2);
                selectedNebulosa.active = false;
                nebulosaToRemove.push(j);
            }
        }
    }

    // Bot vs. Player
    const playerRadius = mainSphere.geometry.parameters.radius;
    const distToPlayer = bot.position.distanceTo(mainSphere.position);
    
    if (checkEatCondition(bot.radius, playerRadius, distToPlayer)) {
        socket.emit('i-ate-you', { killerName: `Bot ${i + 1}` });
        // Directly trigger the death sequence on the client
        handlePlayerDeath({ killerName: `Bot ${i + 1}` });
    } else if (checkEatCondition(playerRadius, bot.radius, distToPlayer)) {
        const newPlayerRadius = Math.sqrt(playerRadius ** 2 + bot.radius ** 2);
        const newGeometry = new THREE.SphereGeometry(newPlayerRadius, 32, 32);
        mainSphere.geometry.dispose();
        mainSphere.geometry = newGeometry;
        botsToRemove.push(i);
    }

    // Bot vs. Other Bots
    for (let j = i + 1; j < bots.length; j++) {
        const otherBot = bots[j];
        if (!otherBot.active) continue;
        const distToOtherBot = bot.position.distanceTo(otherBot.position);

        if (checkEatCondition(bot.radius, otherBot.radius, distToOtherBot)) {
            bot.radius = Math.sqrt(bot.radius ** 2 + otherBot.radius ** 2);
            botsToRemove.push(j);
        } else if (checkEatCondition(otherBot.radius, bot.radius, distToOtherBot)) {
            otherBot.radius = Math.sqrt(otherBot.radius ** 2 + bot.radius ** 2);
            botsToRemove.push(i);
            break; // Current bot 'i' was eaten, so it can't eat anymore this frame
        }
    }
    
    // Bot vs. Other Players
    for (const id in otherPlayers) {
        const otherPlayer = otherPlayers[id].mesh;
        const otherPlayerRadius = otherPlayer.geometry.parameters.radius;
        const distToOtherPlayer = bot.position.distanceTo(otherPlayer.position);

        if (checkEatCondition(otherPlayerRadius, bot.radius, distToOtherPlayer)) {
            // The other player would eat the bot, but we can't credit them from here.
            // We just remove the bot. The server would handle the player's size increase.
            botsToRemove.push(i);
            break;
        }
    }

    if (bot.active) {
        const scale = new THREE.Vector3(bot.radius, bot.radius, bot.radius);
        tempMatrix.compose(bot.position, new THREE.Quaternion(), scale);
        botsInstances.setMatrixAt(i, tempMatrix);
        botsMatrixNeedsUpdate = true;
    }
}
}