import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

export function createScene() {
  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(0x050010)
  scene.background = bgColor;

  const fov = 75;
  const aspect = window.innerWidth / window.innerHeight;
  const near = 0.1;
  const far = 600;
  
  // Enhanced fog with better density and slight color variation
  const fogColor = new THREE.Color(0x000010); // Slightly lighter than background for depth
  scene.fog = new THREE.FogExp2(fogColor, 0.04);

  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

  // lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(100, 200, 100);
  scene.add(ambientLight, directionalLight);

  return { scene, camera };
}
