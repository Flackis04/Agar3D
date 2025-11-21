import * as THREE from 'three';

function lerp(startValue, endValue, t) {
    return startValue + (endValue - startValue) * t;
}

export function smoothLerp(startValue, endValue, t) {
    t = t * t * (3 - 2 * t);
    return lerp(startValue, endValue, t);
}

export function updateFogDensity(scene, mass) {
    if (!scene.fog) return;

    const minMass = 0;
    const maxMass = 37000;
    const minDensity = 0;
    const maxDensity = 0.04;

    const t = (mass - minMass) / (maxMass - minMass);
    const targetDensity = lerp(maxDensity, minDensity, t);

    const currentDensity = scene.fog.density;
    const lerpSpeed = 1;
    scene.fog.density = smoothLerp(currentDensity, targetDensity, lerpSpeed);

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

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(100, 200, 100);
  scene.add(ambientLight, directionalLight);

  return { scene, camera };
}
