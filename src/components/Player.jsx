import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

const mapSize = 500;

export function Player({ setPlayer }) {
  const meshRef = useRef();
  const playerStartingMass = 1;
  const playerDefaultOpacity = 0.65;

  useEffect(() => {
    if (meshRef.current) {
      // Random initial position inside the box
      const [x, y, z] = Array(3)
        .fill()
        .map(() => THREE.MathUtils.randFloatSpread(mapSize));
      
      meshRef.current.position.set(x, y, z);
      meshRef.current.userData.defaultOpacity = playerDefaultOpacity;
      
      // Pass the player mesh to parent
      setPlayer(meshRef.current);
    }
  }, [setPlayer, playerDefaultOpacity]);

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[playerStartingMass, 16, 16]} />
      <meshStandardMaterial 
        color={0x00AAFF}
        emissive={0x002244}
        emissiveIntensity={0.15}
        metalness={0.1}
        transparent={true}
        opacity={playerDefaultOpacity}
      />
    </mesh>
  );
}
