import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const mapSize = 500;
const sensitivity = 0.002;
const playerSpeed = 0.12;
const devSpeed = 1;

function clampToBoxBounds(position, player) {
  const BOX_SIZE = 500;
  const BOX_HALF = BOX_SIZE / 2;

  const playerRadius = player.geometry.parameters.radius * Math.max(
    player.scale.x,
    player.scale.y,
    player.scale.z
  );

  const minBound = -BOX_HALF + playerRadius;
  const maxBound = BOX_HALF - playerRadius;

  position.x = Math.max(minBound, Math.min(maxBound, position.x));
  position.y = Math.max(minBound, Math.min(maxBound, position.y));
  position.z = Math.max(minBound, Math.min(maxBound, position.z));

  return position;
}

export function Controls({ player, projectiles, setProjectiles }) {
  const { camera, gl } = useThree();
  const keys = useRef({});
  const playerRotation = useRef({ yaw: 0, pitch: 0 });
  const devRotation = useRef({ yaw: 0, pitch: 0 });
  const devMode = useRef(false);
  const devCameraPos = useRef(new THREE.Vector3());
  const lastShot = useRef(0);
  const forwardBtnIsPressed = useRef(false);
  const pointer = useRef(new THREE.Vector2());
  const lastShotTime = useRef(null);
  const lastShotOpacity = useRef(null);

  useEffect(() => {
    const canvas = gl.domElement;

    // Keyboard handlers
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      keys.current[key] = true;

      if (key === 'x') {
        devMode.current = !devMode.current;
        console.log(`Developer mode ${devMode.current ? 'enabled' : 'disabled'}`);
        
        if (devMode.current) {
          devCameraPos.current.copy(camera.position);
          const direction = new THREE.Vector3();
          camera.getWorldDirection(direction);
          devRotation.current.yaw = Math.atan2(direction.x, direction.z);
          devRotation.current.pitch = Math.asin(-direction.y);
        }
      }
      
      if (key === 'w') forwardBtnIsPressed.current = true;
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      keys.current[key] = false;
      if (key === 'w') forwardBtnIsPressed.current = false;
    };

    // Mouse move handler
    const onMouseMove = (e) => {
      if (devMode.current) {
        devRotation.current.yaw -= e.movementX * sensitivity;
        devRotation.current.pitch += e.movementY * sensitivity;
        devRotation.current.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, devRotation.current.pitch));
      } else {
        playerRotation.current.yaw -= e.movementX * sensitivity;
        playerRotation.current.pitch += e.movementY * sensitivity;
        playerRotation.current.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, playerRotation.current.pitch));
      }
    };

    // Pointer move handler for normalized coordinates
    const handlePointerMove = (event) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    // Pointer lock handlers
    const handleClick = async () => {
      try {
        await canvas.requestPointerLock();
      } catch (err) {
        if (err.name !== 'SecurityError') console.error(err);
      }
    };

    const handlePointerLockChange = () => {
      if (document.pointerLockElement === canvas) {
        document.addEventListener('mousemove', onMouseMove);
      } else {
        document.removeEventListener('mousemove', onMouseMove);
      }
    };

    // Shooting handler
    const tryShoot = (isSpaceShot = false) => {
      const now = performance.now();
      if (now - lastShot.current < 200) return;
      lastShot.current = now;

      const playerRadius = player.geometry.parameters.radius * player.scale.x;
      const playerVolume = (4/3) * Math.PI * Math.pow(playerRadius, 3);
      let projVolume = playerVolume / 8;
      
      if (isSpaceShot) {
        projVolume = playerVolume / 2;
        const newPlayerVolume = playerVolume / 2;
        const newPlayerRadius = Math.cbrt((3 * newPlayerVolume) / (4 * Math.PI));
        const scale = newPlayerRadius / player.geometry.parameters.radius;
        player.scale.setScalar(scale);
      }
      
      const projRadius = Math.cbrt((3 * projVolume) / (4 * Math.PI));
      const color = player.material.color.clone();

      const geometry = new THREE.SphereGeometry(projRadius, 16, 16);
      const material = new THREE.MeshStandardMaterial({ color });
      const projectile = new THREE.Mesh(geometry, material);
      projectile.position.copy(player.position);

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.normalize();

      projectile.userData.velocity = forward.multiplyScalar(playerSpeed * 5.5);
      projectile.userData.startTime = performance.now();
      projectile.userData.isSpaceShot = isSpaceShot;

      setProjectiles(prev => [...prev, projectile]);
      
      lastShotTime.current = performance.now();
      lastShotOpacity.current = player.material.opacity;
      player.material.opacity = 0.2;
    };

    const handleShootLoop = () => {
      if (keys.current['e']) tryShoot(false);
      requestAnimationFrame(handleShootLoop);
    };
    handleShootLoop();

    const handleSpace = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        tryShoot(true);
      }
    };

    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('keydown', handleSpace, true);
    canvas.addEventListener('click', handleClick);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointermove', handlePointerMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('keydown', handleSpace, true);
      canvas.removeEventListener('click', handleClick);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, [camera, gl, player, setProjectiles]);

  useFrame(() => {
    if (!player) return;

    // Update camera based on mode
    if (devMode.current) {
      // Developer camera
      const direction = new THREE.Vector3(
        Math.sin(devRotation.current.yaw) * Math.cos(devRotation.current.pitch),
        -Math.sin(devRotation.current.pitch),
        Math.cos(devRotation.current.yaw) * Math.cos(devRotation.current.pitch)
      );

      if (keys.current['w']) {
        devCameraPos.current.addScaledVector(direction, devSpeed);
      }

      camera.position.copy(devCameraPos.current);
      camera.lookAt(devCameraPos.current.clone().add(direction));
    } else {
      // Player camera
      const playerRadius = player.geometry.parameters.radius * Math.max(
        player.scale.x,
        player.scale.y,
        player.scale.z
      );
      
      const dynamicFollowDistance = playerRadius * 5;
      
      const offset = new THREE.Vector3(
        dynamicFollowDistance * Math.sin(playerRotation.current.yaw) * Math.cos(playerRotation.current.pitch),
        dynamicFollowDistance * Math.sin(playerRotation.current.pitch),
        dynamicFollowDistance * Math.cos(playerRotation.current.yaw) * Math.cos(playerRotation.current.pitch)
      );

      const forward = offset.clone().normalize().negate();
      if (keys.current['w']) {
        const nextPosition = player.position.clone().addScaledVector(forward, playerSpeed);
        clampToBoxBounds(nextPosition, player);
        player.position.copy(nextPosition);
      }

      camera.position.copy(player.position.clone().add(offset));
      camera.lookAt(player.position);
    }

    // Handle player opacity fade after shooting
    if (lastShotTime.current) {
      const now = performance.now();
      const t = (now - lastShotTime.current) / 1000;
      const duration = 1.2;
      const playerDefaultOpacity = player.userData.defaultOpacity || 0.65;

      if (t >= duration) {
        player.material.opacity = playerDefaultOpacity;
        lastShotTime.current = null;
      } else {
        const x = t / duration;
        player.material.opacity = playerDefaultOpacity * Math.pow(x, 5);
      }
    }
  });

  return null;
}
