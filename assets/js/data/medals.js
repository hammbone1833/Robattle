/**
 * Medals -- the "brain" slotted into a robot.
 *
 * A medal grants a skill level (1-10) per action type, which raises both the
 * accuracy and the damage of parts of that type. Medals also learn: every action
 * a medal performs banks experience in that type, and enough experience raises
 * the effective skill level (capped at +3 over the printed value).
 *
 * Each medal carries one Medaforce -- a finishing move that unlocks only once the
 * robot has absorbed enough punishment to fill its medaforce gauge.
 */

export const MEDAFORCE = {
  BARRAGE: { name: 'Scatter Barrage', blurb: 'Light damage to every surviving part of one enemy.', power: 30 },
  PIERCE:  { name: 'Piercing Fang',   blurb: 'Enormous damage to a single part. Nothing blocks it.', power: 150 },
  MEND:    { name: 'Restoration',     blurb: 'Repairs a large amount of armour across the whole team.', power: 70 },
  QUAKE:   { name: 'Shock Cascade',   blurb: 'Damages one part on every enemy still standing.', power: 60 },
  SEVER:   { name: 'Sever Protocol',  blurb: 'Destroys the targeted part outright if it is below half armour.', power: 110 },
};

const ZERO = { SHOOT: 1, SNIPE: 1, LASER: 1, MELEE: 1, BREAK: 1, REPAIR: 1, GUARD: 1 };

function medal(id, name, medaforce, skills, cost, blurb) {
  return { id, name, medaforce, skills: { ...ZERO, ...skills }, cost, blurb };
}

export const MEDALS = {
  beetle:  medal('beetle',  'Beetle Medal',   'BARRAGE', { SHOOT: 5, SNIPE: 3, LASER: 3, GUARD: 2 },   0,
    'Standard academy issue. Favours ranged fire and forgives a beginner\'s aim.'),
  stag:    medal('stag',    'Stag Medal',     'PIERCE',  { MELEE: 5, BREAK: 4, SHOOT: 2 },             0,
    'Aggressive and close-ranged. Rewards robots that want to be in your face.'),
  tortoise:medal('tortoise','Tortoise Medal', 'MEND',    { GUARD: 6, REPAIR: 4, SHOOT: 2 },            0,
    'Defensive doctrine. Turns a sturdy chassis into an immovable one.'),
  hornet:  medal('hornet',  'Hornet Medal',   'BARRAGE', { SHOOT: 8, SNIPE: 4, LASER: 3 },           900,
    'Suppression specialist. Every trigger pull lands a little harder.'),
  mantis:  medal('mantis',  'Mantis Medal',   'PIERCE',  { MELEE: 8, BREAK: 6 },                     950,
    'Duelling medal. Built for chassis that close the distance and finish it.'),
  raven:   medal('raven',   'Raven Medal',    'SEVER',   { SNIPE: 9, SHOOT: 4, LASER: 4 },          1250,
    'Marksman doctrine. Selects a part and erases it from the Robattle.'),
  kraken:  medal('kraken',  'Kraken Medal',   'QUAKE',   { LASER: 9, SHOOT: 4, BREAK: 3 },          1250,
    'Beam discipline. Unerring fire that dodging simply cannot answer.'),
  phoenix: medal('phoenix', 'Phoenix Medal',  'MEND',    { REPAIR: 9, GUARD: 6, LASER: 3 },         1400,
    'Support doctrine. A team that will not stay down.'),
  dragon:  medal('dragon',  'Dragon Medal',   'QUAKE',   { SHOOT: 6, SNIPE: 6, LASER: 6, MELEE: 6, BREAK: 6, GUARD: 5, REPAIR: 5 }, 3200,
    'Tournament-grade medal with no weak discipline. Priced accordingly.'),
};

export const STARTER_MEDALS = ['beetle', 'stag', 'tortoise'];

export function getMedal(id) {
  const m = MEDALS[id];
  if (!m) throw new Error(`unknown medal: ${id}`);
  return m;
}

/** Experience banked in a type raises the effective skill level, up to +3. */
export function effectiveSkill(medal, type, exp = {}) {
  const base = medal.skills[type] ?? 1;
  const bonus = Math.min(3, Math.floor((exp[type] ?? 0) / 120));
  return Math.min(13, base + bonus);
}
