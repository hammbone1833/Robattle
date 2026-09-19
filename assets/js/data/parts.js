/**
 * Part catalogue.
 *
 * Every robot is assembled from four parts -- HEAD, RIGHT ARM, LEFT ARM and LEGS --
 * plus a Medal that acts as its brain. Parts are grouped into "families"; a family
 * shares a silhouette and a colour, so a fully matched robot reads as one design.
 *
 * Stat meanings (mirrors the classic charge/cooldown robot-battler model):
 *   armor     hit points of that individual part; at 0 the part is destroyed
 *   power     base damage of the part's action
 *   success   accuracy, weighed against the target's legs evasion
 *   charge    time from "command chosen" to "action fires" (lower is faster)
 *   cooldown  time from "action fired" back to "ready for a new command"
 *   uses      head parts only -- a limited number of shots per battle (0 = unlimited)
 *
 * Legs instead provide propulsion (charge speed), mobility (cooldown speed),
 * evasion and defense for the whole robot.
 */

export const FAMILIES = {
  cadet:   { name: 'Cadet',   color: 0x8d97a6, accent: 0x5a6675, tier: 0, blurb: 'Academy-issue training chassis. Cheap, honest, unremarkable.' },
  hornet:  { name: 'Hornet',  color: 0xf2b230, accent: 0x3c3428, tier: 1, blurb: 'Rapid-fire skirmisher built around sustained suppressing fire.' },
  mantis:  { name: 'Mantis',  color: 0x57c15a, accent: 0x26402a, tier: 1, blurb: 'Close-quarters duellist. Gets in, cuts deep, gets out.' },
  bulwark: { name: 'Bulwark', color: 0x4f7fb5, accent: 0x243a52, tier: 2, blurb: 'Walking bunker. Soaks punishment that would fell three chassis.' },
  zephyr:  { name: 'Zephyr',  color: 0x46d8d0, accent: 0x1d4a4d, tier: 2, blurb: 'Hover frame tuned to act twice before a heavy bot acts once.' },
  scarab:  { name: 'Scarab',  color: 0x9b6ad6, accent: 0x38264f, tier: 2, blurb: 'Balanced all-rounder with no obvious seam to exploit.' },
  warden:  { name: 'Warden',  color: 0xe8e4dc, accent: 0x6e6a63, tier: 3, blurb: 'Field-repair platform. Keeps a wounded team standing.' },
  raven:   { name: 'Raven',   color: 0x6d5fa8, accent: 0x241f3a, tier: 3, blurb: 'Marksman chassis. Picks a part and removes it from the battle.' },
  ignis:   { name: 'Ignis',   color: 0xe0562f, accent: 0x4a1b12, tier: 3, blurb: 'Siege artillery. Slow to speak, impossible to ignore.' },
  titan:   { name: 'Titan',   color: 0xc08b3e, accent: 0x453017, tier: 4, blurb: 'Tournament-grade heavy. Armour and output with no trade-off.' },
  nova:    { name: 'Nova',    color: 0xf5f0c8, accent: 0x8a7a2e, tier: 5, blurb: 'Prototype. Officially it does not exist.' },
  relic:   { name: 'Relic',   color: 0x63e0c8, accent: 0x1f5f55, tier: 5, blurb: 'Recovered event hardware. Not sold anywhere, at any price.' },
};

/** Action types and how they behave in battle. */
export const ACTION_TYPES = {
  SHOOT:  { label: 'Shoot',   blurb: 'Ranged fire from the action line.',                    ranged: true  },
  SNIPE:  { label: 'Snipe',   blurb: 'Slow, highly accurate single shot.',                   ranged: true  },
  LASER:  { label: 'Laser',   blurb: 'Beam weapon -- cannot be dodged.',                     ranged: true  },
  MELEE:  { label: 'Strike',  blurb: 'Closes to the target and hits hard.',                  ranged: false },
  BREAK:  { label: 'Break',   blurb: 'Melee blow that ignores the target\'s defense.',       ranged: false },
  REPAIR: { label: 'Repair',  blurb: 'Restores armour to a damaged friendly part.',          ranged: true, support: true },
  GUARD:  { label: 'Guard',   blurb: 'Shields the most fragile friendly part for a while.',  ranged: true, support: true },
};

