/**
 * Battle effects: tracers, beams, muzzle flashes, impact sparks, wreck explosions and
 * floating damage numbers.
 *
 * Everything is pooled. A Robattle can throw a few hundred short-lived objects per
 * second, and allocating a mesh per spark would drop frames on the exact frames that
 * matter most, so the pools are built once and recycled.
 */

import * as THREE from '../../../vendor/three.module.js';

const TMP = new THREE.Vector3();

export class Fx {
  constructor(scene, overlayEl, quality = { sparkPool: 260, tracerCount: 160 }) {
    this.scene = scene;
    this.overlay = overlayEl;
    this.quality = quality;
    this.time = 0;

    // --- tracers: one instanced mesh, matched to live projectiles every frame
    this.tracerGeo = new THREE.CapsuleGeometry(0.075, 0.42, 3, 6);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    this.maxTracers = quality.tracerCount;
    this.tracers = new THREE.InstancedMesh(this.tracerGeo, this.tracerMat, this.maxTracers);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    scene.add(this.tracers);
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._scale = new THREE.Vector3(1, 1, 1);

    // --- sparks
    this.sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    this.sparks = [];
    this.sparkPool = [];
    for (let i = 0; i < quality.sparkPool; i++) {
      const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffcc66 }));
      m.visible = false;
      scene.add(m);
      this.sparkPool.push(m);
    }

    // --- beams
    this.beams = [];
    this.beamPool = [];
    const beamGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 6, 1, true);
    beamGeo.translate(0, 0.5, 0);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0x9ff4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      scene.add(m);
      this.beamPool.push(m);
    }

    // --- flashes (muzzle glow / explosion cores)
    this.flashes = [];
    this.flashPool = [];
    const flashGeo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({
        color: 0xffd08a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      scene.add(m);
      this.flashPool.push(m);
    }

    // --- floating numbers, as DOM so they stay crisp at any resolution
    this.labels = [];
    this.shake = 0;
  }

  /* ------------------------------------------------------------- tracers */

  syncProjectiles(projectiles) {
    const n = Math.min(projectiles.length, this.maxTracers);
    for (let i = 0; i < n; i++) {
      const p = projectiles[i];
      TMP.set(p.vx, p.vy, p.vz).normalize();
      this._q.setFromUnitVectors(this._up, TMP);
      const len = p.actionType === 'SNIPE' ? 2.2 : 1;
      this._scale.set(1, len, 1);
      this._m4.compose(new THREE.Vector3(p.x, p.y, p.z), this._q, this._scale);
      this.tracers.setMatrixAt(i, this._m4);
    }
    this.tracers.count = n;
    if (n > 0) this.tracers.instanceMatrix.needsUpdate = true;
  }

  /* -------------------------------------------------------------- spawns */

  spark(x, y, z, count = 8, color = 0xffcc66, power = 4) {
    for (let i = 0; i < count; i++) {
      const m = this.sparkPool.pop();
      if (!m) return;
      m.position.set(x, y, z);
      m.material.color.setHex(color);
      m.scale.setScalar(1);
      m.visible = true;
      this.sparks.push({
        mesh: m, life: 0.28 + Math.random() * 0.35,
        max: 0.6,
        vx: (Math.random() - 0.5) * power,
        vy: Math.random() * power * 0.8 + 0.6,
        vz: (Math.random() - 0.5) * power,
      });
    }
  }

  flash(x, y, z, size = 0.7, color = 0xffd08a, life = 0.16) {
    const m = this.flashPool.pop();
    if (!m) return;
    m.position.set(x, y, z);
    m.scale.setScalar(size);
    m.material.color.setHex(color);
    m.material.opacity = 1;
    m.visible = true;
    this.flashes.push({ mesh: m, life, max: life, size });
  }

  beam(from, to, color = 0x9ff4ff) {
    const m = this.beamPool.pop();
    if (!m) return;
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const dir = b.clone().sub(a);
    const len = dir.length() || 0.01;
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(this._up, dir.normalize());
    m.scale.set(1, len, 1);
    m.material.color.setHex(color);
    m.material.opacity = 0.95;
    m.visible = true;
    this.beams.push({ mesh: m, life: 0.14, max: 0.14 });
    this.flash(to.x, to.y, to.z, 0.5, color, 0.14);
  }

  explosion(x, y, z, size = 1.4, color = 0xffa04a) {
    this.flash(x, y, z, size, color, 0.3);
    this.spark(x, y, z, 18, color, 7);
    this.shake = Math.max(this.shake, 0.5);
  }

  /** A floating damage number anchored to a world position. */
  label(text, world, kind = 'dmg') {
    if (!this.overlay) return;
    const el = document.createElement('div');
    el.className = `fx-label fx-${kind}`;
    el.textContent = text;
    this.overlay.appendChild(el);
    this.labels.push({ el, world: { ...world }, life: 1.05, max: 1.05, rise: 0 });
  }

  /* -------------------------------------------------------------- update */

  update(dt, camera) {
    // sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vy -= 16 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      if (s.mesh.position.y < 0.05) { s.mesh.position.y = 0.05; s.vy *= -0.3; s.vx *= 0.6; s.vz *= 0.6; }
      s.mesh.scale.setScalar(Math.max(0.05, s.life / s.max));
      if (s.life <= 0) {
        s.mesh.visible = false;
        this.sparkPool.push(s.mesh);
        this.sparks.splice(i, 1);
      }
    }
    // beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      b.mesh.material.opacity = Math.max(0, b.life / b.max) * 0.95;
      if (b.life <= 0) { b.mesh.visible = false; this.beamPool.push(b.mesh); this.beams.splice(i, 1); }
    }
    // flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = Math.max(0, f.life / f.max);
      f.mesh.material.opacity = t;
      f.mesh.scale.setScalar(f.size * (1 + (1 - t) * 1.4));
      if (f.life <= 0) { f.mesh.visible = false; this.flashPool.push(f.mesh); this.flashes.splice(i, 1); }
    }
    // damage numbers
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.life -= dt;
      l.rise += dt * 1.1;
      if (l.life <= 0) { l.el.remove(); this.labels.splice(i, 1); continue; }
      TMP.set(l.world.x, l.world.y + l.rise, l.world.z).project(camera);
      if (TMP.z > 1) { l.el.style.display = 'none'; continue; }
      l.el.style.display = '';
      l.el.style.left = `${(TMP.x * 0.5 + 0.5) * 100}%`;
      l.el.style.top = `${(-TMP.y * 0.5 + 0.5) * 100}%`;
      l.el.style.opacity = String(Math.min(1, l.life / l.max * 1.6));
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  clearLabels() {
    for (const l of this.labels) l.el.remove();
    this.labels.length = 0;
  }

  dispose() {
    this.clearLabels();
  }
}
