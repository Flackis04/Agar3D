import * as THREE from "three";

const CROSSHAIR_CENTER = new THREE.Vector2(0, 0);

export function createCameraAimSampler() {
  const raycaster = new THREE.Raycaster();
  const aim = {
    origin: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: -1 },
  };

  return function sampleCameraAim(camera) {
    // setFromCamera uses the projection and world matrices, so this remains
    // centered through position, FOV, aspect, and zoom changes.
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(CROSSHAIR_CENTER, camera);

    aim.origin.x = raycaster.ray.origin.x;
    aim.origin.y = raycaster.ray.origin.y;
    aim.origin.z = raycaster.ray.origin.z;
    aim.direction.x = raycaster.ray.direction.x;
    aim.direction.y = raycaster.ray.direction.y;
    aim.direction.z = raycaster.ray.direction.z;

    return aim;
  };
}
