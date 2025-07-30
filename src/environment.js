// Environment module
import * as THREE from 'three';
import { FOG_COLOR, FOG_NEAR_BASE, FOG_FAR_BASE, FOG_FAR_MAX, SPAWN_AREA_SIZE } from './config.js';
import { DEBUG } from './ui.js';

export let FOG_NEAR = FOG_NEAR_BASE;
export let FOG_FAR = FOG_FAR_BASE;

// Module-level variables to hold animated objects
let nebulosaBgMaterial, dimensionalLayers = [], borderWallShaderMaterial, borderLinesMaterial;

export function initEnvironment(scene, renderer) {
    setupLighting(scene);
    createBackgroundEffects(scene);
    enableGameFog(scene, renderer);
}

export function updateEnvironment(time, camera) {
    if (nebulosaBgMaterial) {
        nebulosaBgMaterial.uniforms.time.value = time;
        nebulosaBgMaterial.uniforms.cameraPos.value.copy(camera.position);
    }
    dimensionalLayers.forEach(layer => {
        layer.material.uniforms.time.value = time;
    });
    if (borderWallShaderMaterial) {
        borderWallShaderMaterial.uniforms.time.value = time;
        borderWallShaderMaterial.uniforms.cameraPos.value.copy(camera.position);
        borderWallShaderMaterial.uniforms.fadeNear.value = FOG_NEAR;
        borderWallShaderMaterial.uniforms.fadeFar.value = FOG_FAR;
    }
    if (borderLinesMaterial) {
        const borderHue = (time * 0.01) % 1;
        borderLinesMaterial.color.setHSL(borderHue, 0.8, 0.6);
    }
}

export function enableGameFog(state) {
    if (!DEBUG) {
        state.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
        state.renderer.setClearColor(FOG_COLOR);
    } else {
        disableGameFog(scene, renderer);
    }
}

export function disableGameFog(scene, renderer) {
    scene.fog = null;
    renderer.setClearColor(0x000000);
}

export function updateFogForPlayerSize(playerRadius, scene) {
    if (DEBUG) return;
    const minRadius = 1;
    const maxRadius = 100;
    const t = Math.min(1, Math.max(0, (playerRadius - minRadius) / (maxRadius - minRadius)));
    FOG_NEAR = FOG_NEAR_BASE + t * 60;
    FOG_FAR = FOG_FAR_BASE + t * (FOG_FAR_MAX - FOG_FAR_BASE);
    if (scene.fog) {
        scene.fog.near = FOG_NEAR;
        scene.fog.far = FOG_FAR;
    }
}

export function setupLighting(state) {
    const light = new THREE.DirectionalLight(0xffffff, 5);
    light.position.set(10, 20, 15);
    state.scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    state.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8888ff, 1.5);
    state.scene.add(hemiLight);
}

