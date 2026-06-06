const SPHERE_VOLUME_FACTOR = (4 / 3) * Math.PI;

export function hasMinimumSphereVolumeOverlap(
  eaterRadius,
  pelletRadius,
  distanceSquared,
  minimumPelletFraction = 0.25
) {
  const combinedRadius = eaterRadius + pelletRadius;
  if (distanceSquared >= combinedRadius * combinedRadius) return false;

  const radiusDifference = Math.abs(eaterRadius - pelletRadius);
  if (distanceSquared <= radiusDifference * radiusDifference) {
    const containedRadius = Math.min(eaterRadius, pelletRadius);
    const containedVolume =
      SPHERE_VOLUME_FACTOR * containedRadius * containedRadius * containedRadius;
    const pelletVolume =
      SPHERE_VOLUME_FACTOR * pelletRadius * pelletRadius * pelletRadius;
    return containedVolume >= pelletVolume * minimumPelletFraction;
  }

  const distance = Math.sqrt(distanceSquared);
  const overlapHeight = combinedRadius - distance;
  const radiusDelta = pelletRadius - eaterRadius;
  const intersectionVolume =
    (Math.PI *
      overlapHeight *
      overlapHeight *
      (distance * distance +
        2 * distance * combinedRadius -
        3 * radiusDelta * radiusDelta)) /
    (12 * distance);
  const pelletVolume =
    SPHERE_VOLUME_FACTOR * pelletRadius * pelletRadius * pelletRadius;

  return intersectionVolume >= pelletVolume * minimumPelletFraction;
}
