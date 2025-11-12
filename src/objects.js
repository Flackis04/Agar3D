import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

export function createBox() {
  const geometry = new THREE.BoxGeometry(200,200,200);
  const edges = new THREE.EdgesGeometry( geometry );
  const line = new THREE.LineSegments( edges );
  return line;
}

export function addPellet(scene, color) {
  const geometry = new THREE.SphereGeometry(0.25, 24, 24);
  const material = new THREE.MeshStandardMaterial({ color: color });
  const pellet = new THREE.Mesh(geometry, material);

  const [x, y, z] = Array(3)
    .fill()
    .map(() => THREE.MathUtils.randFloatSpread(200));

  pellet.position.set(x, y, z);
  scene.add(pellet);
}
