/**
 * Balance harness: runs AI-vs-AI Robattles and reports how they ended.
 * Run with `node tests/simulate.mjs [battlesPerMatchup]`.
 */
import { Combat } from '../assets/js/core/combat.js';
import { familyLoadout } from '../assets/js/data/parts.js';
import { OPPONENTS } from '../assets/js/data/roster.js';
import { STARTER_MEDALS } from '../assets/js/data/medals.js';

const N = Number(process.argv[2] ?? 30);

const starterTeam = () => ({
  name: 'Player', ai: true, leader: 0,
  bots: STARTER_MEDALS.map((m, i) => ({ name: `Cadet ${i + 1}`, medal: m, parts: familyLoadout('cadet') })),
});
const teamFor = (op) => ({ name: op.name, ai: true, leader: op.leader, bots: op.bots });

function run(a, b, seed, difficulty, arena) {
  const c = new Combat({ teams: [a, b], seed, difficulty, arena });
  let n = 0;
  while (!c.finished && n++ < 120000) c.update(1 / 60);
  if (!c.finished) return { winner: -2, reason: 'hang', time: c.time, combat: c };
  return { ...c.result, combat: c };
}

function stats(list) {
  const times = list.map((r) => r.time).sort((x, y) => x - y);
  const med = times[Math.floor(times.length / 2)];
  const wins = list.filter((r) => r.winner === 0).length;
  const reasons = {};
  for (const r of list) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  let fired = 0, hit = 0;
  for (const r of list) for (const b of r.combat.bots) { fired += b.stats.shotsFired; hit += b.stats.shotsHit; }
  return {
    median: med.toFixed(0) + 's',
    range: `${times[0].toFixed(0)}-${times[times.length - 1].toFixed(0)}s`,
    winRate: ((wins / list.length) * 100).toFixed(0) + '%',
    accuracy: ((hit / Math.max(1, fired)) * 100).toFixed(0) + '%',
    reasons,
  };
}

const rows = [];
console.log(`\nStarter team vs each opponent, ${N} battles each\n`);
console.log('tier  opponent             median  range       win   acc   reasons');
for (const op of OPPONENTS) {
  const results = [];
  for (let i = 0; i < N; i++) results.push(run(starterTeam(), teamFor(op), 1000 + i, op.tier, op.arena));
  const s = stats(results);
  rows.push(s);
  console.log(
    String(op.tier).padEnd(6) + op.name.padEnd(21) + s.median.padEnd(8) +
    s.range.padEnd(12) + s.winRate.padEnd(6) + s.accuracy.padEnd(6) + JSON.stringify(s.reasons));
}

console.log(`\nMirror matches -- should sit near 50% and never time out\n`);
for (const op of OPPONENTS.filter((o) => [1, 2, 3, 4, 5].includes(o.tier)).slice(0, 6)) {
  const results = [];
  for (let i = 0; i < N; i++) results.push(run({ ...teamFor(op), name: 'A' }, { ...teamFor(op), name: 'B' }, 5000 + i, op.tier, op.arena));
  const s = stats(results);
  console.log(op.name.padEnd(21) + `median ${s.median.padEnd(6)} sideA ${s.winRate.padEnd(5)} acc ${s.accuracy.padEnd(5)} ${JSON.stringify(s.reasons)}`);
}
console.log('');
