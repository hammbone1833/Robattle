/**
 * Unified input.
 *
 * The village and the arena want the same three things -- a movement vector, a look
 * delta, and discrete action presses -- so they share one controller rather than each
 * growing its own copy. That is what makes touch support a single implementation instead
 * of two: the on-screen stick writes into the same movement vector the WASD keys do, and
 * neither scene knows or cares which one the player used.
 */

import { supportsPointerLock } from './device.js';

const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyD: [1, 0], ArrowRight: [1, 0],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
};

export class InputController {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} cfg
   * @param {Record<string,string>} [cfg.keyActions]  key code -> action name
   * @param {Record<number,string>} [cfg.mouseActions] mouse button -> action name
   * @param {(action:string)=>void} [cfg.onAction]
   * @param {()=>boolean} [cfg.blocked] return true to ignore input (e.g. a panel is open)
   */
  constructor(canvas, { keyActions = {}, mouseActions = {}, onAction, blocked, pointerLock } = {}) {
    this.canvas = canvas;
    this.keyActions = keyActions;
    this.mouseActions = mouseActions;
    this.onAction = onAction;
    this.blocked = blocked ?? (() => false);

    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };
    this.stick = { x: 0, y: 0, active: false };   // on-screen joystick, -1..1
    this.sprintHeld = false;
    this.pointerLocked = false;
    this.dragging = false;
    this.usePointerLock = pointerLock ?? supportsPointerLock();
    this.attached = false;
    this.sensitivity = 1;
    this.invertY = false;
  }

  attach() {
    if (this.attached) return;
    this.attached = true;

    this._onKeyDown = (e) => {
      if (e.repeat || this.blocked()) return;
      this.keys.add(e.code);
      const action = this.keyActions[e.code];
      if (action) { e.preventDefault(); this.press(action); }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => this.keys.clear();

    this._onMouseDown = (e) => {
      if (this.blocked()) return;
      // First click captures the pointer; only then do clicks mean actions, so the
      // click that grabs the mouse never also fires a weapon.
      if (this.usePointerLock && !this.pointerLocked) {
        this.canvas.requestPointerLock?.();
        this.dragging = true;
        return;
      }
      if (!this.usePointerLock) this.dragging = true;
      const action = this.mouseActions[e.button];
      if (action) { e.preventDefault(); this.press(action); }
    };
    this._onMouseUp = () => { this.dragging = false; };
    this._onMouseMove = (e) => {
      if (this.blocked()) return;
      if (!this.pointerLocked && !this.dragging) return;
      this.look.dx += e.movementX ?? 0;
      this.look.dy += e.movementY ?? 0;
    };
    this._onLockChange = () => { this.pointerLocked = document.pointerLockElement === this.canvas; };
    this._onContext = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.canvas.addEventListener('contextmenu', this._onContext);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this.canvas.removeEventListener('contextmenu', this._onContext);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    this.keys.clear();
  }

  press(action) {
    if (this.blocked()) return;
    this.onAction?.(action);
  }

  /* --------------------------------------------------- written to by touch */

  /** On-screen stick position, -1..1 on each axis. y is forward. */
  setStick(x, y) {
    this.stick.x = x;
    this.stick.y = y;
    this.stick.active = Math.hypot(x, y) > 0.08;
  }
  clearStick() { this.setStick(0, 0); }

  /** Accumulate a drag-to-look delta, in the same units as mouse movement. */
  addLook(dx, dy) {
    this.look.dx += dx;
    this.look.dy += dy;
  }

  /* ------------------------------------------------------------- readers */

  /**
   * Movement as forward/strafe in -1..1, from whichever device is driving.
   * Keyboard and stick are summed rather than switched between, so a player can use
   * both (a touchscreen laptop) without either one winning.
   */
  moveAxis() {
    let fwd = 0, strafe = 0;
    for (const code of this.keys) {
      const v = MOVE_KEYS[code];
      if (v) { strafe += v[0]; fwd += v[1]; }
    }
    if (this.stick.active) { strafe += this.stick.x; fwd += this.stick.y; }
    const len = Math.hypot(strafe, fwd);
    if (len > 1) { strafe /= len; fwd /= len; }
    return { fwd, strafe };
  }

  /** Look delta since the last call, scaled by the player's preferences, then reset. */
  consumeLook() {
    const out = {
      dx: this.look.dx * this.sensitivity,
      dy: this.look.dy * this.sensitivity * (this.invertY ? -1 : 1),
    };
    this.look.dx = 0;
    this.look.dy = 0;
    return out;
  }

  /** Running in the village: a held key, or the stick pushed to its edge. */
  isSprinting() {
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) return true;
    return this.sprintHeld || (this.stick.active && Math.hypot(this.stick.x, this.stick.y) > 0.92);
  }

  isDown(code) { return this.keys.has(code); }

  /** True once the player has done whatever this device needs to start looking around. */
  get lookReady() { return !this.usePointerLock || this.pointerLocked; }
}
