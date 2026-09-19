/**
 * Opponent roster and arena themes.
 *
 * Opponents are fielded as three-robot teams with a designated leader. Wrecking the
 * leader's head ends the Robattle immediately, so the leader is both the prize and
 * the trap -- leaders are usually the sturdiest robot on the field.
 *
 * Every win pays out Rodo and lets the winner strip one part off the losing team,
 * which is why the roster doubles as the loot table.
 */
import { familyLoadout } from './parts.js';
export { ARENAS, getArena } from './arenas.js';

/** Build a loadout from a family, optionally swapping individual slots. */
function mix(family, overrides = {}) {
  return { ...familyLoadout(family), ...overrides };
}

function bot(name, medal, parts) {
  return { name, medal, parts };
}

export const OPPONENTS = [
  {
    id: 'yard-rats',
    name: 'Yard Rats',
    trainer: 'Pip & the Yard Rats',
    tier: 1,
    arena: 'schoolyard',
    reward: 220,
    blurb: 'Three hand-me-down chassis held together by tape and stubbornness. Everyone starts here.',
    leader: 0,
    bots: [
      bot('Scuff',   'beetle',   mix('cadet')),
      bot('Nickel',  'stag',     mix('cadet')),
      bot('Bolt',    'beetle',   mix('cadet')),
    ],
  },
  {
    id: 'sting-squad',
    name: 'Sting Squad',
    trainer: 'Mara Volt',
    tier: 1,
    arena: 'junkyard',
    reward: 340,
    blurb: 'Volume of fire over precision. They will not out-think you; they will out-shoot you.',
    leader: 0,
    bots: [
      bot('Yellowjacket', 'hornet', mix('hornet')),
      bot('Drone-Two',    'beetle', mix('hornet', { head: 'cadet-optic' })),
      bot('Drone-Three',  'beetle', mix('cadet',  { rarm: 'hornet-repeat' })),
    ],
  },
  {
    id: 'green-cut',
    name: 'The Green Cut',
    trainer: 'Sable Roh',
    tier: 2,
    arena: 'junkyard',
    reward: 480,
    blurb: 'Melee purists. If one of them reaches you, the part it reached is already gone.',
    leader: 1,
    bots: [
      bot('Reaper',  'stag',   mix('mantis')),
      bot('Sickle',  'mantis', mix('mantis', { larm: 'scarab-clamp' })),
      bot('Thorn',   'stag',   mix('mantis', { legs: 'scarab-roller' })),
    ],
  },
  {
    id: 'iron-wall',
    name: 'Iron Wall',
    trainer: 'Deacon Pell',
    tier: 2,
    arena: 'dome',
    reward: 620,
    blurb: 'A rolling siege line. Bring something that ignores defense or bring a lot of patience.',
    leader: 0,
    bots: [
      bot('Rampart',  'tortoise', mix('bulwark')),
      bot('Portcullis','tortoise', mix('bulwark', { head: 'cadet-optic' })),
      bot('Sallyport','beetle',   mix('bulwark', { rarm: 'hornet-repeat', legs: 'scarab-roller' })),
    ],
  },
  {
    id: 'blue-shift',
    name: 'Blue Shift',
    trainer: 'Kesi Lin',
    tier: 3,
    arena: 'rooftop',
    reward: 780,
    blurb: 'Hover frames with beam weapons. Dodging is not a plan against them -- armour is.',
    leader: 2,
    bots: [
      bot('Flicker', 'kraken', mix('zephyr')),
      bot('Shimmer', 'kraken', mix('zephyr', { rarm: 'scarab-drill' })),
      bot('Zenith',  'kraken', mix('zephyr', { head: 'titan-aegis' })),
    ],
  },
  {
    id: 'carrion-club',
    name: 'Carrion Club',
    trainer: 'Oss Vane',
    tier: 3,
    arena: 'dome',
    reward: 900,
    blurb: 'Marksmen. They will remove your legs first, then take their time with the rest.',
    leader: 0,
    bots: [
      bot('Gallow',   'raven',  mix('raven')),
      bot('Cinder',   'raven',  mix('raven', { larm: 'ignis-flamer' })),
      bot('Vigil',    'phoenix',mix('warden')),
    ],
  },
  {
    id: 'ashfall',
    name: 'Ashfall Battery',
    trainer: 'Brand Koll',
    tier: 4,
    arena: 'desert',
    reward: 1100,
    blurb: 'Artillery behind a repair platform. Kill the medic or watch your damage evaporate.',
    leader: 1,
    bots: [
      bot('Kiln',     'hornet',  mix('ignis')),
      bot('Furnace',  'dragon',  mix('ignis', { larm: 'titan-bastion', legs: 'titan-colossus' })),
      bot('Bellows',  'phoenix', mix('warden')),
    ],
  },
  {
    id: 'gold-standard',
    name: 'Gold Standard',
    trainer: 'Adaline Crest',
    tier: 4,
    arena: 'grand',
    reward: 1450,
    blurb: 'The reigning tournament team. No gimmick -- just better parts than yours.',
    leader: 0,
    bots: [
      bot('Sovereign', 'dragon', mix('titan')),
      bot('Regent',    'dragon', mix('titan', { rarm: 'ignis-howitzer', larm: 'nova-halo', legs: 'scarab-roller' })),
      bot('Herald',    'phoenix',mix('warden', { rarm: 'raven-rifle', legs: 'titan-colossus' })),
    ],
  },
  {
    id: 'project-nova',
    name: 'Project Nova',
    trainer: 'Unlisted',
    tier: 5,
    arena: 'grand',
    reward: 2400,
    blurb: 'Not on any registry. It is already in the arena when you arrive.',
    leader: 0,
    bots: [
      bot('NOVA',      'dragon', mix('nova')),
      bot('Satellite', 'raven',  mix('nova', { head: 'raven-scope', larm: 'raven-needle' })),
      bot('Corona',    'kraken', mix('nova', { rarm: 'titan-breaker', legs: 'titan-colossus' })),
    ],
  },
];

export function getOpponent(id) {
  const o = OPPONENTS.find((x) => x.id === id);
  if (!o) throw new Error(`unknown opponent: ${id}`);
  return o;
}

/** Every distinct part an opponent team is carrying -- the pool a winner loots from. */
export function lootPool(opponent) {
  const ids = new Set();
  for (const b of opponent.bots) for (const id of Object.values(b.parts)) ids.add(id);
  return [...ids];
}