export function createBackgroundEffects(state) {
    // Nebulosa background effect
    const nebulosaBgGeometry = new THREE.PlaneGeometry(2000, 2000, 1, 1);
    nebulosaBgMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 },
            opacity: { value: 0.0 },
            cameraPos: { value: new THREE.Vector3() },
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float opacity;
            uniform vec2 resolution;
            varying vec2 vUv;

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                float aspectRatio = resolution.x / resolution.y;
                uv.x *= aspectRatio;
                float dist = length(uv);
                float angle = atan(uv.y, uv.x);
                float spiral = sin(angle * 6.0 + dist * 8.0 + time * 1.5) * 0.5 + 0.5;
                float streams = abs(sin(uv.x * 12.0 + time * 2.0) * sin(uv.y * 10.0 + time * 1.8));
                vec3 color1 = vec3(1.0, 0.2, 0.8);
                vec3 color2 = vec3(0.4, 0.1, 1.0);
                vec3 color3 = vec3(0.1, 0.9, 1.0);
                vec3 finalColor = mix(color1, color2, sin(spiral * 3.14159) * 0.5 + 0.5);
                finalColor = mix(finalColor, color3, streams * 0.3);
                float pulse = sin(time * 3.0 + dist * 5.0) * 0.5 + 0.5;
                finalColor += pulse * 0.2 * vec3(1.0, 0.5, 1.0);
                float centerIntensity = 1.0 / (1.0 + dist * dist * 0.5);
                float edgeFade = 1.0 - smoothstep(0.5, 2.0, dist);
                float intensity = (0.7 + spiral * 0.3) * centerIntensity * edgeFade;
                intensity += streams * 0.3;
                gl_FragColor = vec4(finalColor * intensity, opacity * intensity * 0.8);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    const nebulosaBgMesh = new THREE.Mesh(nebulosaBgGeometry, nebulosaBgMaterial);
    nebulosaBgMesh.position.set(0, 0, -900);
    // scene.add(nebulosaBgMesh); // Background disabled for now

    // Dimensional Layers
    dimensionalLayers.length = 0; // Clear the array before re-populating
    for (let i = 0; i < 3; i++) {
        const layerGeometry = new THREE.SphereGeometry(800 + i * 200, 32, 32);
        const layerMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                opacity: { value: 0.0 },
                layer: { value: i }
            },
            vertexShader: `
                uniform float time;
                uniform float layer;
                varying vec3 vPosition;
                varying vec3 vNormal;
                void main() {
                    vPosition = position;
                    vNormal = normal;
                    vec3 pos = position;
                    pos += normal * sin(time * (1.0 + layer * 0.5) + length(position) * 0.01) * (5.0 + layer * 10.0);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float opacity;
                uniform float layer;
                varying vec3 vPosition;
                varying vec3 vNormal;
                void main() {
                    vec3 color;
                    if (layer < 0.5) color = vec3(0.2, 0.6, 1.0);
                    else if (layer < 1.5) color = vec3(1.0, 0.3, 0.7);
                    else color = vec3(0.4, 1.0, 0.3);
                    float flow = sin(time * 2.0 + vPosition.x * 0.1 + vPosition.y * 0.15 + vPosition.z * 0.12);
                    flow += sin(time * 3.0 + length(vPosition.xy) * 0.05);
                    color += vec3(0.3) * flow * 0.5;
                    float fresnel = 1.0 - abs(dot(vNormal, normalize(vPosition)));
                    fresnel = pow(fresnel, 2.0);
                    float alpha = opacity * fresnel * (0.1 + layer * 0.05);
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        const layerMesh = new THREE.Mesh(layerGeometry, layerMaterial);
        state.scene.add(layerMesh);
        dimensionalLayers.push(layerMesh);
    }

    // Border lines and walls
    const borderLinesGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(SPAWN_AREA_SIZE, SPAWN_AREA_SIZE, SPAWN_AREA_SIZE));
    borderLinesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const borderLines = new THREE.LineSegments(borderLinesGeometry, borderLinesMaterial);
    state.scene.add(borderLines);

    const borderWallGeometry = new THREE.BoxGeometry(SPAWN_AREA_SIZE, SPAWN_AREA_SIZE, SPAWN_AREA_SIZE);
    borderWallShaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            cameraPos: { value: new THREE.Vector3() },
            fadeNear: { value: FOG_NEAR },
            fadeFar: { value: FOG_FAR },
            time: { value: 0.0 },
        },
        vertexShader: `
            varying vec3 vPosition;
            void main() {
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 cameraPos;
            uniform float fadeNear;
            uniform float fadeFar;
            uniform float time;
            varying vec3 vPosition;
            void main() {
                float dist = length(vPosition - cameraPos);
                float fade = smoothstep(fadeFar, fadeNear, dist);
                float anim = 0.5 + 0.5 * sin(0.18 * (vPosition.x + vPosition.y + vPosition.z) + time * 1.2);
                vec3 borderColor = vec3(0.0, 0.85, 0.95) + vec3(0.0, 0.15, 0.05) * anim;
                float alpha = fade * mix(0.18, 0.32, anim);
                gl_FragColor = vec4(borderColor, alpha);
                if (gl_FragColor.a < 0.01) discard;
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide
    });
    const borderWalls = new THREE.Mesh(borderWallGeometry, borderWallShaderMaterial);
    state.scene.add(borderWalls);
}
