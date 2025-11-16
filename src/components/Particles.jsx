import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const mapSize = 500;
const PARTICLE_SIZE = 2;

export function Particles() {
  const pointsRef = useRef();
  const [texture, setTexture] = React.useState(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load('https://threejs.org/examples/textures/sprites/disc.png', (loadedTexture) => {
      setTexture(loadedTexture);
    });
  }, []);

  const geometry = useMemo(() => {
    let boxGeometry = new THREE.BoxGeometry(mapSize, mapSize, mapSize, 96, 96, 96);
    boxGeometry.deleteAttribute('normal');
    boxGeometry.deleteAttribute('uv');
    boxGeometry = BufferGeometryUtils.mergeVertices(boxGeometry);

    const positionAttribute = boxGeometry.getAttribute('position');
    const colors = [];
    const sizes = [];

    const borderColor = new THREE.Color(0x66AAFF);

    for (let i = 0; i < positionAttribute.count; i++) {
      borderColor.toArray(colors, i * 3);
      sizes[i] = PARTICLE_SIZE * 0.6;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positionAttribute.clone());
    geometry.setAttribute('customColor', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    return geometry;
  }, []);

  const shaderMaterial = useMemo(() => {
    if (!texture) return null;

    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0xffffff) },
        pointTexture: { value: texture },
        alphaTest: { value: 0.9 },
        fogColor: { value: new THREE.Color(0x080020) },
        fogDensity: { value: 0.025 }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 customColor;
        varying vec3 vColor;
        varying float vFogDepth;
        void main() {
          vColor = customColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPosition.z;
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform sampler2D pointTexture;
        uniform float alphaTest;
        uniform vec3 fogColor;
        uniform float fogDensity;
        varying vec3 vColor;
        varying float vFogDepth;
        void main() {
          gl_FragColor = vec4(color * vColor, 1.0);
          gl_FragColor *= texture2D(pointTexture, gl_PointCoord);
          
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
          
          if (gl_FragColor.a < alphaTest) discard;
        }
      `,
      transparent: true,
      depthWrite: false
    });
  }, [texture]);

  if (!shaderMaterial) return null;

  return (
    <points ref={pointsRef} geometry={geometry} material={shaderMaterial} />
  );
}
