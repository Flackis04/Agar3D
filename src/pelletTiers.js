export const PELLET_TIERS = Object.freeze([
  {
    tier: 1,
    weight: 70,
    radius: 0.7,
    maxHp: 1,
    massReward: 1,
    collisionDamage: 10,
    color: 0xffdf32,
    emissiveIntensity: 0.08,
    shape: "cube",
  },
  {
    tier: 2,
    weight: 24,
    radius: 1.76,
    maxHp: 4.5,
    massReward: 8,
    collisionDamage: 170,
    color: 0xff1744,
    emissiveIntensity: 0.9,
    shape: "faceted",
    widthSegments: 3,
    heightSegments: 2,
  },
  {
    tier: 3,
    weight: 6,
    radius: 2.05,
    maxHp: 12,
    massReward: 30,
    collisionDamage: 600,
    color: 0x704cff,
    emissiveIntensity: 0.9,
    shape: "dodecahedron",
  },
]);

export const PELLET_MIN_RADIUS = PELLET_TIERS[0].radius;
export const PELLET_MAX_RADIUS = PELLET_TIERS[PELLET_TIERS.length - 1].radius;

export function getPelletTier(tierIndex = 0) {
  return PELLET_TIERS[tierIndex] || PELLET_TIERS[0];
}

export function pickPelletTier(randomValue = Math.random()) {
  const totalWeight = PELLET_TIERS.reduce(
    (total, tier) => total + tier.weight,
    0
  );
  let roll = randomValue * totalWeight;

  for (let index = 0; index < PELLET_TIERS.length; index++) {
    roll -= PELLET_TIERS[index].weight;
    if (roll < 0) return index;
  }

  return PELLET_TIERS.length - 1;
}
