/**
 * The arena view: the 3D Robattle itself.
 *
 * You drive one medabot in third person. The camera is the gun sight -- shots leave the
 * muzzle heading for whatever the crosshair is on, so aiming high goes for the head and
 * aiming wide takes an arm off. That is the whole skill of the game, and it is why the
 * renderer and the simulation share one rig: what you see is what the rules test.
 */

import * as THREE from '../../../vendor/three.module.js';
import { buildRobot, setPartDamage, setPartDestroyed, animateRobot } from './robot.js';
import { Fx } from './fx.js';
import { RIG, muzzleOf, partCenter } from '../core/rig.js';
import { FAMILIES } from '../data/parts.js';
import { readyActions, canMedaforce, moveSpeed, legStyle } from '../core/combat.js';
import { basis, resolveOcclusion, SHOULDER } from './camera.js';
import { InputController } from '../core/input.js';
import { QUALITY, detectQuality } from '../core/device.js';

const KEY_TO_SLOT = {
  Digit1: 'head', KeyQ: 'head',
  Digit2: 'rarm', KeyE: 'rarm',
  Digit3: 'larm', KeyR: 'larm',
  Digit4: 'legs', ShiftLeft: 'legs', ShiftRight: 'legs', Space: 'legs',
  KeyF: 'medaforce',
};
const MOUSE_TO_SLOT = { 0: 'rarm', 2: 'larm', 1: 'head' };
const BUFFER_SECONDS = 0.5;   // how long a press survives while the robot is mid-action

