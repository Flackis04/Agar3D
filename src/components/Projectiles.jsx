import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

function Projectile({ projectile, onRemove, player, getForwardButtonPressed }) {
  const { camera, scene } = useThree();
  const meshRef = useRef();
  const splitDataRef = useRef({
    isSplit: false,
    peakDist: null
  });

  useFrame(() => {
    if (!meshRef.current || !player) return;

    const now = performance.now();
    const p = meshRef.current;
    const t = (now - projectile.userData.startTime) / 1000;

    const playerRadius = player.geometry.parameters.radius * player.scale.x;
    const projRadius = p.geometry.parameters.radius * p.scale.x;
    const surfaceDist = playerRadius + projRadius;

    const toPlayer = player.position.clone().sub(p.position);
    const dist = toPlayer.length();

    // Space shot behavior
    if (projectile.userData.isSpaceShot) {
      if (t > 2) {
        splitDataRef.current.isSplit = true;

        if (!splitDataRef.current.peakDist) {
          splitDataRef.current.peakDist = dist;
        }

        const peakDist = splitDataRef.current.peakDist;
        const forwardPressed = getForwardButtonPressed ? getForwardButtonPressed() : false;

        if (dist > surfaceDist && !forwardPressed) {
          const step = toPlayer.normalize().multiplyScalar(
            Math.min(dist - surfaceDist, 0.2)
          );
          p.position.add(step);
        } else if (dist > surfaceDist && forwardPressed) {
          p.position.copy(
            player.position.clone().add(
              toPlayer.normalize().multiplyScalar(
                surfaceDist + peakDist
              )
            )
          );
        }
      } else {
        const pv = new THREE.Vector3().copy(p.position);
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
        const camPos = pv.add(back.multiplyScalar(5));
        camera.position.copy(camPos);
        camera.lookAt(pv);

        const decay = Math.exp(-2 * t);
        const velocity = projectile.userData.velocity.clone().multiplyScalar(decay);
        p.position.add(velocity);
      }
    } else {
      // Normal shot
      if (t > 2) {
        onRemove();
        return;
      }

      const decay = Math.exp(-2 * t);
      const velocity = projectile.userData.velocity.clone().multiplyScalar(decay);
      p.position.add(velocity);
    }
  });

  return (
    <mesh 
      ref={meshRef}
      position={projectile.position}
      geometry={projectile.geometry}
      material={projectile.material}
    />
  );
}

export function Projectiles({ projectiles, setProjectiles, player }) {
  const forwardBtnIsPressed = useRef(false);

  // Track forward button state
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() === 'w') {
        forwardBtnIsPressed.current = true;
      }
    };
    const handleKeyUp = (e) => {
      if (e.key.toLowerCase() === 'w') {
        forwardBtnIsPressed.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <>
      {projectiles.map((projectile, index) => (
        <Projectile 
          key={index}
          projectile={projectile}
          player={player}
          getForwardButtonPressed={() => forwardBtnIsPressed.current}
          onRemove={() => {
            setProjectiles(prev => prev.filter((_, i) => i !== index));
          }}
        />
      ))}
    </>
  );
}
