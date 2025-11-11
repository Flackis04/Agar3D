import * as THREE from 'three';

function main() {
  const canvas = document.querySelector('#c');
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });

  const fov = 75;
  const aspect = 2;
  const near = 0.1;
  const far = 25;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.z = 20;

  const scene = new THREE.Scene();

  // Lighting
  
  const flashlight = new THREE.SpotLight(0xffffff, 5, 30, Math.PI/3, 8, 2);
  flashlight.position.copy(camera.position);
  scene.add(flashlight);
  scene.add(flashlight.target); // required for proper direction

  // Objects

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  function makeInstance(geometry, color, x) {
    const material = new THREE.MeshPhongMaterial({ color });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    cube.position.x = x;
    return cube;
  }

  const cubes = [
    makeInstance(geometry, 0x44aa88, 0),
    makeInstance(geometry, 0x8844aa, -2),
    makeInstance(geometry, 0xaa8844, 2),
  ];

  const keys = {};
  window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
  window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

  // --- Pointer Lock Setup ---
  let yaw = 0;   // left-right rotation
  let pitch = 0; // up-down rotation
  const sensitivity = 0.002; // adjust mouse sensitivity

  canvas.addEventListener('click', () => {
    canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      document.addEventListener('mousemove', onMouseMove);
    } else {
      document.removeEventListener('mousemove', onMouseMove);
    }
  });

  function onMouseMove(e) {
    yaw -= e.movementX * sensitivity;
    pitch -= e.movementY * sensitivity;
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch)); // clamp look up/down
  }

  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const pixelRatio = window.devicePixelRatio;
    const width = Math.floor(canvas.clientWidth * pixelRatio);
    const height = Math.floor(canvas.clientHeight * pixelRatio);
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) renderer.setSize(width, height, false);
    return needResize;
  }

  const cameraDirection = new THREE.Vector3();

  function render(time) {
    time *= 0.001;

    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    cubes.forEach((cube, ndx) => {
      const speed = 1 + ndx * 0.1;
      const rot = time * speed;
      cube.rotation.x = rot;
      cube.rotation.y = rot;
    });

    // In render loop, make it follow camera
    flashlight.position.copy(camera.position);
    camera.getWorldDirection(flashlight.target.position);
    flashlight.target.position.addVectors(flashlight.position, flashlight.target.position);



    // Update camera rotation
    camera.rotation.order = 'YXZ'; // yaw (Y), pitch (X)
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    // Move camera relative to its facing direction
    const moveSpeed = 0.1;
    camera.getWorldDirection(cameraDirection);

    if (keys['w']) camera.position.addScaledVector(cameraDirection, moveSpeed);

    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main();
