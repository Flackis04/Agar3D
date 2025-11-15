import * as THREE from 'three';

/**
 * Creates and configures the main scene and camera.
 * Includes background color, fog, and lighting setup.
 * @returns {Object} - Contains `scene` (THREE.Scene) and `camera` (THREE.PerspectiveCamera)
 */
export function createScene() {
  const scene = new THREE.Scene();

  // Set background color
  const bgColor = new THREE.Color(0x050010);
  scene.background = bgColor;

  // Configure perspective camera
  const fov = 75;
  const aspect = window.innerWidth / window.innerHeight;
  const near = 0.1;
  const far = 600;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

  // Add fog for depth effect
  // Match the fog color to the background color
  scene.fog = new THREE.FogExp2(bgColor, 0.04);

  // Lighting setup
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // soft overall illumination
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // directional sunlight
  directionalLight.position.set(100, 200, 100); // angled to cast light across the scene
  scene.add(ambientLight, directionalLight);

  return { scene, camera };
}
