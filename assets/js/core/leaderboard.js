/**
 * Regional standings.
 *
 * There is no server to hold a real ladder, so the rivals are generated from the week
 * number: everyone sees the same table in the same week, it reshuffles every Monday,
 * and the player's own rating -- which is real, and earned -- is slotted into it.
 */

import { makeRng } from './rng.js';
import { weekIndex } from '../data/events.js';
import { OPPONENTS } from '../data/roster.js';

const RIVAL_NAMES = [
  'Ione Kestrel', 'Bram Solder', 'Yuki Tan', 'Ozan Reyes', 'Petra Vance', 'Cass Mowry',
  'Dev Aarons', 'Lira Ostrom', 'Finch Kellar', 'Nadia Brek', 'Tom Ashgrove', 'Sena Oyelaran',
  'Rooke Vantz', 'Ilse Nakamura', 'Grigor Penn', 'May Ferrante',
];

const TITLES = ['Unranked', 'Rookie', 'Contender', 'Circuit Regular', 'Ranked', 'Sanctioned', 'Champion', 'Legend'];

export function titleFor(rating) {
  if (rating >= 2400) return TITLES[7];
  if (rating >= 2000) return TITLES[6];
  if (rating >= 1700) return TITLES[5];
  if (rating >= 1450) return TITLES[4];
  if (rating >= 1250) return TITLES[3];
  if (rating >= 1080) return TITLES[2];
  if (rating >= 950) return TITLES[1];
  return TITLES[0];
}

/**
 * Rating change for a result, Elo-style: beating a team far above you is worth a lot,
 * beating one far below you is worth almost nothing, and losing to a weaker team hurts.
 */
export function ratingDelta(playerRating, opponentTier, won, draw = false) {
  const opponentRating = 850 + opponentTier * 280;
  const expected = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
  const score = draw ? 0.5 : won ? 1 : 0;
  return Math.round(32 * (score - expected));
}

/** The full table, player included, sorted by rating. */
export function standings(state, date = new Date()) {
  const seed = weekIndex(date) * 104729 + 17;
  const rng = makeRng(seed);
  const rows = RIVAL_NAMES.map((name, i) => {
    const base = 900 + i * 105;
    const drift = (rng() - 0.5) * 220;
    const rating = Math.round(base + drift);
    const battles = 20 + Math.floor(rng() * 180);
    const winRate = 0.35 + rng() * 0.45;
    const team = OPPONENTS[Math.floor(rng() * OPPONENTS.length)];
    return {
      name,
      rating,
      wins: Math.round(battles * winRate),
      losses: Math.round(battles * (1 - winRate)),
      team: team.name,
      isPlayer: false,
    };
  });

  const d = state.data;
  rows.push({
    name: d.name || 'You',
    rating: d.rating,
    wins: d.record.wins,
    losses: d.record.losses,
    team: 'Your Team',
    isPlayer: true,
  });

  rows.sort((a, b) => b.rating - a.rating);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
