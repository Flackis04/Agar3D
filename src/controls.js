import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

export function setupControls(canvas, camera) {
  const keys = {};
  const rotation = { yaw: 0, pitch: 0 };
  const sensitivity = 0.002;
  const moveSpeed = 0.1;
  const direction = new THREE.Vector3();
  const strafe = new THREE.Vector3();

  window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
  window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

  canvas.addEventListener('click', () => canvas.requestPointerLock());

  function onMouseMove(e) {
    rotation.yaw -= e.movementX * sensitivity;
    rotation.pitch -= e.movementY * sensitivity;
    rotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.pitch));
  }

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas)
      document.addEventListener('mousemove', onMouseMove);
    else
      document.removeEventListener('mousemove', onMouseMove);
  });

  function updateCamera() {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = rotation.yaw;
    camera.rotation.x = rotation.pitch;

    camera.getWorldDirection(direction);

    if (keys['w']) camera.position.addScaledVector(direction, moveSpeed);
    if (keys['s']) camera.position.addScaledVector(direction, -moveSpeed);

    strafe.crossVectors(camera.up, direction).normalize();
    if (keys['a']) camera.position.addScaledVector(strafe, moveSpeed);
    if (keys['d']) camera.position.addScaledVector(strafe, -moveSpeed);
  }

  return { updateCamera };
}
