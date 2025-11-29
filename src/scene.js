import * as THREE from "three";

function lerp(startValue, endValue, t) {
  return startValue + (endValue - startValue) * t;
}

export function smoothLerp(startValue, endValue, t) {
  t = t * t * (3 - 2 * t);
  return lerp(startValue, endValue, t);
}

let fogTransition = {
  isAnimating: false,
  startValue: 0,
  targetValue: 0,
  startTime: 0,
  duration: 500, // 0.5 seconds
};

export function updateBorderFog(scene) {
  // Find the border (Points mesh) and update its fog uniforms
  scene.traverse((object) => {
    if (
      object.isPoints &&
      object.material.uniforms &&
      object.material.uniforms.fogNear
    ) {
      object.material.uniforms.fogNear.value = scene.fog.near;
      object.material.uniforms.fogFar.value = scene.fog.far;
    }
  });
}

export function updateFogDistance(scene, cameraDistance, playerRadius) {
  if (!scene.fog) return;

  const targetFogFar = cameraDistance * 2 + playerRadius * 2;

  // If we're currently animating, continue the animation
  if (fogTransition.isAnimating) {
    const elapsed = performance.now() - fogTransition.startTime;
    const t = Math.min(elapsed / fogTransition.duration, 1);

    scene.fog.far = lerp(
      fogTransition.startValue,
      fogTransition.targetValue,
      t
    );

    // Animation complete
    if (t >= 1) {
      fogTransition.isAnimating = false;
      scene.fog.far = fogTransition.targetValue;
    }
  } else {
    // Not animating, just use the target value
    scene.fog.far = targetFogFar;
    console.log(scene.fog.far);
  }

  // Update border material fog uniforms to match scene fog
  updateBorderFog(scene);

  return scene.fog.far;
}

export function createScene() {
  const scene = new THREE.Scene();

  const bgColor = new THREE.Color(0x050010);
  scene.background = bgColor;

  const fov = 75;
  const aspect = window.innerWidth / window.innerHeight;
  const near = 0.2;
  const far = 600;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

  const fogNear = 0;
  const fogFar = 100; // Initial value, will be updated dynamically
  scene.fog = new THREE.Fog(bgColor, fogNear, fogFar);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(100, 200, 100);
  scene.add(ambientLight, directionalLight);

  return { scene, camera };
}