/* ------------------------------------------------------------------ heads */
/* id | name | family | model | type | armor power success charge cooldown uses | cost */
const HEAD_ROWS = [
  ['cadet-optic',   'Cadet Optic',    'cadet',   'visor',  'SHOOT',  30, 28, 58, 26, 30, 4,  120],
  ['hornet-sight',  'Hornet Sight',   'hornet',  'visor',  'SHOOT',  36, 36, 66, 22, 26, 5,  340],
  ['mantis-crest',  'Mantis Crest',   'mantis',  'crest',  'MELEE',  34, 44, 60, 26, 46, 4,  360],
  ['bulwark-dome',  'Bulwark Dome',   'bulwark', 'dome',   'GUARD',  62, 34, 72, 30, 38, 4,  520],
  ['zephyr-lens',   'Zephyr Lens',    'zephyr',  'visor',  'LASER',  32, 38, 99, 20, 24, 3,  560],
  ['scarab-horn',   'Scarab Horn',    'scarab',  'horn',   'BREAK',  44, 48, 62, 28, 44, 4,  540],
  ['warden-halo',   'Warden Halo',    'warden',  'dome',   'REPAIR', 40, 46, 88, 26, 30, 5,  700],
  ['raven-scope',   'Raven Scope',    'raven',   'sniper', 'SNIPE',  34, 62, 84, 40, 38, 3,  720],
  ['ignis-mortar',  'Ignis Mortar',   'ignis',   'horn',   'SHOOT',  48, 70, 58, 46, 44, 2,  760],
  ['titan-aegis',   'Titan Aegis',    'titan',   'dome',   'LASER',  66, 64, 99, 34, 36, 3, 1180],
  ['nova-eye',      'Nova Eye',       'nova',    'sniper', 'SNIPE',  52, 88, 92, 38, 34, 3, 1900],
];

/* --------------------------------------------------------------- arms (R) */
const RARM_ROWS = [
  ['cadet-pistol',  'Cadet Pistol',   'cadet',   'cannon',  'SHOOT',  28, 24, 60, 22, 26, 0,  110],
  ['hornet-repeat', 'Hornet Repeater','hornet',  'gatling', 'SHOOT',  34, 30, 70, 16, 20, 0,  330],
  ['mantis-scythe', 'Mantis Scythe',  'mantis',  'blade',   'MELEE',  32, 46, 64, 22, 44, 0,  380],
  ['bulwark-slug',  'Bulwark Slugger','bulwark', 'cannon',  'SHOOT',  58, 42, 56, 32, 36, 0,  500],
  ['zephyr-ray',    'Zephyr Ray',     'zephyr',  'launcher','LASER',  30, 32, 99, 18, 22, 0,  540],
  ['scarab-drill',  'Scarab Drill',   'scarab',  'claw',    'BREAK',  42, 50, 62, 26, 42, 0,  560],
  ['warden-mender', 'Warden Mender',  'warden',  'repair',  'REPAIR', 36, 40, 90, 22, 28, 0,  660],
  ['raven-rifle',   'Raven Rifle',    'raven',   'cannon',  'SNIPE',  32, 58, 86, 34, 34, 0,  700],
  ['ignis-howitzer','Ignis Howitzer', 'ignis',   'launcher','SHOOT',  46, 74, 54, 44, 46, 0,  780],
  ['titan-breaker', 'Titan Breaker',  'titan',   'claw',    'BREAK',  64, 78, 66, 36, 50, 0, 1200],
  ['nova-lance',    'Nova Lance',     'nova',    'blade',   'MELEE',  50, 92, 78, 30, 48, 0, 1950],
];

