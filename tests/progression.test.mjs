/**
 * Tests for save state, economy and standings. Run with `node tests/progression.test.mjs`.
 * localStorage is stubbed so the same code that runs in the browser runs here.
 */
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { GameState } = await import('../assets/js/core/state.js');
const { standings, ratingDelta, titleFor } = await import('../assets/js/core/leaderboard.js');
const { getPart, SLOTS } = await import('../assets/js/data/parts.js');
const { currentEvents, weekIndex, monthIndex, shopSeed } = await import('../assets/js/data/events.js');

let passed = 0;
function test(name, fn) {
  try { store.clear(); fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

console.log('\nsave state');
test('a fresh save has three medabots, medals and starting money', () => {
  const s = new GameState();
  assert.equal(s.data.team.length, 3);
  assert.ok(s.data.rodo > 0);
  assert.ok(s.data.medals.length >= 3);
  for (const bot of s.data.team) for (const slot of SLOTS) assert.equal(getPart(bot.parts[slot]).slot, slot);
});
test('state survives a round trip through storage', () => {
  const a = new GameState();
  a.earn(500);
  a.addPart('raven-rifle');
  a.save();
  const b = GameState.load();
  assert.equal(b.data.rodo, a.data.rodo);
  assert.equal(b.countOf('raven-rifle'), 1);
});
test('a corrupt save falls back to a playable one instead of failing', () => {
  store.set('robattle3d.save.v2', '{not json at all');
  const s = GameState.load();
  assert.equal(s.data.team.length, 3);
  assert.ok(s.data.rodo > 0);
});
test('a save referring to deleted parts is repaired, not rejected', () => {
  const s = new GameState();
  s.data.team[0].parts.rarm = 'part-that-no-longer-exists';
  s.data.inventory['also-gone'] = 3;
  s.data.medals.push('imaginary-medal');
  s.validate();
  assert.equal(getPart(s.data.team[0].parts.rarm).slot, 'rarm');
  assert.equal(s.countOf('also-gone'), 0);
  assert.ok(!s.data.medals.includes('imaginary-medal'));
});

console.log('\neconomy');
test('you cannot spend money you do not have', () => {
  const s = new GameState();
  s.data.rodo = 100;
  assert.equal(s.spend(500), false);
  assert.equal(s.data.rodo, 100);
  assert.equal(s.spend(100), true);
  assert.equal(s.data.rodo, 0);
});
test('equipping swaps parts without ever destroying one', () => {
  const s = new GameState();
  s.addPart('raven-rifle');
  const removed = s.data.team[0].parts.rarm;
  const sparesBefore = s.countOf(removed);
  const totalBefore = [...s.ownedParts().values()].reduce((a, b) => a + b, 0);
  assert.equal(s.equip(0, 'rarm', 'raven-rifle'), true);
  assert.equal(s.data.team[0].parts.rarm, 'raven-rifle');
  assert.equal(s.countOf(removed), sparesBefore + 1, 'the part that came off went back to the shelf');
  assert.equal([...s.ownedParts().values()].reduce((a, b) => a + b, 0), totalBefore);
});
test('a part cannot be fitted to the wrong slot, or fitted twice from one copy', () => {
  const s = new GameState();
  s.addPart('raven-rifle');
  assert.equal(s.equip(0, 'larm', 'raven-rifle'), false, 'right-arm part in a left-arm slot');
  assert.equal(s.equip(0, 'rarm', 'raven-rifle'), true);
  assert.equal(s.equip(1, 'rarm', 'raven-rifle'), false, 'the single copy is already fitted');
});
test('medals can only be fitted once owned', () => {
  const s = new GameState();
  assert.equal(s.setMedal(0, 'dragon'), false);
  s.addMedal('dragon');
  assert.equal(s.setMedal(0, 'dragon'), true);
});
test('an event reward can only be claimed once per period', () => {
  const s = new GameState();
  assert.equal(s.claimEvent('w141'), true);
  assert.equal(s.claimEvent('w141'), false);
  assert.equal(s.claimEvent('w142'), true);
});

console.log('\nrating and standings');
test('beating a stronger team is worth more than beating a weaker one', () => {
  assert.ok(ratingDelta(1000, 5, true) > ratingDelta(1000, 1, true));
  assert.ok(ratingDelta(1000, 1, false) < 0, 'losing to a weak team must cost rating');
  assert.equal(Math.sign(ratingDelta(1000, 3, true, true)), Math.sign(ratingDelta(1000, 3, true, true)));
});
test('the standings table always contains the player exactly once', () => {
  const s = new GameState();
  const rows = standings(s);
  assert.equal(rows.filter((r) => r.isPlayer).length, 1);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].rating >= rows[i].rating, 'table must be sorted');
  assert.equal(rows[0].rank, 1);
});
test('a higher rating moves the player up the table', () => {
  const low = new GameState();
  const high = new GameState();
  high.data.rating = 3000;
  assert.ok(standings(high).find((r) => r.isPlayer).rank < standings(low).find((r) => r.isPlayer).rank);
  assert.equal(titleFor(3000), 'Legend');
});

console.log('\nrotation');
test('the week and month indices advance with the calendar', () => {
  const now = new Date('2026-03-02T12:00:00Z');
  assert.equal(weekIndex(new Date('2026-03-09T12:00:00Z')), weekIndex(now) + 1);
  assert.equal(monthIndex(new Date('2026-04-02T12:00:00Z')), monthIndex(now) + 1);
});
test('the same week always gives the same event, and a later week changes it', () => {
  const a = currentEvents(new Date('2026-03-02T09:00:00Z'));
  const b = currentEvents(new Date('2026-03-04T21:00:00Z'));
  assert.equal(a.weekly.id, b.weekly.id, 'the event must not change mid-week');
  assert.equal(a.weekly.key, b.weekly.key);

  const ids = new Set();
  for (let w = 0; w < 12; w++) ids.add(currentEvents(new Date(Date.UTC(2026, 2, 2 + w * 7))).weekly.id);
  assert.ok(ids.size >= 3, `only ${ids.size} distinct events across 12 weeks`);
});
test('shop stock reseeds every week and holds steady within one', () => {
  assert.equal(shopSeed(new Date('2026-03-02T09:00:00Z')), shopSeed(new Date('2026-03-06T23:00:00Z')));
  assert.notEqual(shopSeed(new Date('2026-03-02T09:00:00Z')), shopSeed(new Date('2026-03-10T09:00:00Z')));
});

console.log(`\n${passed} passed\n`);
