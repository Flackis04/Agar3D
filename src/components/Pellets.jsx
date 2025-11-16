import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

const pelletColors = [
  0xFF3333, 0x33FF33, 0x3333FF, 0xFFFF33,
  0xFF33FF, 0x33FFFF, 0xFFA500, 0xFF66B2,
  0x9966FF, 0x66FF66, 0x66FFFF, 0xFF9966, 
  0xFFFFFF
];

const PELLET_COUNT = 200000;
const mapSize = 500;

export function Pellets({ setPelletData }) {
  const meshRef = useRef();

  const { positions, sizes, active, dummy } = useMemo(() => {
    const positions = [];
    const sizes = [];
    const active = new Array(PELLET_COUNT).fill(true);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < PELLET_COUNT; i++) {
      const position = new THREE.Vector3(
        (Math.random() - 0.5) * mapSize,
        (Math.random() - 0.5) * mapSize,
        (Math.random() - 0.5) * mapSize
      );
      const size = Math.random() * 0.3 + 0.2;
      
      positions.push(position);
      sizes.push(size);
    }

    return { positions, sizes, active, dummy };
  }, []);

  useEffect(() => {
    if (meshRef.current) {
      // Initialize instances
      for (let i = 0; i < PELLET_COUNT; i++) {
        const color = new THREE.Color(pelletColors[i % pelletColors.length]);
        
        dummy.position.copy(positions[i]);
        dummy.rotation.set(
          Math.random() * Math.PI, 
          Math.random() * Math.PI, 
          Math.random() * Math.PI
        );
        dummy.scale.setScalar(sizes[i]);
        dummy.updateMatrix();

        meshRef.current.setMatrixAt(i, dummy.matrix);
        meshRef.current.setColorAt(i, color);
      }

      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) {
        meshRef.current.instanceColor.needsUpdate = true;
      }

      // Pass pellet data to parent
      setPelletData({
        mesh: meshRef.current,
        positions,
        sizes,
        active,
        radius: 1, // base radius from geometry
        dummy
      });
    }
  }, [positions, sizes, active, dummy, setPelletData]);

  return (
    <instancedMesh ref={meshRef} args={[null, null, PELLET_COUNT]} frustumCulled={true}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial color={0xffffff} />
    </instancedMesh>
  );
}
