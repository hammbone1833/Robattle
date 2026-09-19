/**
 * Medarra Village -- the hub world.
 *
 * You walk your own medabot around a small town and go into places rather than picking
 * them off a menu: the parts shop, the training gym, the tournament hall, the standings
 * monument and the event tent. Walk up to a door and it offers itself; the menu that
 * opens is the same UI a title screen would have given you, but you had to go there.
 *
 * The controller is deliberately the same one the arena uses, so the walk to the shop
 * teaches you the movement you will be fighting with.
 */

import * as THREE from '../../../vendor/three.module.js';
import { buildRobot, animateRobot } from './robot.js';
import { familyLoadout } from '../data/parts.js';
import { basis, resolveOcclusion, SHOULDER } from './camera.js';

export const LANDMARKS = [
  {
    id: 'garage', label: 'Your Garage', key: 'garage',
    x: 0, z: 16, w: 9, d: 7, h: 4.6, color: 0x7a8496, roof: 0x4d5566,
    door: { x: 0, z: 12.2 }, sign: 'GARAGE',
    blurb: 'Swap parts, change medals and rebuild your team.',
  },
  {
    id: 'shop', label: 'Cogsworth Parts', key: 'shop',
    x: -17, z: 3, w: 10, d: 8, h: 5.0, color: 0x9a7d5a, roof: 0x5e4a33,
    door: { x: -17, z: -1.4 }, sign: 'PARTS',
    blurb: 'Medaparts and medals, stock rotates every week.',
  },
  {
    id: 'gym', label: 'Practice Gym', key: 'gym',
    x: 17, z: 3, w: 10, d: 8, h: 5.0, color: 0x5f8a72, roof: 0x36523f,
    door: { x: 17, z: -1.4 }, sign: 'GYM',
    blurb: 'Free sparring and target drills. Nothing at stake.',
  },
  {
    id: 'arena', label: 'Tournament Hall', key: 'tournaments',
    x: 0, z: -20, w: 18, d: 12, h: 8.5, color: 0x6c6f86, roof: 0x3c3f52,
    door: { x: 0, z: -13.6 }, sign: 'ROBATTLE',
    blurb: 'Enter a cup. Prize money, rating and rare parts.',
  },
  {
    id: 'standings', label: 'Standings Monument', key: 'leaderboard',
    x: -15, z: -12, w: 3.2, d: 3.2, h: 6.0, color: 0x8d94a6, roof: 0xc8a34a,
    door: { x: -15, z: -8.8 }, sign: 'RANKS',
    blurb: 'Regional rankings and your record.',
  },
  {
    id: 'events', label: 'Event Tent', key: 'events',
    x: 15, z: -12, w: 9, d: 8, h: 5.2, color: 0xa8566a, roof: 0x6d2f42,
    door: { x: 15, z: -8.2 }, sign: 'EVENTS',
    blurb: 'This week\'s special challenge and its exclusive part.',
  },
];

const WORLD = { half: 32 };

export class VillageScene {
  constructor(renderer, dom, { loadout, onPrompt }) {
    this.renderer = renderer;
    this.dom = dom;
    this.onPrompt = onPrompt;
    this.disposed = false;
    this.nearby = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc4e2);
    this.scene.fog = new THREE.FogExp2(0xbcd6ea, 0.0125);

    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
    this.yaw = Math.PI * 1.25;
    this.pitch = -0.14;

    this.player = { pos: { x: 7.5, z: 7.5 }, facing: Math.PI * 1.25, vel: { x: 0, z: 0 }, speed: 7.5 };
    this.colliders = [];

