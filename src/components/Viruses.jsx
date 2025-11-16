import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const VIRUS_COUNT = 250;
const VIRUS_SIZE = 2.25;
const mapSize = 500;
const virusColor = 0x32CD32;

function Virus({ position, index }) {
  const meshRef = useRef();

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const time = clock.getElapsedTime() * 1000;
      meshRef.current.rotation.y += 0.005;
      meshRef.current.rotation.x += 0.002;
      
      // Breathing effect
      const scale = 1 + 0.08 * Math.sin(time * 0.001 + index);
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <dodecahedronGeometry args={[VIRUS_SIZE]} />
      <meshStandardMaterial 
        color={virusColor} 
        opacity={0.8} 
        transparent={true} 
      />
    </mesh>
  );
}

export function Viruses() {
  const positions = useMemo(() => {
    const border = mapSize / 2 - VIRUS_SIZE;
    const result = [];

    for (let i = 0; i < VIRUS_COUNT; i++) {
      let pos;
      let tries = 0;
      
      do {
        pos = new THREE.Vector3(
          (Math.random() * (border * 2 - VIRUS_SIZE * 2)) - (border - VIRUS_SIZE),
          (Math.random() * (border * 2 - VIRUS_SIZE * 2)) - (border - VIRUS_SIZE),
          (Math.random() * (border * 2 - VIRUS_SIZE * 2)) - (border - VIRUS_SIZE)
        );
        tries++;
      } while (result.some(p => p.distanceTo(pos) < VIRUS_SIZE * 2.1) && tries < 20);
      
      result.push(pos);
    }

    return result;
  }, []);

  return (
    <>
      {positions.map((pos, index) => (
        <Virus key={index} position={pos} index={index} />
      ))}
    </>
  );
}
