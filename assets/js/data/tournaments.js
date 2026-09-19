/**
 * Tournament ladders.
 *
 * A cup is a run of consecutive Robattles, an entry fee, and a prize that only pays out
 * if you take the whole thing. Damage carries from one round to the next -- between
 * rounds you get rough field repairs, not a rebuild -- so a cup tests whether a loadout
 * can last, not just whether it can win once. Losing costs you the entry fee and nothing
 * else, so a cup you are not ready for is a survivable mistake.
 */

export const CUPS = [
  {
    id: 'rookie',
    name: 'Rookie Cup',
    tier: 1,
    entry: 0,
    blurb: 'Open to anyone with three working medabots. No entry fee, modest purse.',
    rounds: ['yard-rats', 'sting-squad'],
    prize: { rodo: 600, part: 'hornet-repeat', rating: 40 },
  },
  {
    id: 'circuit',
    name: 'Circuit Cup',
    tier: 2,
    entry: 250,
    blurb: 'The regional circuit. Three rounds, and the second one bites.',
    rounds: ['sting-squad', 'green-cut', 'iron-wall'],
    prize: { rodo: 1500, part: 'scarab-drill', rating: 70 },
    requires: 'rookie',
  },
  {
    id: 'sanctioned',
    name: 'Sanctioned League',
    tier: 3,
    entry: 600,
    blurb: 'Licensed teams only. Beam weapons and marksmen -- armour matters here.',
    rounds: ['iron-wall', 'blue-shift', 'carrion-club'],
    prize: { rodo: 3000, part: 'raven-rifle', rating: 110 },
    requires: 'circuit',
  },
  {
    id: 'championship',
    name: 'National Championship',
    tier: 4,
    entry: 1200,
    blurb: 'Four rounds against the best teams on the register. Bring your real loadout.',
    rounds: ['carrion-club', 'ashfall', 'gold-standard'],
    prize: { rodo: 6500, part: 'titan-breaker', rating: 180 },
    requires: 'sanctioned',
  },
  {
    id: 'grand-prix',
    name: 'Grand Prix',
    tier: 5,
    entry: 2500,
    blurb: 'Invitational. The last team on the card is not on any register at all.',
    rounds: ['gold-standard', 'blue-shift', 'ashfall', 'project-nova'],
    prize: { rodo: 15000, part: 'nova-lance', rating: 300 },
    requires: 'championship',
  },
];

export function getCup(id) {
  const c = CUPS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown cup: ${id}`);
  return c;
}

/** A cup is locked until the one before it has been won at least once. */
export function cupUnlocked(cup, completed = []) {
  return !cup.requires || completed.includes(cup.requires);
}