export class ArenaScene {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('../core/combat.js').Combat} combat
   * @param {{overlay:HTMLElement, canvas:HTMLCanvasElement}} dom
   */
  constructor(renderer, combat, dom, { quality = detectQuality(), blocked } = {}) {
    this.renderer = renderer;
    this.combat = combat;
    this.dom = dom;
    this.arena = combat.arena;
    this.quality = quality;
    this.blocked = blocked ?? (() => false);
    this.disposed = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.arena.sky);
    this.scene.fog = new THREE.FogExp2(this.arena.fog, (this.arena.fogDensity ?? 0.014) * quality.fogScale);

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, quality.drawDistance);
    this.yaw = 0;
    this.pitch = -0.06;
    this.camDist = 6.4;

    this.fx = new Fx(this.scene, dom.overlay, quality);
    this.robots = new Map();
    this.clockOffset = 0;

    this.buildEnvironment();
    this.buildRobots();
    this.bindInput();

    this.buffered = null;
    this.aimPoint = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();

    this.unsubscribe = combat.on((ev) => this.onCombatEvent(ev));
  }

  /* -------------------------------------------------------- environment */

  buildEnvironment() {
    const a = this.arena;
    const hw = a.width / 2, hd = a.depth / 2;

    // Night arenas have a near-black sky colour, and driving the hemisphere light straight
    // from it left the robots as unreadable silhouettes. Light the scene from a brightened
    // version of the sky instead, and add a fill light so a dark arena is still legible.
    const skyTint = new THREE.Color(a.sky).lerp(new THREE.Color(0xffffff), 0.55);
    const groundTint = new THREE.Color(a.ground).lerp(new THREE.Color(0xffffff), 0.2);
    this.scene.add(new THREE.HemisphereLight(skyTint, groundTint, 1.35));

    const fill = new THREE.DirectionalLight(new THREE.Color(a.accent).lerp(new THREE.Color(0xffffff), 0.5), 0.55);
    fill.position.set(-16, 14, -18);
    this.scene.add(fill);

    const sun = new THREE.DirectionalLight(0xfff2dd, 1.5);
    sun.position.set(18, 30, 12);
    sun.castShadow = this.quality.shadows;
    sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    const d = Math.max(hw, hd) + 6;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 90 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(new THREE.Color(a.accent).lerp(new THREE.Color(0xffffff), 0.3), 0.38));

    const groundMat = new THREE.MeshStandardMaterial({ color: a.ground, roughness: 0.95, metalness: 0.05 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(a.width + 40, a.depth + 40), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Playing surface markings.
    const grid = new THREE.GridHelper(Math.max(a.width, a.depth), Math.max(a.width, a.depth) / 2, a.grid, a.grid);
    grid.material.opacity = 0.3;
    grid.material.transparent = true;
    grid.position.y = 0.02;
    this.scene.add(grid);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.0, 3.25, 48),
      new THREE.MeshBasicMaterial({ color: a.accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.scene.add(ring);

    // Cover.
    const blockMat = new THREE.MeshStandardMaterial({ color: a.grid, roughness: 0.8, metalness: 0.2 });
    for (const [x, z, bhw, bhd, h] of a.blocks) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bhw * 2, h, bhd * 2), blockMat);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }

    // Perimeter wall and tiered stands, so the arena feels enclosed and watched.
    const wallMat = new THREE.MeshStandardMaterial({ color: a.grid, roughness: 0.7, metalness: 0.25 });
    const wallH = 1.6;
    for (const [w, h2, x, z] of [[a.width + 2, 0.6, 0, -hd - 0.3], [a.width + 2, 0.6, 0, hd + 0.3]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, h2), wallMat);
      m.position.set(x, wallH / 2, z);
      m.receiveShadow = true;
      this.scene.add(m);
    }
    for (const x of [-hw - 0.3, hw + 0.3]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, wallH, a.depth + 2), wallMat);
      m.position.set(x, wallH / 2, 0);
      m.receiveShadow = true;
      this.scene.add(m);
    }

    const standMat = new THREE.MeshStandardMaterial({ color: a.grid, roughness: 0.9, metalness: 0.05 });
    const crowdGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const crowdMax = this.quality.crowd;
    const crowd = new THREE.InstancedMesh(crowdGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), Math.max(1, crowdMax));
    let ci = 0;
    const m4 = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let tier = 0; tier < 3; tier++) {
      const y = 0.9 + tier * 1.1;
      const out = 2.2 + tier * 1.7;
      for (const side of [-1, 1]) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(a.width + 6 + out * 2, 1.05, 2.0), standMat);
        step.position.set(0, y - 0.5, side * (hd + out));
        step.receiveShadow = true;
        this.scene.add(step);
        const stepX = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.05, a.depth + 4), standMat);
        stepX.position.set(side * (hw + out), y - 0.5, 0);
        stepX.receiveShadow = true;
        this.scene.add(stepX);

        for (let i = 0; i < 40 && ci < crowdMax; i++) {
          const px = (Math.random() - 0.5) * (a.width + 4);
          m4.makeTranslation(px, y + 0.3, side * (hd + out));
          crowd.setMatrixAt(ci, m4);
          crowd.setColorAt(ci, color.setHSL(Math.random(), 0.45, 0.45 + Math.random() * 0.25));
          ci++;
        }
      }
    }
    crowd.count = ci;
    crowd.visible = ci > 0;
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    this.scene.add(crowd);
    this.crowd = crowd;
  }

  buildRobots() {
    for (const bot of this.combat.bots) {
      const loadout = {
        head: bot.parts.head.part.id, rarm: bot.parts.rarm.part.id,
        larm: bot.parts.larm.part.id, legs: bot.parts.legs.part.id,
      };
      const model = buildRobot(loadout, { glow: bot.side === 0 ? 0x8ff0ff : 0xffa48c });
      model.position.set(bot.pos.x, 0, bot.pos.z);
      model.rotation.y = bot.facing;
      this.scene.add(model);

      // A coloured disc so you can always tell friend from foe at a glance.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.82, 20),
        new THREE.MeshBasicMaterial({
          color: bot.side === 0 ? 0x5fd6ff : 0xff7a5f,
          transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      model.add(ring);

      if (bot.isLeader) {
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(0.2, 0.34, 4),
          new THREE.MeshBasicMaterial({ color: 0xffd76a }));
        crown.position.set(0, 2.42, 0);
        crown.rotation.y = Math.PI / 4;
        model.add(crown);
        model.userData.crown = crown;
      }
      this.robots.set(bot.id, model);
    }
  }

  /* --------------------------------------------------------------- input */

  bindInput() {
    this.input = new InputController(this.dom.canvas, {
      keyActions: KEY_TO_SLOT,
      mouseActions: MOUSE_TO_SLOT,
      blocked: this.blocked,
      onAction: (slot) => this.fire(slot),
    });
    this.input.attach();
  }

  /** Apply accumulated look from mouse, trackpad or a dragging thumb. */
  applyLook() {
    const { dx, dy } = this.input.consumeLook();
    if (!dx && !dy) return;
    this.yaw -= dx * 0.0026;
    this.pitch = Math.max(-0.75, Math.min(0.55, this.pitch - dy * 0.0022));
  }

  /** Fire a slot along the current aim. Returns the engine's verdict for HUD feedback. */
  fire(slot) {
    const bot = this.combat.playerBot;
    if (!bot || !bot.functional || this.combat.finished) return 'unavailable';
    const dir = this.aimDirectionFrom(bot, slot);
    const verdict = this.combat.tryAction(bot.id, slot, dir);

    if (verdict === 'busy') {
      // The lock between actions is a fraction of a second. Dropping a press that lands
      // inside it makes the controls feel like they are ignoring you, so hold it briefly
      // and fire the moment the robot is free. Only 'busy' is buffered -- a part on a
      // two-second cooldown would fire at some surprising later moment.
      //
      // The deadline is in simulation seconds, not wall-clock: it is waiting on the
      // robot's action lock, which is sim time, and the two drift apart whenever the
      // sim is paused behind a panel or the frame rate dips.
      this.buffered = { slot, until: this.combat.time + BUFFER_SECONDS };
    } else {
      this.buffered = null;
      if (verdict !== true) this.onRefused?.(slot, verdict);
    }
    return verdict;
  }

  /** Release a buffered press as soon as the robot can act on it. */
  flushBuffered(player) {
    if (!this.buffered) return;
    if (this.combat.time > this.buffered.until) { this.buffered = null; return; }
    if (!player || !player.functional) { this.buffered = null; return; }
    if (player.windup || player.lock > this.combat.time) return;
    const { slot } = this.buffered;
    this.buffered = null;
    this.fire(slot);
  }

  /**
   * Direction from the weapon's muzzle to whatever the crosshair is on.
   * Firing straight down the camera axis would make shots miss at close range, because
   * the barrel is a metre to the side of the eye.
   */
  aimDirectionFrom(bot, slot) {
    const muzzle = slot === 'medaforce' ? muzzleOf(bot, 'head') : muzzleOf(bot, slot === 'legs' ? 'rarm' : slot);
    const target = this.aimPoint;
    const dx = target.x - muzzle.x, dy = target.y - muzzle.y, dz = target.z - muzzle.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  /** Mild magnetism toward an enemy part near the crosshair -- a gamepad-style assist. */
  applyAimAssist(bot) {
    let best = null, bestAngle = 0.055;
    this.camera.getWorldDirection(this._forward);
    const cam = this.camera.position;
    for (const foe of this.combat.enemiesOf(bot)) {
      for (const slot of ['head', 'rarm', 'larm', 'legs']) {
        if (foe.parts[slot].destroyed) continue;
        const c = partCenter(foe, slot);
        const dx = c.x - cam.x, dy = c.y - cam.y, dz = c.z - cam.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const dot = (dx / len) * this._forward.x + (dy / len) * this._forward.y + (dz / len) * this._forward.z;
        const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (ang < bestAngle) { bestAngle = ang; best = c; }
      }
    }
    if (best) this.aimPoint.lerp(new THREE.Vector3(best.x, best.y, best.z), 0.32);
  }

  /* -------------------------------------------------------------- events */

  onCombatEvent(ev) {
    const model = ev.botId ? this.robots.get(ev.botId) : null;
    switch (ev.type) {
      case 'fire': {
        const c = FAMILIES[this.combat.bot(ev.botId)?.parts[ev.slot]?.part.family]?.color ?? 0xffd08a;
        this.fx.flash(ev.from.x, ev.from.y, ev.from.z, 0.32, c, 0.1);
        break;
      }
      case 'beam':
        this.fx.beam(ev.from, ev.to, FAMILIES[ev.family]?.color ?? 0x9ff4ff);
        break;
      case 'swing':
        if (model) this.punchAnim(ev.botId, ev.slot);
        break;
      case 'impact':
        this.fx.spark(ev.at.x, ev.at.y, ev.at.z, 5, 0xbfc6cf, 3);
        break;
      case 'hit': {
        this.fx.spark(ev.at.x, ev.at.y, ev.at.z, 9, ev.destroyed ? 0xff8a3c : 0xffd27a, 5);
        this.fx.flash(ev.at.x, ev.at.y, ev.at.z, 0.4, 0xffc070, 0.12);
        const isPlayerShot = ev.botId === this.combat.playerBotId;
        const onPlayer = ev.targetBotId === this.combat.playerBotId;
        this.fx.label(`${ev.damage}`, ev.at, onPlayer ? 'hurt' : isPlayerShot ? 'dmg' : 'other');
        if (onPlayer) this.fx.shake = Math.max(this.fx.shake, 0.35);
        break;
      }
      case 'repair':
        this.fx.label(`+${ev.healed}`, ev.at, 'heal');
        this.fx.spark(ev.at.x, ev.at.y, ev.at.z, 6, 0x7de2a8, 2.4);
        break;
      case 'part-destroyed':
        this.fx.explosion(ev.at.x, ev.at.y, ev.at.z, 1.2, 0xff8a3c);
        if (this.robots.get(ev.botId)) setPartDestroyed(this.robots.get(ev.botId), ev.slot, true);
        break;
      case 'bot-down': {
        const m = this.robots.get(ev.botId);
        if (m) this.fx.explosion(m.position.x, 1.1, m.position.z, 2.4, 0xffb45a);
        break;
      }
      case 'medaforce': {
        const m = this.robots.get(ev.botId);
        if (m) {
          this.fx.flash(m.position.x, 1.3, m.position.z, 2.6, 0xffe9a8, 0.5);
          this.fx.spark(m.position.x, 1.3, m.position.z, 26, 0xfff0b0, 9);
          this.fx.shake = 0.8;
        }
        break;
      }
      case 'dash': {
        const m = this.robots.get(ev.botId);
        if (m) this.fx.spark(m.position.x, 0.3, m.position.z, 6, 0x9ff4ff, 2.2);
        break;
      }
      default: break;
    }
  }

  punchAnim(botId, slot) {
    const model = this.robots.get(botId);
    if (!model) return;
    const arm = model.userData.parts[slot];
    if (arm) model.userData.swing = { slot, t: 0.22 };
  }

  /* -------------------------------------------------------------- update */

  update(dt) {
    if (this.disposed) return;
    const combat = this.combat;
    const player = combat.playerBot;

    this.applyLook();
    this.flushBuffered(player);
    if (player && player.functional && !combat.finished) {
      this.readMovement(player, dt);
    } else if (player) {
      combat.setInput(player.id, { mx: 0, mz: 0 });
    }

    combat.update(dt);
    this.syncRobots(dt);
    this.fx.syncProjectiles(combat.projectiles);
    this.updateCamera(dt, player);
    this.fx.update(dt, this.camera);
  }

  readMovement(player, dt) {
    const { fwd, strafe } = this.input.moveAxis();
    // Movement is relative to where the camera is looking, like any third-person game.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const mx = sin * fwd + cos * strafe;
    const mz = cos * fwd - sin * strafe;
    this.combat.setInput(player.id, { mx, mz, facing: this.yaw });
  }

  syncRobots(dt) {
    const t = performance.now() / 1000;
    for (const bot of this.combat.bots) {
      const model = this.robots.get(bot.id);
      if (!model) continue;

      if (!bot.functional) {
        // Wreckage: tip over and stay down.
        model.rotation.z = Math.min(Math.PI / 2.1, model.rotation.z + dt * 2.4);
        model.position.y = Math.max(-0.1, model.position.y - dt * 0.6);
        if (model.userData.crown) model.userData.crown.visible = false;
        continue;
      }

      model.position.x = bot.pos.x;
      model.position.z = bot.pos.z;
      model.rotation.y = bot.facing;

      const speed01 = Math.min(1, Math.hypot(bot.vel.x, bot.vel.z) / Math.max(0.1, moveSpeed(bot)));
      const busy = bot.windup?.slot;
      animateRobot(model, t, speed01, { rarmBusy: busy === 'rarm', larmBusy: busy === 'larm' });

      // Wind-up tell: the firing arm rocks back so opponents can read the shot coming.
      for (const slot of ['rarm', 'larm']) {
        const arm = model.userData.parts[slot];
        if (!arm) continue;
        if (busy === slot) arm.rotation.x = -0.5;
      }
      if (model.userData.swing) {
        const s = model.userData.swing;
        s.t -= dt;
        const arm = model.userData.parts[s.slot];
        if (arm) arm.rotation.x = -1.4 * Math.max(0, s.t / 0.22) + 0.6;
        if (s.t <= 0) model.userData.swing = null;
      }

      for (const slot of ['head', 'rarm', 'larm', 'legs']) {
        const st = bot.parts[slot];
        if (st.destroyed) setPartDestroyed(model, slot, true);
        else setPartDamage(model, slot, st.armor / st.maxArmor);
      }
    }
  }

  updateCamera(dt, player) {
    const target = player && player.functional
      ? player
      : this.combat.teams[0].bots.find((b) => b.functional) ?? this.combat.bots[0];
    if (!target) return;

    const focusY = 1.5;
    const dist = this.camDist;
    const { fx, fz, rx, rz } = basis(this.yaw);

    // Focus over the robot's shoulder so its own body is not parked on the crosshair.
    const focus = {
      x: target.pos.x + rx * SHOULDER,
      y: focusY,
      z: target.pos.z + rz * SHOULDER,
    };
    const want = {
      x: focus.x - fx * Math.cos(this.pitch) * dist,
      y: focusY + Math.sin(-this.pitch) * dist + 1.0,
      z: focus.z - fz * Math.cos(this.pitch) * dist,
    };
    const safe = resolveOcclusion(focus, want, this.arena.blocks, 2.0);

    // Keep the camera inside the arena. Behind the perimeter wall it ends up buried in
    // the spectator stands, which looks like the renderer has broken.
    const chw = this.arena.width / 2 - 0.8, chd = this.arena.depth / 2 - 0.8;
    safe.x = Math.max(-chw, Math.min(chw, safe.x));
    safe.z = Math.max(-chd, Math.min(chd, safe.z));

    const shake = this.fx.shake;
    this.camera.position.lerp(new THREE.Vector3(safe.x, Math.max(1.2, safe.y), safe.z), Math.min(1, dt * 12));
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake * 0.3;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.3;
    }
    this.camera.lookAt(focus.x, focusY, focus.z);

    // Push the crosshair out along the camera axis to find the world point being aimed at.
    this.camera.getWorldDirection(this._forward);
    this.aimPoint.copy(this.camera.position).addScaledVector(this._forward, 42);
    if (this.aimPoint.y < 0.12) {
      const t = (this.camera.position.y - 0.12) / Math.max(0.001, this.camera.position.y - this.aimPoint.y);
      this.aimPoint.copy(this.camera.position).lerp(this.aimPoint, Math.max(0.05, t));
    }
    if (player && player.functional) this.applyAimAssist(player);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Screen-space position of a bot, for HUD markers. Returns null when off-camera. */
  screenPosition(bot) {
    const v = new THREE.Vector3(bot.pos.x, 2.3, bot.pos.z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100 };
  }

  dispose() {
    this.disposed = true;
    this.unsubscribe?.();
    this.input?.detach();
    this.fx.dispose();
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material?.dispose?.();
      }
    });
  }
}