/* --------------------------------------------------------------- arms (L) */
const LARM_ROWS = [
  ['cadet-shield',  'Cadet Shield',   'cadet',   'shield',  'GUARD',  34, 20, 66, 24, 28, 0,  110],
  ['hornet-stinger','Hornet Stinger', 'hornet',  'launcher','SHOOT',  32, 34, 64, 20, 24, 0,  330],
  ['mantis-sickle', 'Mantis Sickle',  'mantis',  'blade',   'BREAK',  30, 42, 66, 20, 40, 0,  380],
  ['bulwark-tower', 'Bulwark Tower',  'bulwark', 'shield',  'GUARD',  70, 26, 76, 28, 34, 0,  520],
  ['zephyr-blink',  'Zephyr Blink',   'zephyr',  'launcher','LASER',  28, 30, 99, 16, 20, 0,  520],
  ['scarab-clamp',  'Scarab Clamp',   'scarab',  'claw',    'MELEE',  44, 46, 64, 24, 42, 0,  560],
  ['warden-brace',  'Warden Brace',   'warden',  'repair',  'REPAIR', 38, 44, 92, 24, 26, 0,  680],
  ['raven-needle',  'Raven Needle',   'raven',   'cannon',  'SNIPE',  30, 54, 88, 30, 32, 0,  700],
  ['ignis-flamer',  'Ignis Flamer',   'ignis',   'gatling', 'SHOOT',  44, 56, 62, 34, 40, 0,  740],
  ['titan-bastion', 'Titan Bastion',  'titan',   'shield',  'GUARD',  78, 40, 80, 30, 34, 0, 1150],
  ['nova-halo',     'Nova Halo',      'nova',    'launcher','LASER',  48, 80, 99, 28, 30, 0, 1900],
];

/* ------------------------------------------------------------------- legs */
/* id | name | family | model | armor propulsion mobility evasion defense | cost */
const LEG_ROWS = [
  ['cadet-strider', 'Cadet Strider',  'cadet',   'biped',    48,  34, 34, 30, 26,  120],
  ['hornet-skip',   'Hornet Skipper', 'hornet',  'biped',    52,  52, 50, 46, 28,  350],
  ['mantis-sprint', 'Mantis Sprinter','mantis',  'multileg', 50,  58, 48, 52, 24,  380],
  ['bulwark-tread', 'Bulwark Treads', 'bulwark', 'tank',    116,  22, 26, 12, 62,  540],
  ['zephyr-float',  'Zephyr Float',   'zephyr',  'hover',    46,  74, 70, 62, 20,  600],
  ['scarab-roller', 'Scarab Roller',  'scarab',  'wheel',    70,  54, 56, 40, 40,  560],
  ['warden-stilts', 'Warden Stilts',  'warden',  'biped',    64,  46, 52, 42, 44,  660],
  ['raven-perch',   'Raven Perch',    'raven',   'multileg', 56,  40, 44, 56, 34,  700],
  ['ignis-anchor',  'Ignis Anchor',   'ignis',   'tank',    104,  28, 30, 16, 58,  720],
  ['titan-colossus','Titan Colossus', 'titan',   'tank',    132,  38, 40, 22, 70, 1200],
  ['nova-drive',    'Nova Drive',     'nova',    'flight',   78,  80, 76, 66, 46, 1950],
];

/**
 * Armour in the tables above is written on a compact design scale so the rows stay
 * readable and comparable. Battle armour is this multiple of it, which is what keeps
 * a part alive for several exchanges instead of evaporating to the first clean hit.
 *
 * Heads are scaled far harder than anything else on purpose: a wrecked head ends that
 * robot outright, and a wrecked *leader* head ends the whole Robattle. If a head cost
 * the same as an arm, every battle would collapse into three robots shooting one skull
 * and finishing inside ten seconds. Stripping the weapons first has to be the sane
 * opening, with the head as the closer.
 */
export const ARMOR_SCALE = { head: 6, rarm: 3.4, larm: 3.4, legs: 3.8 };

