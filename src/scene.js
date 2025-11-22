import * as THREE from "three";

function lerp(startValue, endValue, t) {
  return startValue + (endValue - startValue) * t;
}

export function smoothLerp(startValue, endValue, t) {
  t = t * t * (3 - 2 * t);
  return lerp(startValue, endValue, t);
}

export function updateFogDensity(scene, mass) {
  if (!scene.fog) return;

  const baseDensity = 0.02;
  const massFactor = 50; // higher = fog decreases faster

  let targetDensity = baseDensity * (1 - mass / massFactor);
  targetDensity = Math.max(targetDensity, 0);

  const currentDensity = scene.fog.density;
  const lerpSpeed = 0.02;
  scene.fog.density = smoothLerp(currentDensity, targetDensity, lerpSpeed);
  console.log(scene.fog.density);

  return scene.fog.density;
}

export function createScene() {
  const scene = new THREE.Scene();

  const bgColor = new THREE.Color(0x050010);
  scene.background = bgColor;

  const fov = 75;
  const aspect = window.innerWidth / window.innerHeight;
  const near = 0.1;
  const far = 600;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

  const density = 0.04;
  scene.fog = new THREE.FogExp2(bgColor, density);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  const hemiLight = new THREE.HemisphereLight(0x88c2ff, 0x080010, 0.6);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(120, 220, 160);

  const fillLight = new THREE.DirectionalLight(0x88aaff, 0.4);
  fillLight.position.set(-80, 150, -60);

  const rimLight = new THREE.PointLight(0xff66aa, 0.25);
  rimLight.position.set(0, 250, -150);

  scene.add(ambientLight, hemiLight, keyLight, fillLight, rimLight);

  return { scene, camera };
}