    this.buildWorld();
    this.setLoadout(loadout);
    this.bindInput();
  }

  /* --------------------------------------------------------------- world */

  buildWorld() {
    const hemi = new THREE.HemisphereLight(0xbcd9f2, 0x6d7a58, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.45);
    sun.position.set(24, 34, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 110 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x6f8455, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Plaza and the paths that connect every door to it.
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.95 });
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 40), stoneMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    for (const lm of LANDMARKS) {
      const dx = lm.door.x, dz = lm.door.z;
      const len = Math.hypot(dx, dz);
      const path = new THREE.Mesh(new THREE.PlaneGeometry(3.0, len), stoneMat);
      path.rotation.x = -Math.PI / 2;
      path.rotation.z = -Math.atan2(dx, dz);
      path.position.set(dx / 2, 0.015, dz / 2);
      path.receiveShadow = true;
      this.scene.add(path);
    }

    // Fountain in the middle of the plaza.
    const fountain = new THREE.Group();
    fountain.add(this.mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.5, 20), 0x9aa3ad, 0, 0.25, 0));
    fountain.add(this.mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.16, 20), 0x4f9fd0, 0, 0.5, 0));
    fountain.add(this.mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.7, 12), 0x9aa3ad, 0, 1.2, 0));
    fountain.add(this.mesh(new THREE.SphereGeometry(0.5, 14, 12), 0xc8a34a, 0, 2.2, 0));
    this.scene.add(fountain);
    this.colliders.push({ x: 0, z: 0, hw: 2.4, hd: 2.4, blocksCamera: true, h: 2.6 });

    for (const lm of LANDMARKS) this.buildBuilding(lm);

    // Trees and lamps for a bit of life around the edges.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + 0.2;
      const r = 26 + Math.sin(i * 2.7) * 4;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const trunk = this.mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.2, 7), 0x6b4f35, x, 1.1, z);
      const leaves = this.mesh(new THREE.ConeGeometry(1.7, 3.2, 8), i % 3 ? 0x4e7a3f : 0x5f8c46, x, 3.4, z);
      trunk.castShadow = leaves.castShadow = true;
      this.scene.add(trunk, leaves);
      this.colliders.push({ x, z, hw: 0.5, hd: 0.5 });
    }
    for (const [lx, lz] of [[-9, 9], [9, 9], [-9, -9], [9, -9]]) {
      const post = this.mesh(new THREE.CylinderGeometry(0.11, 0.14, 4.2, 8), 0x3f4652, lx, 2.1, lz);
      const lamp = this.mesh(new THREE.SphereGeometry(0.32, 10, 8), 0xffeec2, lx, 4.35, lz);
      lamp.material = new THREE.MeshStandardMaterial({ color: 0xffeec2, emissive: 0xffd48a, emissiveIntensity: 0.8 });
      post.castShadow = true;
      this.scene.add(post, lamp);
      this.colliders.push({ x: lx, z: lz, hw: 0.3, hd: 0.3 });
    }

    this.buildNpcs();
    this.cameraBlockers = this.colliders.filter((c) => c.blocksCamera);
  }

  mesh(geo, color, x, y, z) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    return m;
  }

  buildBuilding(lm) {
    const g = new THREE.Group();
    const body = this.mesh(new THREE.BoxGeometry(lm.w, lm.h, lm.d), lm.color, 0, lm.h / 2, 0);
    body.castShadow = true;
    g.add(body);

    const roof = this.mesh(new THREE.BoxGeometry(lm.w + 1.1, 0.5, lm.d + 1.1), lm.roof, 0, lm.h + 0.25, 0);
    roof.castShadow = true;
    g.add(roof);

    // Door on the plaza-facing wall.
    const facingSouth = lm.door.z > lm.z;
    const dz = facingSouth ? lm.d / 2 + 0.06 : -lm.d / 2 - 0.06;
    const door = this.mesh(new THREE.BoxGeometry(2.3, 3.0, 0.12), 0x33383f, 0, 1.5, dz);
    g.add(door);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 0.32),
      new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.85 }));
    glow.position.set(0, 3.2, dz + (facingSouth ? 0.02 : -0.02));
    glow.rotation.y = facingSouth ? 0 : Math.PI;
    g.add(glow);

    // Windows.
    for (const sx of [-1, 1]) {
      const w = this.mesh(new THREE.BoxGeometry(1.5, 1.1, 0.1), 0x9fd4e8, sx * (lm.w / 4 + 0.4), lm.h * 0.62, dz);
      w.material = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, emissive: 0x2d4c5c, emissiveIntensity: 0.4, roughness: 0.3 });
      g.add(w);
    }

    g.add(this.makeSign(lm.sign, 0, lm.h + 0.95, dz * 0.55, facingSouth ? 0 : Math.PI));

    g.position.set(lm.x, 0, lm.z);
    this.scene.add(g);
    this.colliders.push({ x: lm.x, z: lm.z, hw: lm.w / 2 + 0.3, hd: lm.d / 2 + 0.3, blocksCamera: true, h: lm.h });
  }

  makeSign(text, x, y, z, ry) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#14171f';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#ffd87a';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 62px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.position.set(x, y, z);
    sign.rotation.y = ry;
    return sign;
  }

  buildNpcs() {
    this.npcs = [];
    const spots = [
      { f: 'hornet', x: -8.5, z: 2.5, r: 2.2 },
      { f: 'mantis', x: 8.0, z: 3.0, r: -2.0 },
      { f: 'bulwark', x: -4.0, z: -9.0, r: 0.4 },
      { f: 'zephyr', x: 5.5, z: -8.0, r: -0.6 },
      { f: 'raven', x: 12.0, z: 10.0, r: 3.0 },
    ];
    for (const s of spots) {
      const bot = buildRobot(familyLoadout(s.f), { glow: 0xbfe9ff });
      bot.position.set(s.x, 0, s.z);
      bot.rotation.y = s.r;
      bot.scale.setScalar(0.95);
      this.scene.add(bot);
      this.npcs.push(bot);
      this.colliders.push({ x: s.x, z: s.z, hw: 0.6, hd: 0.6 });
    }
  }

  setLoadout(loadout) {
    if (this.avatar) this.scene.remove(this.avatar);
    this.avatar = buildRobot(loadout, { glow: 0x8ff0ff });
    this.avatar.position.set(this.player.pos.x, 0, this.player.pos.z);
    this.scene.add(this.avatar);
  }

  /* --------------------------------------------------------------- input */

  bindInput() {
    this.keys = new Set();
    this.pointerLocked = false;
    this.dragging = false;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') {
        if (this.nearby) { e.preventDefault(); this.onPrompt?.('enter', this.nearby); }
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseDown = () => {
      if (!this.pointerLocked) { this.dom.canvas.requestPointerLock?.(); this.dragging = true; }
    };
    this._onMouseUp = () => { this.dragging = false; };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked && !this.dragging) return;
      this.yaw -= (e.movementX ?? 0) * 0.0026;
      this.pitch = Math.max(-0.5, Math.min(0.35, this.pitch - (e.movementY ?? 0) * 0.002));
    };
    this._onLockChange = () => { this.pointerLocked = document.pointerLockElement === this.dom.canvas; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.dom.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  /* -------------------------------------------------------------- update */

  update(dt) {
    if (this.disposed) return;
    const k = this.keys;
    let fwd = 0, strafe = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = sin * fwd + cos * strafe;
    let mz = cos * fwd - sin * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') ? 1.7 : 1;
    const speed = this.player.speed * sprint;
    const p = this.player.pos;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;

    // Walls and buildings.
    p.x = Math.max(-WORLD.half, Math.min(WORLD.half, p.x));
    p.z = Math.max(-WORLD.half, Math.min(WORLD.half, p.z));
    const r = 0.6;
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const ox = c.hw + r - Math.abs(dx), oz = c.hd + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) p.x = c.x + Math.sign(dx || 1) * (c.hw + r);
        else p.z = c.z + Math.sign(dz || 1) * (c.hd + r);
      }
    }

    if (len > 0.01) this.player.facing = Math.atan2(mx, mz);
    this.avatar.position.set(p.x, 0, p.z);
    this.avatar.rotation.y = this.player.facing;
    const t = performance.now() / 1000;
    animateRobot(this.avatar, t, len > 0.01 ? Math.min(1, sprint * 0.7) : 0);
    for (const npc of this.npcs) animateRobot(npc, t + npc.position.x, 0);

    // Doorway prompt.
    let near = null, bestD = 4.2;
    for (const lm of LANDMARKS) {
      const d = Math.hypot(p.x - lm.door.x, p.z - lm.door.z);
      if (d < bestD) { bestD = d; near = lm; }
    }
    if (near !== this.nearby) {
      this.nearby = near;
      this.onPrompt?.('near', near);
    }

    // Camera, pulled in whenever a building would otherwise swallow it.
    const dist = 7.2;
    const { fx, fz, rx, rz } = basis(this.yaw);
    const focus = { x: p.x + rx * SHOULDER * 0.6, y: 1.5, z: p.z + rz * SHOULDER * 0.6 };
    const want = {
      x: focus.x - fx * Math.cos(this.pitch) * dist,
      y: 2.0 + Math.sin(-this.pitch) * dist,
      z: focus.z - fz * Math.cos(this.pitch) * dist,
    };
    const safe = resolveOcclusion(focus, want, this.cameraBlockers, 2.2);
    this.camera.position.lerp(new THREE.Vector3(safe.x, Math.max(1.0, safe.y), safe.z), Math.min(1, dt * 10));
    this.camera.lookAt(focus.x, 1.5, focus.z);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.dom.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    if (document.pointerLockElement === this.dom.canvas) document.exitPointerLock?.();
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material?.dispose?.();
      }
    });
  }
}
