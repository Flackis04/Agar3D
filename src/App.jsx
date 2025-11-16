import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Stats } from '@react-three/drei';
import { Player } from './components/Player';
import { Pellets } from './components/Pellets';
import { Viruses } from './components/Viruses';
import { Particles } from './components/Particles';
import { Controls } from './components/Controls';
import { Projectiles } from './components/Projectiles';
import { checkEatCondition } from './utils';

function Scene() {
  const { camera } = useThree();
  const [projectiles, setProjectiles] = useState([]);
  const [player, setPlayer] = useState(null);
  const [pelletData, setPelletData] = useState(null);

  // Set up camera defaults
  useEffect(() => {
    camera.fov = 75;
    camera.near = 0.1;
    camera.far = 600;
    camera.updateProjectionMatrix();
  }, [camera]);

  // Pellet eating logic
  useFrame(() => {
    if (!player || !pelletData) return;

    const { eatenCount, eatenSizes } = checkEatCondition(player, pelletData, 0);

    if (eatenCount > 0) {
      const playerRadius = player.geometry.parameters.radius * player.scale.x;
      const playerVolume = (4 / 3) * Math.PI * Math.pow(playerRadius, 3);

      const pelletBaseRadius = pelletData.radius;
      let pelletsVolume = 0;

      for (let i = 0; i < eatenSizes.length; i++) {
        const pelletRadius = pelletBaseRadius * eatenSizes[i];
        pelletsVolume += (4 / 3) * Math.PI * Math.pow(pelletRadius, 3);
      }

      const newVolume = playerVolume + pelletsVolume;
      const newRadius = Math.cbrt((3 * newVolume) / (4 * Math.PI));
      const scale = newRadius / player.geometry.parameters.radius;

      player.scale.setScalar(scale);
    }
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.7} />
      <directionalLight position={[100, 200, 100]} intensity={1} />
      
      {/* Fog - use FogExp2 */}
      <fogExp2 attach="fog" args={[0x050010, 0.04]} />
      
      {/* Background */}
      <color attach="background" args={[0x050010]} />
      
      {/* Game objects */}
      <Player setPlayer={setPlayer} />
      <Pellets setPelletData={setPelletData} />
      <Viruses />
      <Particles />
      
      {/* Controls */}
      {player && (
        <Controls 
          player={player} 
          projectiles={projectiles}
          setProjectiles={setProjectiles}
        />
      )}
      
      {/* Projectiles */}
      <Projectiles 
        projectiles={projectiles} 
        setProjectiles={setProjectiles}
        player={player}
      />
    </>
  );
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
        camera={{ position: [0, 0, 5] }}
      >
        <Scene />
        <Stats />
      </Canvas>
    </div>
  );
}
