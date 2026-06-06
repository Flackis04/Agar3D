import { useFrame, useThree } from "@react-three/fiber";
import React from "react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import Stats from "three/addons/libs/stats.module.js";
import { setupControls } from "./controls.js";
import { createCameraController } from "./camera.js";
import { initializeGame } from "./gameInit.js";
import { createGameFrame } from "./gameLoop.js";
import { AudioManager } from "./audio.js";

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

export function GameScene({ playerName, onReady }) {
  const { scene, camera, gl } = useThree();
  const frameStep = useRef(null);
  const controls = useRef(null);
  const createdObjects = useRef([]);
  const audioManager = useRef(null);
  const stats = useMemo(() => {
    const panel = new Stats();
    panel.dom.style.display = "block";
    panel.dom.style.position = "absolute";
    panel.dom.style.left = "0";
    panel.dom.style.top = "0";
    panel.dom.style.pointerEvents = "none";
    return panel;
  }, []);

  useEffect(() => {
    // React mounts this component when Play is clicked. From here on, the
    // Three.js scene is built by initializeGame and advanced by useFrame.
    const originalChildren = new Set(scene.children);
    const backgroundColor = new THREE.Color(0x050010);
    scene.background = backgroundColor;
    scene.fog = new THREE.Fog(backgroundColor, 0, 100);
    document.body.appendChild(stats.dom);

    // Initialize audio manager
    audioManager.current = new AudioManager();

    initializeGame(
      scene,
      camera,
      (gameState) => {
        const cameraController = createCameraController(
          camera,
          gameState.playerCell
        );
        controls.current = setupControls(gl.domElement, cameraController);
        frameStep.current = createGameFrame(
          scene,
          camera,
          gameState,
          cameraController,
          controls.current,
          stats
        ).step;
        createdObjects.current = scene.children.filter(
          (child) => !originalChildren.has(child)
        );
        onReady(gameState);
      },
      playerName,
      audioManager.current
    );

    return () => {
      // React may unmount the game when returning to the menu. Dispose objects
      // here so a fresh game does not keep old meshes or controls alive.
      controls.current?.dispose?.();
      stats.dom.remove();
      frameStep.current = null;
      createdObjects.current.forEach((object) => {
        scene.remove(object);
        disposeObject(object);
      });
      scene.fog = null;
      scene.background = null;
      onReady(null);
    };
  }, [camera, gl, onReady, playerName, scene, stats]);

  useFrame((_, delta) => {
    frameStep.current?.(delta);
  }, -100);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight intensity={1} position={[100, 200, 100]} />
    </>
  );
}