/* ------------------------------------------------------- event-only parts */
/*
 * These are never sold. They are the rewards for the rotating weekly and monthly
 * events, which is the only way they enter a player's inventory -- so a Relic part in
 * someone's garage is a record of an event they actually turned up for.
 */
const SPECIAL_ROWS = {
  head: [
    ['relic-oracle',  'Relic Oracle',   'relic', 'sniper', 'SNIPE',  58, 82, 94, 30, 30, 4, 0],
    ['relic-crown',   'Relic Crown',    'relic', 'dome',   'LASER',  70, 66, 99, 28, 32, 4, 0],
  ],
  rarm: [
    ['relic-judgment','Relic Judgment', 'relic', 'cannon', 'SHOOT',  54, 84, 76, 24, 30, 0, 0],
    ['relic-fang',    'Relic Fang',     'relic', 'blade',  'BREAK',  52, 88, 74, 26, 44, 0, 0],
  ],
  larm: [
    ['relic-veil',    'Relic Veil',     'relic', 'shield', 'GUARD',  76, 44, 86, 26, 30, 0, 0],
    ['relic-echo',    'Relic Echo',     'relic', 'launcher','LASER', 50, 74, 99, 22, 28, 0, 0],
  ],
};
const SPECIAL_LEGS = [
  ['relic-stride',  'Relic Stride',   'relic', 'flight',   84, 76, 74, 64, 50, 0],
  ['relic-bastion', 'Relic Bastion',  'relic', 'tank',    124, 46, 48, 28, 68, 0],
];

function tierOf(family) { return FAMILIES[family].tier; }

function makeWeapon(slot, row) {
  const [id, name, family, model, type, armor, power, success, charge, cooldown, uses, cost] = row;
  return {
    id, name, family, model, slot, type,
    armor: Math.round(armor * ARMOR_SCALE[slot]), power, success, charge, cooldown, uses,
    cost, tier: tierOf(family),
  };
}

function makeLegs(row) {
  const [id, name, family, model, armor, propulsion, mobility, evasion, defense, cost] = row;
  return {
    id, name, family, model, slot: 'legs', type: 'LEGS',
    armor: Math.round(armor * ARMOR_SCALE.legs), propulsion, mobility, evasion, defense,
    cost, tier: tierOf(family),
  };
}

export const PARTS = {};
for (const row of HEAD_ROWS) { const p = makeWeapon('head', row); PARTS[p.id] = p; }
for (const row of RARM_ROWS) { const p = makeWeapon('rarm', row); PARTS[p.id] = p; }
for (const row of LARM_ROWS) { const p = makeWeapon('larm', row); PARTS[p.id] = p; }
for (const row of LEG_ROWS)  { const p = makeLegs(row);          PARTS[p.id] = p; }
for (const [slot, rows] of Object.entries(SPECIAL_ROWS)) {
  for (const row of rows) { const p = makeWeapon(slot, row); p.special = true; PARTS[p.id] = p; }
}
for (const row of SPECIAL_LEGS) { const p = makeLegs(row); p.special = true; PARTS[p.id] = p; }

export const SLOTS = ['head', 'rarm', 'larm', 'legs'];
export const SLOT_LABELS = { head: 'Head', rarm: 'Right Arm', larm: 'Left Arm', legs: 'Legs' };

export function getPart(id) {
  const part = PARTS[id];
  if (!part) throw new Error(`unknown part: ${id}`);
  return part;
}

export function partsForSlot(slot) {
  return Object.values(PARTS).filter((p) => p.slot === slot);
}

/** Parts a shop is allowed to stock -- event rewards are excluded on purpose. */
export function purchasableParts() {
  return Object.values(PARTS).filter((p) => !p.special);
}

export function specialParts() {
  return Object.values(PARTS).filter((p) => p.special);
}

/** The four parts of a family, as a loadout object. */
export function familyLoadout(family) {
  const set = {};
  for (const slot of SLOTS) {
    const part = Object.values(PARTS).find((p) => p.family === family && p.slot === slot);
    if (part) set[slot] = part.id;
  }
  return set;
}
