/**
 * Arena layouts.
 *
 * Every arena is a rectangle with solid cover scattered through it. Cover is not
 * decoration -- projectiles collide with it, so a slow siege chassis can trade its
 * mobility for a wall to shoot around, and a fast frame can break line of sight.
 *
 * `blocks` are [x, z, halfWidth, halfDepth, height].
 */

export const ARENAS = {
  schoolyard: {
    name: 'Academy Yard',
    blurb: 'Chalk lines on asphalt and a pair of equipment crates. Where everyone learns.',
    ground: 0x6f7a5e, grid: 0x8d9a78, sky: 0x8fb8d8, fog: 0xa8c4dc, accent: 0xd9e3c8,
    width: 40, depth: 30, fogDensity: 0.012,
    blocks: [
      [-8, -4, 1.6, 1.6, 2.2], [8, 4, 1.6, 1.6, 2.2],
      [0, 9, 3.2, 0.8, 1.4], [0, -9, 3.2, 0.8, 1.4],
    ],
  },
  junkyard: {
    name: 'Scrap Flats',
    blurb: 'Stacked wrecks and dead chassis. Half the cover used to be someone\'s medabot.',
    ground: 0x6b5f52, grid: 0x8a7a68, sky: 0xc2925c, fog: 0xc7a273, accent: 0xe0b578,
    width: 42, depth: 32, fogDensity: 0.016,
    blocks: [
      [-11, 0, 2.2, 3.4, 3.2], [11, 0, 2.2, 3.4, 3.2],
      [0, 0, 2.6, 2.6, 1.8], [-5, 10, 1.4, 1.4, 2.6], [5, -10, 1.4, 1.4, 2.6],
      [14, 9, 1.8, 1.8, 4.0], [-14, -9, 1.8, 1.8, 4.0],
    ],
  },
  dome: {
    name: 'Civic Dome',
    blurb: 'Sanctioned league ground. Retractable pillars, sponsor lighting, a real crowd.',
    ground: 0x3f4654, grid: 0x5d6779, sky: 0x1d2330, fog: 0x232b3a, accent: 0x63c6ff,
    width: 44, depth: 34, fogDensity: 0.014,
    blocks: [
      [-9, -7, 1.2, 1.2, 3.6], [9, -7, 1.2, 1.2, 3.6],
      [-9, 7, 1.2, 1.2, 3.6], [9, 7, 1.2, 1.2, 3.6],
      [0, 0, 3.0, 1.0, 1.6],
    ],
  },
  rooftop: {
    name: 'Tower Rooftop',
    blurb: 'Vents, aerials and a long drop. Unsanctioned, which is most of the appeal.',
    ground: 0x4a4f57, grid: 0x6c7380, sky: 0x2b3a5c, fog: 0x3a4d73, accent: 0xff9d5c,
    width: 38, depth: 28, fogDensity: 0.018,
    blocks: [
      [-7, 0, 1.0, 5.0, 2.4], [7, 0, 1.0, 5.0, 2.4],
      [0, 8, 2.4, 1.0, 1.2], [0, -8, 2.4, 1.0, 1.2],
      [13, 6, 1.6, 1.6, 3.0], [-13, -6, 1.6, 1.6, 3.0],
    ],
  },
  desert: {
    name: 'Salt Pan',
    blurb: 'Flat, bright and merciless. There is nowhere to hide out here, so stop trying.',
    ground: 0xbfb08c, grid: 0xd6c9a8, sky: 0xe4d7b4, fog: 0xded0ad, accent: 0xffffff,
    width: 48, depth: 36, fogDensity: 0.010,
    blocks: [[-13, 5, 2.0, 1.0, 1.2], [13, -5, 2.0, 1.0, 1.2]],
  },
  grand: {
    name: 'Grand Colosseum',
    blurb: 'The championship floor. Everything you do here is on the broadcast.',
    ground: 0x2e3140, grid: 0x4c5166, sky: 0x11131c, fog: 0x171a26, accent: 0xffd87a,
    width: 46, depth: 36, fogDensity: 0.013,
    blocks: [
      [-10, -8, 1.4, 1.4, 3.8], [10, 8, 1.4, 1.4, 3.8],
      [-10, 8, 1.4, 1.4, 3.8], [10, -8, 1.4, 1.4, 3.8],
      [0, 0, 1.8, 1.8, 2.4], [0, 12, 4.0, 0.9, 1.5], [0, -12, 4.0, 0.9, 1.5],
    ],
  },
  gym: {
    name: 'Training Hall',
    blurb: 'Padded floor, patient dummies, no prize money and no consequences.',
    ground: 0x5a5f6e, grid: 0x7b8294, sky: 0x2a3040, fog: 0x333a4c, accent: 0x7de2a8,
    width: 34, depth: 26, fogDensity: 0.012,
    blocks: [[-6, 0, 1.0, 1.0, 2.0], [6, 0, 1.0, 1.0, 2.0]],
  },
};

export function getArena(id) {
  return ARENAS[id] ?? ARENAS.dome;
}

/** Team spawn points: side 0 starts south, side 1 starts north, spread across the width. */
export function spawnPoints(arena, side, count) {
  const z = (side === 0 ? -1 : 1) * (arena.depth / 2 - 4);
  const spread = Math.min(arena.width - 8, 4 + count * 3.2);
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push({ x: (t - 0.5) * spread, z, facing: side === 0 ? 0 : Math.PI });
  }
  return out;
}

/** True if the segment from a to b is interrupted by cover. */
export function blockedByCover(arena, ax, ay, az, bx, by, bz) {
  const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.6));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    for (const [bxc, bzc, hw, hd, h] of arena.blocks) {
      if (y <= h && Math.abs(x - bxc) <= hw && Math.abs(z - bzc) <= hd) return true;
    }
  }
  return false;
}
