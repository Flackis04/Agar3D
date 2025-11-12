import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

export function createScene() {
  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(0x050010)
  scene.background = bgColor;

  const fov = 75;
  const aspect = window.innerWidth / window.innerHeight;
  const near = 0.1;
  const far = 25;
  
  // Enhanced fog with better density and slight color variation
  const fogColor = new THREE.Color(0x080020); // Slightly lighter than background for depth
  scene.fog = new THREE.FogExp2(fogColor, 0.025); // Increased density for better visibility gradient

  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

// Main directional light
const directionalLight = new THREE.DirectionalLight(0x88AAFF, 1.2);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = false; // Disable shadows for performance
scene.add(directionalLight);

// Fill light
const fillLight = new THREE.DirectionalLight(0xFFFFFF, 0.4);
fillLight.position.set(-5, -3, -5);
scene.add(fillLight);

// Ambient light
const ambientLight = new THREE.AmbientLight(0x404080, 0.3);
scene.add(ambientLight);


  return { scene, camera };
}
