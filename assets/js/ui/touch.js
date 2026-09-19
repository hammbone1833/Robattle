/**
 * On-screen controls for touch devices.
 *
 * Twin-stick layout: the left half of the screen is a dynamic movement stick that appears
 * wherever the thumb lands, the right half is drag-to-look, and the action buttons sit in
 * the bottom-right corner under the right thumb. Every pointer is tracked by its own id,
 * so moving and aiming at the same time works -- which on a shooter is not a nicety.
 *
 * Nothing here knows any game rules. It writes into the same InputController the keyboard
 * writes into, and the scenes cannot tell the difference.
 */

import { el } from './shell.js';

const STICK_RADIUS = 62;       // px from the stick centre to full deflection
const LOOK_SENSITIVITY = 1.9;  // finger drags are shorter than mouse moves


const BUTTON_SETS = {
  arena: [
    { action: 'rarm', label: 'R', sub: 'R.ARM', cls: 'big' },
    { action: 'larm', label: 'L', sub: 'L.ARM', cls: 'big' },
    { action: 'head', label: 'H', sub: 'HEAD' },
    { action: 'legs', label: '»', sub: 'DASH' },
    { action: 'medaforce', label: '★', sub: 'FORCE', cls: 'force' },
  ],
  village: [
    { action: 'interact', label: 'E', sub: 'ENTER', cls: 'big enter' },
  ],
};

export class TouchControls {
  /**
   * @param {import('../core/input.js').InputController} input
   * @param {'arena'|'village'} mode
   */
  constructor(input, mode) {
    this.input = input;
    this.mode = mode;
    this.root = document.getElementById('touch');
    this.movePointer = null;
    this.lookPointer = null;
    this.moveOrigin = { x: 0, y: 0 };

    this.build();
    this.bind();
    this.root.classList.remove('hidden');
  }

  build() {
    this.root.innerHTML = '';

    this.stickBase = el('div', { class: 'stick-base' }, el('div', { class: 'stick-knob' }));
    this.knob = this.stickBase.firstChild;
    this.stickBase.style.display = 'none';
    this.root.append(this.stickBase);

    this.buttons = new Map();
    const cluster = el('div', { class: `touch-buttons ${this.mode}` });
    for (const def of BUTTON_SETS[this.mode] ?? []) {
      const node = el('button', {
        class: `touch-btn ${def.cls ?? ''}`,
        dataset: { action: def.action },
        type: 'button',
        'aria-label': def.sub,
      }, el('span', { class: 'tb-label', text: def.label }), el('span', { class: 'tb-sub', text: def.sub }));
      cluster.append(node);
      this.buttons.set(def.action, node);
    }
    this.root.append(cluster);

    if (this.mode === 'village') {
      // The enter button only means anything next to a door.
      this.setActionEnabled('interact', false);
      this.root.append(el('div', { class: 'touch-hint', text: 'Drag the right side to look · left side to walk' }));
    }
  }

  bind() {
    // Pointer events on the whole overlay, so one thumb can steer while another aims.
    this._onDown = (e) => {
      const btn = e.target.closest?.('.touch-btn');
      if (btn) {
        if (btn.disabled) return;
        e.preventDefault();
        btn.classList.add('pressed');
        // Fire first. Pointer capture is a nicety that can throw if the pointer is
        // already gone, and a throw here used to swallow the press entirely.
        this.input.press(btn.dataset.action);
        try { btn.setPointerCapture?.(e.pointerId); } catch { /* nothing to capture */ }
        return;
      }
      e.preventDefault();
      const left = e.clientX < window.innerWidth * 0.45;
      if (left && this.movePointer === null) {
        this.movePointer = e.pointerId;
        this.moveOrigin = { x: e.clientX, y: e.clientY };
        this.stickBase.style.display = '';
        this.stickBase.style.left = `${e.clientX}px`;
        this.stickBase.style.top = `${e.clientY}px`;
        this.moveKnob(0, 0);
      } else if (this.lookPointer === null) {
        this.lookPointer = e.pointerId;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    };

    this._onMove = (e) => {
      if (e.pointerId === this.movePointer) {
        e.preventDefault();
        let dx = e.clientX - this.moveOrigin.x;
        let dy = e.clientY - this.moveOrigin.y;
        const len = Math.hypot(dx, dy);
        if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
        this.moveKnob(dx, dy);
        // Screen y grows downward; forward is up.
        this.input.setStick(dx / STICK_RADIUS, -dy / STICK_RADIUS);
      } else if (e.pointerId === this.lookPointer) {
        e.preventDefault();
        this.input.addLook(
          (e.clientX - this.lookLast.x) * LOOK_SENSITIVITY,
          (e.clientY - this.lookLast.y) * LOOK_SENSITIVITY);
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    };

    this._onUp = (e) => {
      const btn = e.target.closest?.('.touch-btn');
      if (btn) btn.classList.remove('pressed');
      if (e.pointerId === this.movePointer) {
        this.movePointer = null;
        this.stickBase.style.display = 'none';
        this.input.clearStick();
      } else if (e.pointerId === this.lookPointer) {
        this.lookPointer = null;
      }
    };

    this.root.addEventListener('pointerdown', this._onDown, { passive: false });
    this.root.addEventListener('pointermove', this._onMove, { passive: false });
    this.root.addEventListener('pointerup', this._onUp);
    this.root.addEventListener('pointercancel', this._onUp);
    this.root.addEventListener('lostpointercapture', this._onUp);
  }

  moveKnob(dx, dy) {
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  /** Grey out a button that cannot currently do anything. */
  setActionEnabled(action, enabled) {
    const btn = this.buttons.get(action);
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle('disabled', !enabled);
  }

  /** Mirror weapon readiness onto the buttons, the way the desktop action bar does. */
  syncArena(bot, combat) {
    if (this.mode !== 'arena' || !bot) return;
    for (const [action, btn] of this.buttons) {
      let ready = true;
      if (action === 'medaforce') ready = bot.medaforce >= 100;
      else if (action === 'legs') ready = !bot.parts.legs.destroyed && bot.cooldown.legs <= combat.time;
      else {
        const st = bot.parts[action];
        ready = st && !st.destroyed && st.usesLeft > 0 && bot.cooldown[action] <= combat.time;
      }
      btn.classList.toggle('cool', !ready);
      btn.classList.toggle('charged', action === 'medaforce' && ready);
    }
  }

  hide() { this.root.classList.add('hidden'); }

  /** Hidden while a panel is open, so the controls never show through a modal. */
  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
    if (!visible) {
      this.movePointer = this.lookPointer = null;
      this.stickBase.style.display = 'none';
      this.input.clearStick();
    }
  }

  dispose() {
    this.root.removeEventListener('pointerdown', this._onDown);
    this.root.removeEventListener('pointermove', this._onMove);
    this.root.removeEventListener('pointerup', this._onUp);
    this.root.removeEventListener('pointercancel', this._onUp);
    this.root.removeEventListener('lostpointercapture', this._onUp);
    this.input.clearStick();
    this.root.innerHTML = '';
    this.hide();
  }
}

/**
 * Go fullscreen and, where the browser allows it, lock to landscape. Mobile browser
 * chrome eats a third of a small screen, which matters more here than anywhere else.
 */
export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return false;
    }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    try { await screen.orientation?.lock?.('landscape'); } catch { /* desktop and iOS refuse; fine */ }
    return true;
  } catch {
    return !!document.fullscreenElement;
  }
}
