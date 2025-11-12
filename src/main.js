import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { createScene } from './scene.js';
import { setupControls } from './controls.js';
import { resizeRendererToDisplaySize } from './utils.js';
import { createBox, addPellet } from './objects.js';

const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(window.innerWidth, window.innerHeight);

const { scene, camera } = createScene();
const { updateCamera } = setupControls(canvas, camera);

const box = createBox();
scene.add(box);

const pelletColors = [
  0xFF3333, // Red
  0x33FF33, // Green
  0x3333FF, // Blue
  0xFFFF33, // Yellow
  0xFF33FF, // Magenta
  0x33FFFF, // Cyan
  0xFFA500, // Orange
  0xFF66B2, // Pink
  0x9966FF, // Purple
  0x66FF66, // Light Green
  0x66FFFF, // Light Blue
  0xFF9966, // Peach
  0xFFFFFF, // White
];

Array(2000).fill().forEach(() => addPellet(scene, pelletColors[Math.floor(Math.random() * pelletColors.length)]));

function render() {
  if (resizeRendererToDisplaySize(renderer)) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }



  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
