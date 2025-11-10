import * as THREE from 'three';
import Controls from './keybind.js';

const canvas = document.getElementById('c');
const DPR = Math.min(window.devicePixelRatio || 1, 2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 150);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));

///

{
  const half = 100; // 200x200 => half-size 100
  const pts = [
    new THREE.Vector3(-half, -half, 0),
    new THREE.Vector3( half, -half, 0),
    new THREE.Vector3( half,  half, 0),
    new THREE.Vector3(-half,  half, 0),
    new THREE.Vector3(-half, -half, 0) // close loop
  ];
  const borderGeom = new THREE.BufferGeometry().setFromPoints(pts);
  const borderMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const border = new THREE.Line(borderGeom, borderMat);
  scene.add(border);
}

const pelletCap = 3
const boxSize = 200

for (let index = 0; index < pelletCap; index++) {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0x2194ce }),
  );
  sphere.position.set(
    (Math.random() * 2 - 1) * boxSize,
    (Math.random() * 2 - 1) * boxSize,
    (Math.random() * 2 - 1) * boxSize
  );
  scene.add(sphere);
}


// move camera.z by -1 each time "W" is pressed
const controls = new Controls(camera, 1);
window.controls = controls;

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}, { passive: true });

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
