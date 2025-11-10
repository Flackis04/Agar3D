import * as THREE from 'three';

export default class Controls {
  constructor(camera, step = 1) {
    this.camera = camera;
    this.step = step;
    this.mouse = new THREE.Vector2(0, 0);
    this._v = new THREE.Vector3();
    this._onKey = this._onKey.bind(this);
    this._onMouse = this._onMouse.bind(this);
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('mousemove', this._onMouse);
  }

  _onMouse(e) {
    // store mouse in normalized device coords (-1..1)
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    this.mouse.set(x * 2 - 1, - (y * 2 - 1));
    // make camera look at a world point under the mouse
    this._v.set(this.mouse.x, this.mouse.y, 0.5).unproject(this.camera);
    this.camera.lookAt(this._v);
  }

  _onKey(e) {
    // ignore typed input
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;

    if (e.code === 'KeyW') {
      this.camera.position.z -= this.step;
      e.preventDefault();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('mousemove', this._onMouse);
  }
}
