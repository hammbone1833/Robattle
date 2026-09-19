/**
 * Procedural medabot models.
 *
 * Nothing here is loaded from a file -- every robot is assembled at runtime from the
 * same four parts the rules care about, so a medabot built in the garage looks exactly
 * like the one that walks into the arena, and swapping a part visibly changes the model.
 *
 * Crucially the visual hierarchy matches `core/rig.js` one-for-one: the head mesh sits
 * where the head hitbox sits. When a shot is credited to the right arm, the right arm is
 * what the player saw it strike.
 */

import * as THREE from '../../../vendor/three.module.js';
import { RIG } from '../core/rig.js';
import { FAMILIES } from '../data/parts.js';
import { getPart } from '../data/parts.js';

const matCache = new Map();
function mat(color, { metalness = 0.45, roughness = 0.5, emissive = 0x000000, emissiveIntensity = 1 } = {}) {
  const key = `${color}|${metalness}|${roughness}|${emissive}|${emissiveIntensity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity });
    matCache.set(key, m);
  }
  return m;
}

const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const sph = (r, m, seg = 14) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m);

function place(mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  return mesh;
}

/* ------------------------------------------------------------------- heads */

function buildHead(model, body, trim, glow) {
  const g = new THREE.Group();
  const shell = mat(body), dark = mat(trim, { metalness: 0.6, roughness: 0.4 });
  const lens = mat(glow, { emissive: glow, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.25 });

  switch (model) {
    case 'dome':
      g.add(place(sph(0.28, shell), 0, 0, 0));
      g.add(place(box(0.34, 0.10, 0.06, lens), 0, 0.02, 0.24));
      g.add(place(cyl(0.05, 0.05, 0.18, dark), 0, 0.30, 0));
      break;
    case 'crest':
      g.add(place(box(0.40, 0.30, 0.34, shell), 0, 0, 0));
      g.add(place(box(0.30, 0.07, 0.06, lens), 0, 0.03, 0.19));
      g.add(place(box(0.08, 0.30, 0.20, dark), 0, 0.24, -0.02, -0.3));
      g.add(place(box(0.05, 0.20, 0.14, dark), -0.16, 0.20, -0.02, -0.5));
      g.add(place(box(0.05, 0.20, 0.14, dark), 0.16, 0.20, -0.02, -0.5));
      break;
    case 'horn':
      g.add(place(box(0.42, 0.34, 0.36, shell), 0, 0, 0));
      g.add(place(box(0.26, 0.08, 0.06, lens), 0, 0.00, 0.20));
      g.add(place(cyl(0.01, 0.09, 0.42, dark, 8), 0, 0.26, 0.10, 0.45));
      break;
    case 'sniper':
      g.add(place(box(0.32, 0.30, 0.38, shell), 0, 0, 0));
      g.add(place(cyl(0.09, 0.09, 0.26, dark, 10), 0.10, 0.06, 0.16, Math.PI / 2));
      g.add(place(sph(0.07, lens), 0.10, 0.06, 0.30));
      g.add(place(box(0.18, 0.06, 0.05, lens), -0.08, 0.02, 0.20));
      break;
    default: // visor
      g.add(place(box(0.38, 0.32, 0.34, shell), 0, 0, 0));
      g.add(place(box(0.34, 0.11, 0.05, lens), 0, 0.02, 0.19));
      g.add(place(box(0.06, 0.16, 0.06, dark), -0.20, 0.20, 0, 0, 0, 0.35));
      g.add(place(box(0.06, 0.16, 0.06, dark), 0.20, 0.20, 0, 0, 0, -0.35));
      break;
  }
  return g;
}

/* -------------------------------------------------------------------- arms */

function buildArm(model, side, body, trim, glow) {
  const g = new THREE.Group();
  const shell = mat(body), dark = mat(trim, { metalness: 0.65, roughness: 0.35 });
  const lens = mat(glow, { emissive: glow, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.3 });
  const s = side; // +1 right, -1 left

  g.add(place(box(0.30, 0.28, 0.30, shell), 0, 0.26, 0));        // shoulder

  switch (model) {
    case 'gatling':
      g.add(place(box(0.26, 0.34, 0.26, shell), 0, -0.04, 0));
      g.add(place(cyl(0.11, 0.11, 0.42, dark), 0, -0.10, 0.30, Math.PI / 2));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        g.add(place(cyl(0.025, 0.025, 0.46, dark, 6), Math.cos(a) * 0.055, -0.10 + Math.sin(a) * 0.055, 0.32, Math.PI / 2));
      }
      break;
    case 'blade':
      g.add(place(box(0.22, 0.38, 0.22, shell), 0, -0.06, 0));
      g.add(place(box(0.06, 0.60, 0.16, lens), s * 0.02, -0.18, 0.34, -0.9));
      g.add(place(box(0.09, 0.22, 0.20, dark), 0, -0.04, 0.16));
      break;
    case 'shield':
      g.add(place(box(0.20, 0.34, 0.20, shell), 0, -0.06, 0));
      g.add(place(box(0.14, 0.76, 0.52, shell), s * 0.14, -0.06, 0.12));
      g.add(place(box(0.05, 0.50, 0.30, dark), s * 0.22, -0.06, 0.12));
      break;
    case 'claw':
      g.add(place(box(0.26, 0.32, 0.26, shell), 0, -0.04, 0));
      g.add(place(box(0.10, 0.12, 0.34, dark), 0, 0.06, 0.28, 0.25));
      g.add(place(box(0.10, 0.12, 0.34, dark), 0, -0.14, 0.28, -0.25));
      g.add(place(sph(0.07, lens), 0, -0.04, 0.20));
      break;
    case 'launcher':
      g.add(place(box(0.26, 0.30, 0.26, shell), 0, -0.04, 0));
      g.add(place(box(0.30, 0.30, 0.38, dark), 0, -0.02, 0.22));
      g.add(place(cyl(0.07, 0.07, 0.14, lens, 10), -0.07, 0.04, 0.42, Math.PI / 2));
      g.add(place(cyl(0.07, 0.07, 0.14, lens, 10), 0.07, 0.04, 0.42, Math.PI / 2));
      g.add(place(cyl(0.07, 0.07, 0.14, lens, 10), 0, -0.10, 0.42, Math.PI / 2));
      break;
    case 'repair':
      g.add(place(box(0.24, 0.32, 0.24, shell), 0, -0.05, 0));
      g.add(place(cyl(0.12, 0.09, 0.30, dark, 10), 0, -0.08, 0.28, Math.PI / 2));
      g.add(place(sph(0.11, lens), 0, -0.08, 0.44));
      break;
    default: // cannon
      g.add(place(box(0.24, 0.34, 0.24, shell), 0, -0.05, 0));
      g.add(place(cyl(0.10, 0.12, 0.50, dark), 0, -0.08, 0.30, Math.PI / 2));
      g.add(place(cyl(0.12, 0.12, 0.10, shell), 0, -0.08, 0.10, Math.PI / 2));
      g.add(place(sph(0.05, lens), 0, -0.08, 0.54));
      break;
  }
  return g;
}

/* -------------------------------------------------------------------- legs */

function buildLegs(model, body, trim, glow) {
  const g = new THREE.Group();
  const shell = mat(body), dark = mat(trim, { metalness: 0.6, roughness: 0.4 });
  const lens = mat(glow, { emissive: glow, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.3 });

  switch (model) {
    case 'wheel':
      g.add(place(box(0.50, 0.26, 0.40, shell), 0, 0.62, 0));
      for (const s of [-1, 1]) {
        g.add(place(cyl(0.34, 0.34, 0.22, dark, 16), s * 0.40, 0.36, 0, 0, 0, Math.PI / 2));
        g.add(place(cyl(0.14, 0.14, 0.24, lens, 10), s * 0.40, 0.36, 0, 0, 0, Math.PI / 2));
      }
      break;
    case 'tank':
      g.add(place(box(0.60, 0.26, 0.46, shell), 0, 0.72, 0));
      for (const s of [-1, 1]) {
        g.add(place(box(0.30, 0.44, 0.96, dark), s * 0.40, 0.30, 0));
        g.add(place(box(0.34, 0.16, 0.70, shell), s * 0.40, 0.44, 0));
      }
      break;
    case 'hover':
      g.add(place(box(0.52, 0.24, 0.44, shell), 0, 0.66, 0));
      g.add(place(cyl(0.46, 0.38, 0.20, dark, 18), 0, 0.40, 0));
      g.add(place(cyl(0.40, 0.30, 0.10, lens, 18), 0, 0.26, 0));
      for (const s of [-1, 1]) g.add(place(cyl(0.11, 0.11, 0.22, dark, 10), s * 0.42, 0.52, -0.16));
      break;
    case 'multileg':
      g.add(place(box(0.52, 0.28, 0.44, shell), 0, 0.68, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(place(box(0.10, 0.44, 0.10, dark), sx * 0.30, 0.46, sz * 0.22, 0, 0, sx * -0.35));
        g.add(place(box(0.09, 0.36, 0.09, shell), sx * 0.44, 0.18, sz * 0.24, 0, 0, sx * 0.30));
      }
      break;
    case 'flight':
      g.add(place(box(0.48, 0.30, 0.44, shell), 0, 0.68, 0));
      for (const s of [-1, 1]) {
        g.add(place(box(0.12, 0.52, 0.14, shell), s * 0.24, 0.40, 0));
        g.add(place(box(0.16, 0.20, 0.30, dark), s * 0.24, 0.12, 0.02));
        g.add(place(box(0.70, 0.06, 0.34, lens), s * 0.62, 0.66, -0.16, 0, s * 0.3, s * 0.35));
      }
      break;
    default: // biped
      g.add(place(box(0.50, 0.26, 0.42, shell), 0, 0.68, 0));
      for (const s of [-1, 1]) {
        g.add(place(box(0.20, 0.46, 0.22, shell), s * 0.22, 0.44, 0));
        g.add(place(box(0.17, 0.40, 0.19, dark), s * 0.22, 0.14, 0.02));
        g.add(place(box(0.24, 0.10, 0.36, dark), s * 0.22, 0.05, 0.06));
      }
      break;
  }
  return g;
}

/* ------------------------------------------------------------------- torso */

function buildTorso(body, trim, glow) {
  const g = new THREE.Group();
  const shell = mat(body), dark = mat(trim, { metalness: 0.6, roughness: 0.4 });
  const lens = mat(glow, { emissive: glow, emissiveIntensity: 1.1, metalness: 0.1, roughness: 0.2 });
  g.add(place(box(0.72, 0.74, 0.50, shell), 0, 0, 0));
  g.add(place(box(0.50, 0.20, 0.54, dark), 0, 0.26, 0));
  g.add(place(cyl(0.13, 0.13, 0.07, lens, 14), 0, 0.00, 0.27, Math.PI / 2));   // the medal
  g.add(place(box(0.20, 0.30, 0.06, dark), 0, -0.24, 0.26));
  g.add(place(cyl(0.11, 0.11, 0.22, dark, 10), 0, 0.44, 0));                   // neck
  return g;
}

/* --------------------------------------------------------------- assembly */

/**
 * Build a complete medabot.
 * @param {{head:string,rarm:string,larm:string,legs:string}} loadout part ids
 * @param {object} [opts] { family } forces a colour scheme, otherwise the legs decide
 * @returns {THREE.Group} with `userData.parts` mapping each slot to its group
 */
export function buildRobot(loadout, opts = {}) {
  const root = new THREE.Group();
  const parts = {};

  const legsPart = getPart(loadout.legs);
  const scheme = FAMILIES[opts.family ?? legsPart.family] ?? FAMILIES.cadet;
  const glow = opts.glow ?? 0x9ff4ff;

  const colorFor = (id) => {
    const p = getPart(id);
    const fam = FAMILIES[p.family] ?? scheme;
    return { body: fam.color, trim: fam.accent };
  };

  const hc = colorFor(loadout.head);
  const head = buildHead(getPart(loadout.head).model, hc.body, hc.trim, glow);
  head.position.set(...RIG.hitboxes.head.c);
  parts.head = head;

  const rc = colorFor(loadout.rarm);
  const rarm = buildArm(getPart(loadout.rarm).model, 1, rc.body, rc.trim, glow);
  rarm.position.set(...RIG.hitboxes.rarm.c);
  parts.rarm = rarm;

  const lc = colorFor(loadout.larm);
  const larm = buildArm(getPart(loadout.larm).model, -1, lc.body, lc.trim, glow);
  larm.position.set(...RIG.hitboxes.larm.c);
  larm.scale.x = -1;                       // mirror so the left arm is a left arm
  parts.larm = larm;

  const gc = colorFor(loadout.legs);
  const legs = buildLegs(legsPart.model, gc.body, gc.trim, glow);
  parts.legs = legs;

  const torso = buildTorso(scheme.color, scheme.accent, glow);
  torso.position.set(...RIG.hitboxes.torso.c);
  parts.torso = torso;

  for (const g of [legs, torso, head, rarm, larm]) {
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(g);
  }

  root.userData = {
    parts,
    loadout: { ...loadout },
    scheme,
    // Original materials are kept so damage tinting can be undone between battles.
    baseColors: new Map(),
  };
  return root;
}

/**
 * Tint a part toward scorched black as its armour drops.
 * @param {number} ratio 1 = pristine, 0 = destroyed
 */
export function setPartDamage(robot, slot, ratio) {
  const group = robot.userData.parts[slot];
  if (!group) return;
  const base = robot.userData.baseColors;
  const t = 1 - Math.max(0, Math.min(1, ratio));
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!base.has(o.uuid)) base.set(o.uuid, o.material);
    const original = base.get(o.uuid);
    if (t < 0.02) { o.material = original; return; }
    // Clone lazily -- only damaged meshes pay for their own material.
    if (o.material === original) o.material = original.clone();
    o.material.color.copy(original.color).lerp(new THREE.Color(0x1a1512), t * 0.75);
    o.material.emissiveIntensity = (original.emissiveIntensity ?? 1) * (1 - t * 0.85);
  });
}

/** Hide a wrecked part. The chassis keeps its stump so the silhouette still reads. */
export function setPartDestroyed(robot, slot, destroyed) {
  const group = robot.userData.parts[slot];
  if (!group) return;
  if (slot === 'legs') {
    // Legs never vanish -- a wrecked chassis collapses instead.
    group.position.y = destroyed ? -0.28 : 0;
    setPartDamage(robot, slot, destroyed ? 0 : 1);
    return;
  }
  group.visible = !destroyed;
}

export function resetRobotVisuals(robot) {
  for (const slot of ['head', 'rarm', 'larm', 'legs', 'torso']) {
    setPartDamage(robot, slot, 1);
    setPartDestroyed(robot, slot, false);
  }
}

/** Idle/walk animation. `speed01` is 0 standing still, 1 at full sprint. */
export function animateRobot(robot, time, speed01 = 0, options = {}) {
  const { parts } = robot.userData;
  const bob = Math.sin(time * (3 + speed01 * 9)) * (0.012 + speed01 * 0.05);
  if (parts.torso) parts.torso.position.y = RIG.hitboxes.torso.c[1] + bob;
  if (parts.head) parts.head.position.y = RIG.hitboxes.head.c[1] + bob * 0.8;
  const swing = Math.sin(time * (3 + speed01 * 9)) * speed01 * 0.35;
  if (parts.rarm && !options.rarmBusy) parts.rarm.rotation.x = swing;
  if (parts.larm && !options.larmBusy) parts.larm.rotation.x = -swing;
}
