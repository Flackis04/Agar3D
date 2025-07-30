// Game mechanics
export const MAX_SPEED = 24; // Speed in units per second
export const ACCEL = 2.4;    // Acceleration rate
export const DECEL = 3.6;    // Deceleration rate
export const ORBIT_SENSITIVITY = 0.005;

// World generation
export const SPAWN_AREA_SIZE = 500;
export const MIN_SPAWN_RADIUS_SQ = 5 * 5;

// Fog
export const FOG_COLOR = 0x222233;
export const FOG_NEAR_BASE = 40;
export const FOG_FAR_BASE = 120;
export const FOG_FAR_MAX = 500; // Maximum fog distance for very large players

// Pellets
export const PELLET_COUNT = SPAWN_AREA_SIZE * 50;
export const PELLET_COLORS = [
    0xff0000, // Red
    0x0077ff, // Blue
    0x00ff00, // Green
    0xffff00, // Yellow
    0x9b30ff, // Purple
    0xff9900, // Orange
    0x7ed6ff, // Light Blue
    0xff69b4  // Pink
];

// Nebulosa
export const NEBULOSA_COUNT = Math.max(2, Math.floor(SPAWN_AREA_SIZE / 150));
export const NEBULOSA_COLOR = 0xff69b4;
export const NEBULOSA_MIN_RADIUS = 80;
export const NEBULOSA_MAX_RADIUS = 250;
export const NEBULOSA_AVERAGE_RADIUS = 120;

// Bots
export const BOTS_COUNT = 30;
export const BOTS_COLOR = 0xcd990000;
export const BOT_SPEED = 3;
export const BOT_MIN_RADIUS = 1;
export const BOT_AVERAGE_RADIUS = 5;
export const BOT_MAX_RADIUS = 9;
