/**
 * Rotating events.
 *
 * The brief asked for weekly and monthly specials, and this site has no server, so the
 * rotation is derived from the calendar instead of pushed from one: the week number and
 * the month index seed which event is live. Everyone opening the site in the same week
 * sees the same event, it changes on its own every Monday, and nothing has to be
 * deployed to make that happen.
 */

import { makeRng } from '../core/rng.js';

const EPOCH = Date.UTC(2024, 0, 1);       // a Monday, so weeks line up with real weeks

export function weekIndex(date = new Date()) {
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - EPOCH) / 604800000);
}
export function monthIndex(date = new Date()) {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** Weekly challenges: one opponent, one twist, one exclusive part. */
const WEEKLY = [
  {
    id: 'scrap-run', name: 'Scrap Run', opponent: 'green-cut', arena: 'junkyard',
    rule: 'Their whole team fights at close quarters. Keep moving and keep your distance.',
    modifier: { difficulty: 3 }, reward: 'relic-judgment',
  },
  {
    id: 'beam-week', name: 'Beam Week', opponent: 'blue-shift', arena: 'rooftop',
    rule: 'Every opponent carries beam weapons, and beams cannot be dodged. Use cover.',
    modifier: { difficulty: 4 }, reward: 'relic-echo',
  },
  {
    id: 'siege', name: 'Siege Drill', opponent: 'iron-wall', arena: 'dome',
    rule: 'A wall of armour with a two minute clock. Strip the leader or lose on points.',
    modifier: { difficulty: 3, timeLimit: 120 }, reward: 'relic-veil',
  },
  {
    id: 'marksman', name: 'Marksman Trial', opponent: 'carrion-club', arena: 'desert',
    rule: 'Open ground against snipers. There is no cover out there, so do not stand still.',
    modifier: { difficulty: 4 }, reward: 'relic-oracle',
  },
  {
    id: 'furnace', name: 'Furnace Hours', opponent: 'ashfall', arena: 'desert',
    rule: 'Artillery behind a medic. Kill the support or the damage never sticks.',
    modifier: { difficulty: 4 }, reward: 'relic-fang',
  },
  {
    id: 'proving', name: 'Proving Ground', opponent: 'sting-squad', arena: 'schoolyard',
    rule: 'A straight fight with no gimmick. Good week to test a new loadout.',
    modifier: { difficulty: 2 }, reward: 'relic-stride',
  },
];

/** Monthly events are longer and harder, and pay out the heaviest relics. */
const MONTHLY = [
  {
    id: 'prototype-hunt', name: 'Prototype Hunt', opponent: 'project-nova', arena: 'grand',
    rule: 'The unlisted team, at full strength. Win once this month and the frame is yours.',
    modifier: { difficulty: 5 }, reward: 'relic-bastion',
  },
  {
    id: 'champions-exhibition', name: "Champions' Exhibition", opponent: 'gold-standard', arena: 'grand',
    rule: 'The reigning champions take all comers. They do not go easy in exhibitions.',
    modifier: { difficulty: 5 }, reward: 'relic-crown',
  },
];

function pick(list, seed) {
  const rng = makeRng(seed);
  return list[Math.floor(rng() * list.length)];
}

/** Monday 00:00 UTC of the week after the given date. */
function nextWeekStart(date) {
  return new Date(EPOCH + (weekIndex(date) + 1) * 604800000);
}
function nextMonthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export function currentEvents(date = new Date()) {
  const w = weekIndex(date), m = monthIndex(date);
  return {
    weekly: {
      ...pick(WEEKLY, w * 2654435761),
      kind: 'weekly',
      period: w,
      key: `w${w}`,
      endsAt: nextWeekStart(date).toISOString(),
    },
    monthly: {
      ...pick(MONTHLY, m * 40503 + 7),
      kind: 'monthly',
      period: m,
      key: `m${m}`,
      endsAt: nextMonthStart(date).toISOString(),
    },
  };
}

/** A shop restocks weekly too, from the same clock. */
export function shopSeed(date = new Date()) {
  return weekIndex(date) * 7919 + 13;
}

export function timeUntil(iso, now = new Date()) {
  const ms = new Date(iso) - now;
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const mi = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mi}m`;
  return `${mi}m`;
}
