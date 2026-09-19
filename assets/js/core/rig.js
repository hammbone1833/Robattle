/**
 * The shared robot rig.
 *
 * One set of numbers describes a medabot's body, and both the renderer and the combat
 * simulation read from it. That is what makes aiming honest: the head you can see on
 * screen is exactly the sphere the simulation tests a bullet against.
 *
 * Coordinates are local to the robot -- +Z is the direction it faces, +Y is up, and the
 * feet sit at y = 0. `h` on a box is its half-extent.
 */

export const RIG = {
  height: 2.0,

  /**
   * Damageable volumes. A robot has only four parts, but it has five volumes: shots that
   * land on the torso are credited to the legs, because the legs part is the chassis the
   * torso is bolted to. Aim high for the head, wide for an arm, low for the chassis.
   */
  hitboxes: {
    head:  { kind: 'sphere', c: [0, 1.78, 0], r: 0.30, part: 'head' },
    rarm:  { kind: 'box', c: [0.70, 1.16, 0], h: [0.23, 0.40, 0.23], part: 'rarm' },
    larm:  { kind: 'box', c: [-0.70, 1.16, 0], h: [0.23, 0.40, 0.23], part: 'larm' },
    torso: { kind: 'box', c: [0, 1.20, 0], h: [0.40, 0.40, 0.28], part: 'legs' },
    legs:  { kind: 'box', c: [0, 0.48, 0], h: [0.42, 0.48, 0.36], part: 'legs' },
  },

  /** Where each weapon's fire originates, in local space. */
  muzzles: {
    head: [0, 1.80, 0.34],
    rarm: [0.72, 1.16, 0.48],
    larm: [-0.72, 1.16, 0.48],
  },

  /** Rough body radius used for collision between robots and against walls. */
  bodyRadius: 0.62,
};

export const HITBOX_ORDER = ['head', 'rarm', 'larm', 'torso', 'legs'];

/** World point -> robot local space (undo the robot's position and Y rotation). */
export function toLocal(bot, wx, wy, wz, out = {}) {
  const dx = wx - bot.pos.x;
  const dz = wz - bot.pos.z;
  // Inverse of the rotation applied in toWorld(): [[c, -s], [s, c]].
  const c = Math.cos(bot.facing), s = Math.sin(bot.facing);
  out.x = dx * c - dz * s;
  out.y = wy;
  out.z = dx * s + dz * c;
  return out;
}

/** Robot local point -> world space. */
export function toWorld(bot, lx, ly, lz, out = {}) {
  const c = Math.cos(bot.facing), s = Math.sin(bot.facing);
  out.x = bot.pos.x + lx * c + lz * s;
  out.y = ly;
  out.z = bot.pos.z - lx * s + lz * c;
  return out;
}

const _p = {};

/**
 * Which part does a world-space point land on, if any?
 * `pad` widens every volume, which is how a projectile's own radius is accounted for.
 * Returns the part slot ('head' | 'rarm' | 'larm' | 'legs') or null.
 */
export function hitPartAt(bot, wx, wy, wz, pad = 0) {
  toLocal(bot, wx, wy, wz, _p);
  for (const key of HITBOX_ORDER) {
    const hb = RIG.hitboxes[key];
    // A destroyed part keeps its volume -- wreckage still blocks shots -- but rounds that
    // land on it are wasted, which is what makes stripping a part a real commitment.
    if (hb.kind === 'sphere') {
      const dx = _p.x - hb.c[0], dy = _p.y - hb.c[1], dz = _p.z - hb.c[2];
      const r = hb.r + pad;
      if (dx * dx + dy * dy + dz * dz <= r * r) return hb.part;
    } else {
      if (Math.abs(_p.x - hb.c[0]) <= hb.h[0] + pad &&
          Math.abs(_p.y - hb.c[1]) <= hb.h[1] + pad &&
          Math.abs(_p.z - hb.c[2]) <= hb.h[2] + pad) return hb.part;
    }
  }
  return null;
}

/** World-space muzzle position for a weapon slot. */
export function muzzleOf(bot, slot, out = {}) {
  const m = RIG.muzzles[slot] ?? RIG.muzzles.rarm;
  return toWorld(bot, m[0], m[1], m[2], out);
}

/** World-space centre of a part, for aiming and for floating damage numbers. */
export function partCenter(bot, slot, out = {}) {
  const hb = RIG.hitboxes[slot === 'legs' ? 'legs' : slot];
  const c = hb ? hb.c : [0, 1.2, 0];
  return toWorld(bot, c[0], c[1], c[2], out);
}
