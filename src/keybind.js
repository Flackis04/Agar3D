import * as THREE from 'three';

export default class Controls {
  constructor(camera, renderer, step = 1) {
    this.camera = camera;
    this.renderer = renderer;
    this.step = step;

    this.yaw = 0;
    this.pitch = 0;

    this._onKey = this._onKey.bind(this);
    this._onMouseMoveBind = this._onMouseMove.bind(this);

    window.addEventListener('keydown', this._onKey);
  }

  initPointerLock() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('click', () => {
      canvas.requestPointerLock({
        unadjustedMovement: true
      });
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) {
        console.log('Pointer locked');
        document.addEventListener('mousemove', this._onMouseMoveBind);
      } else {
        console.log('Pointer unlocked');
        document.removeEventListener('mousemove', this._onMouseMoveBind);
      }
    });
  }

  _onMouseMove(e) {
    const sensitivity = 0.002;

    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));

    const radius = 50;
    const posX = radius * Math.cos(this.pitch) * Math.sin(this.yaw);
    const posY = radius * Math.sin(this.pitch);
    const posZ = radius * Math.cos(this.pitch) * Math.cos(this.yaw);

    this.camera.position.set(posX, -posY, posZ);
    this.camera.lookAt(0, 0, 0);
  }

  _onKey(e) {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;

    if (e.code === 'KeyW') {
      this.camera.position.z -= this.step;
      e.preventDefault();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    document.removeEventListener('mousemove', this._onMouseMoveBind);
  }
}
