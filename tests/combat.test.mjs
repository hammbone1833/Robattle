/**
 * Rule tests for the real-time Robattle engine. Run with `node tests/combat.test.mjs`.
 * No framework -- these assert the rules that make a Robattle a Robattle.
 */
import assert from 'node:assert/strict';
import {
  Combat, readyActions, usableActions, canMedaforce, legsStats, moveSpeed,
  windupTime, recoveryTime, MEDAFORCE_FULL,
} from '../assets/js/core/combat.js';
import { hitPartAt, toWorld, toLocal, muzzleOf, partCenter, RIG } from '../assets/js/core/rig.js';
import { familyLoadout, getPart, PARTS, SLOTS, purchasableParts, specialParts } from '../assets/js/data/parts.js';
import { currentEvents } from '../assets/js/data/events.js';
import { CUPS, cupUnlocked } from '../assets/js/data/tournaments.js';
import { MEDALS, effectiveSkill } from '../assets/js/data/medals.js';
import { OPPONENTS, lootPool } from '../assets/js/data/roster.js';
import { ARENAS, spawnPoints, blockedByCover } from '../assets/js/data/arenas.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

const team = (name, family, medal = 'beetle', ai = true) => ({
  name, ai, leader: 0,
  bots: [0, 1, 2].map((i) => ({ name: `${name}-${i}`, medal, parts: familyLoadout(family) })),
});
const fresh = (a = 'cadet', b = 'cadet', opts = {}) =>
  new Combat({ teams: [team('A', a), team('B', b)], seed: 1, arena: 'dome', ...opts });

console.log('\ndata');
test('every part has a family, a slot and armour', () => {
  for (const p of Object.values(PARTS)) {
    assert.ok(p.family && p.slot && p.armor > 0, `bad part ${p.id}`);
  }
});
test('purchasable parts have a price and event parts are not for sale', () => {
  for (const p of purchasableParts()) assert.ok(p.cost > 0, `${p.id} is free in the shop`);
  const buyable = new Set(purchasableParts().map((p) => p.id));
  for (const p of specialParts()) {
    assert.equal(p.cost, 0, `${p.id} should not carry a price`);
    assert.ok(!buyable.has(p.id), `${p.id} must never reach the shop`);
  }
  assert.ok(specialParts().length >= 4, 'there should be event parts to chase');
});
test('every event reward is an event-only part', () => {
  const special = new Set(specialParts().map((p) => p.id));
  for (let week = 0; week < 10; week++) {
    const date = new Date(Date.now() + week * 7 * 86400000);
    const ev = currentEvents(date);
    assert.ok(special.has(ev.weekly.reward), `weekly ${ev.weekly.id} reward is not exclusive`);
    assert.ok(special.has(ev.monthly.reward), `monthly ${ev.monthly.id} reward is not exclusive`);
    assert.ok(OPPONENTS.some((o) => o.id === ev.weekly.opponent), `weekly ${ev.weekly.id} bad opponent`);
    assert.ok(ARENAS[ev.weekly.arena], `weekly ${ev.weekly.id} bad arena`);
  }
});
test('cups form an unlock chain with real prizes', () => {
  const ids = new Set(CUPS.map((c) => c.id));
  for (const cup of CUPS) {
    if (cup.requires) assert.ok(ids.has(cup.requires), `${cup.id} requires a cup that does not exist`);
    assert.ok(cup.rounds.length >= 2, `${cup.id} is too short to be a cup`);
    for (const r of cup.rounds) assert.ok(OPPONENTS.some((o) => o.id === r), `${cup.id} unknown round ${r}`);
    assert.ok(PARTS[cup.prize.part], `${cup.id} prize part missing`);
    assert.ok(cup.prize.rodo > cup.entry, `${cup.id} purse does not cover its own entry fee`);
  }
  assert.equal(cupUnlocked(CUPS[0], []), true, 'the first cup must be open to everyone');
  assert.equal(cupUnlocked(CUPS[1], []), false, 'later cups must be locked at the start');
});
test('heads outlast arms, so the win condition is the last thing to fall', () => {
  for (const p of Object.values(PARTS)) {
    if (p.slot !== 'head') continue;
    for (const arm of Object.values(PARTS).filter((x) => x.family === p.family && x.slot.endsWith('arm'))) {
      assert.ok(p.armor > arm.armor, `${p.id} (${p.armor}) should outlast ${arm.id} (${arm.armor})`);
    }
  }
});
test('every opponent fields three robots, a valid leader and a loot pool', () => {
  for (const o of OPPONENTS) {
    assert.equal(o.bots.length, 3, `${o.id} team size`);
    assert.ok(o.leader >= 0 && o.leader < 3, `${o.id} leader index`);
    assert.ok(ARENAS[o.arena], `${o.id} unknown arena ${o.arena}`);
    for (const b of o.bots) {
      assert.ok(MEDALS[b.medal], `${o.id}/${b.name} medal`);
      for (const slot of SLOTS) assert.equal(getPart(b.parts[slot]).slot, slot, `${o.id}/${b.name} ${slot}`);
    }
    assert.ok(lootPool(o).length >= 4, `${o.id} loot pool`);
  }
});
test('medal experience raises a skill by at most three levels', () => {
  const m = MEDALS.beetle;
  assert.equal(effectiveSkill(m, 'SHOOT', {}), m.skills.SHOOT);
  assert.equal(effectiveSkill(m, 'SHOOT', { SHOOT: 10_000 }), m.skills.SHOOT + 3);
});

console.log('\nrig and aiming');
test('local/world transforms round-trip at every facing', () => {
  for (const facing of [0, 0.7, Math.PI / 2, Math.PI, -2.3, 5.9]) {
    const bot = { pos: { x: 3, z: -2 }, facing };
    for (const [lx, ly, lz] of [[0, 1.78, 0], [0.7, 1.16, 0], [-0.7, 1.16, 0]]) {
      const w = toWorld(bot, lx, ly, lz);
      const back = toLocal(bot, w.x, w.y, w.z);
      assert.ok(Math.abs(back.x - lx) < 1e-9 && Math.abs(back.z - lz) < 1e-9, `facing ${facing}`);
    }
  }
});
test('where a shot lands decides which part it damages', () => {
  for (const facing of [0, 1.2, Math.PI, -0.4]) {
    const bot = { pos: { x: -4, z: 6 }, facing };
    const cases = [[0, 1.78, 0, 'head'], [0.7, 1.16, 0, 'rarm'], [-0.7, 1.16, 0, 'larm'],
                   [0, 0.48, 0, 'legs'], [0, 1.2, 0, 'legs'], [7, 1, 0, null]];
    for (const [lx, ly, lz, want] of cases) {
      const w = toWorld(bot, lx, ly, lz);
      assert.equal(hitPartAt(bot, w.x, w.y, w.z), want, `facing ${facing} -> ${want}`);
    }
  }
});
test('a torso hit is credited to the chassis, not ignored', () => {
  const bot = { pos: { x: 0, z: 0 }, facing: 0 };
  assert.equal(hitPartAt(bot, 0, 1.2, 0), 'legs');
});
test('cover blocks line of sight', () => {
  assert.equal(blockedByCover(ARENAS.junkyard, -14, 1, 0, 14, 1, 0), true);
  assert.equal(blockedByCover(ARENAS.desert, -20, 1, 14, 20, 1, 14), false);
});
test('teams spawn on opposite sides facing each other', () => {
  const a = spawnPoints(ARENAS.dome, 0, 3), b = spawnPoints(ARENAS.dome, 1, 3);
  assert.ok(a.every((p) => p.z < 0) && b.every((p) => p.z > 0));
  assert.ok(a.length === 3 && b.length === 3);
});

console.log('\nparts and timings');
test('lighter legs move faster and recover faster', () => {
  const c = fresh('zephyr', 'bulwark');
  assert.ok(moveSpeed(c.teams[0].bots[0]) > moveSpeed(c.teams[1].bots[0]));
  const hover = getPart('zephyr-float'), tank = getPart('bulwark-tread');
  assert.ok(recoveryTime(getPart('zephyr-blink'), hover) < recoveryTime(getPart('ignis-howitzer'), tank));
  assert.ok(windupTime(getPart('zephyr-blink')) < windupTime(getPart('ignis-howitzer')));
});
test('support parts recover far slower than weapons', () => {
  const legs = getPart('warden-stilts');
  assert.ok(recoveryTime(getPart('warden-mender'), legs) > recoveryTime(getPart('hornet-repeat'), legs) * 2);
});
test('wrecked legs cripple speed and remove all evasion', () => {
  const c = fresh();
  const bot = c.bots[0];
  const before = moveSpeed(bot);
  bot.parts.legs.destroyed = true;
  assert.ok(moveSpeed(bot) < before * 0.6);
  assert.equal(legsStats(bot).evasion, 0);
});
test('a destroyed arm removes that weapon for the rest of the battle', () => {
  const c = fresh();
  const bot = c.bots[0];
  assert.ok(usableActions(bot).includes('rarm'));
  bot.parts.rarm.destroyed = true;
  assert.ok(!usableActions(bot).includes('rarm'));
  assert.equal(c.tryAction(bot.id, 'rarm', { x: 0, y: 0, z: 1 }), 'destroyed');
});
test('head weapons are limited-use and run dry', () => {
  const c = fresh();
  const bot = c.bots[0];
  assert.equal(bot.parts.head.usesLeft, getPart('cadet-optic').uses);
  bot.parts.head.usesLeft = 0;
  assert.equal(c.tryAction(bot.id, 'head', { x: 0, y: 0, z: 1 }), 'empty');
});
test('a part on cooldown refuses to fire again', () => {
  const c = fresh();
  c.think = () => {};                      // isolate the robot under test from its own AI
  const bot = c.bots[0];
  assert.equal(c.tryAction(bot.id, 'rarm', { x: 0, y: 0, z: 1 }), true);
  for (let i = 0; i < 30; i++) c.update(1 / 60);   // let the shot leave the barrel
  assert.equal(c.tryAction(bot.id, 'rarm', { x: 0, y: 0, z: 1 }), 'cooling');
});
test('firing is locked during another action wind-up', () => {
  const c = fresh();
  const bot = c.bots[0];
  assert.equal(c.tryAction(bot.id, 'rarm', { x: 0, y: 0, z: 1 }), true);
  assert.equal(c.tryAction(bot.id, 'larm', { x: 0, y: 0, z: 1 }), 'busy');
});
test('the legs action costs energy and goes on cooldown', () => {
  const c = fresh();
  const bot = c.bots[0];
  bot.input.mx = 1;
  assert.equal(c.tryAction(bot.id, 'legs'), true);
  assert.ok(bot.energy < 100);
  assert.equal(c.tryAction(bot.id, 'legs'), 'cooling');
});
test('tank legs brace instead of dashing', () => {
  const c = fresh('bulwark', 'cadet');
  const bot = c.bots[0];
  c.tryAction(bot.id, 'legs');
  assert.ok(bot.braceUntil > c.time, 'tank should brace');
  assert.equal(bot.dash, null);
});

console.log('\ndamage and destruction');
test('damage lands on the part that was hit and nowhere else', () => {
  const c = fresh();
  const victim = c.teams[1].bots[0];
  const armBefore = victim.parts.rarm.armor, headBefore = victim.parts.head.armor;
  c.damage(victim, 'rarm', 40, c.bots[0]);
  assert.ok(victim.parts.rarm.armor < armBefore);
  assert.equal(victim.parts.head.armor, headBefore);
});
test('defense reduces damage proportionally and can never zero it out', () => {
  const c = fresh('cadet', 'titan');
  const heavy = c.teams[1].bots[0];
  const before = heavy.parts.legs.armor;
  c.damage(heavy, 'legs', 5, c.bots[0]);
  assert.ok(heavy.parts.legs.armor < before, 'even a feeble hit must do something');
});
test('BREAK ignores defense entirely', () => {
  const c = fresh('cadet', 'titan');
  const a = c.teams[1].bots[0], b = c.teams[1].bots[1];
  c.damage(a, 'legs', 100, c.bots[0], null, null, 'SHOOT');
  c.damage(b, 'legs', 100, c.bots[0], null, null, 'BREAK');
  assert.ok(b.parts.legs.armor < a.parts.legs.armor, 'BREAK should hurt more through heavy plating');
});
test('guarding softens a hit but does not negate it', () => {
  const c = fresh();
  const a = c.teams[1].bots[0], b = c.teams[1].bots[1];
  a.guardUntil = c.time + 5;
  c.damage(a, 'legs', 60, c.bots[0]);
  c.damage(b, 'legs', 60, c.bots[0]);
  assert.ok(a.parts.legs.armor > b.parts.legs.armor, 'guard should absorb some');
  assert.ok(a.parts.legs.armor < a.parts.legs.maxArmor, 'but not all');
});
test('a wrecked head takes that robot out but not its team', () => {
  const c = fresh();
  const victim = c.teams[1].bots[1];
  c.damage(victim, 'head', 99999, c.bots[0]);
  assert.equal(victim.functional, false);
  assert.equal(c.finished, false, 'a non-leader going down must not end the battle');
});
test('wrecking the enemy leader head ends the Robattle at once', () => {
  const c = fresh();
  const leader = c.leaderOf(1);
  assert.equal(leader.isLeader, true);
  c.damage(leader, 'head', 99999, c.bots[0]);
  assert.equal(c.finished, true);
  assert.deepEqual([c.result.winner, c.result.reason], [0, 'leader']);
  assert.equal(c.teams[1].bots.filter((b) => b.functional).length, 2, 'the other two were still standing');
});
test('losing every robot also loses the Robattle', () => {
  const c = fresh();
  for (const b of c.teams[0].bots.slice().reverse()) c.damage(b, 'head', 99999, c.bots[3]);
  assert.equal(c.finished, true);
  assert.equal(c.result.winner, 1);
});
test('the medaforce gauge fills from damage taken, not damage dealt', () => {
  const c = fresh();
  const attacker = c.bots[0], victim = c.teams[1].bots[0];
  c.damage(victim, 'legs', 100, attacker);
  assert.ok(victim.medaforce > 0);
  assert.equal(attacker.medaforce, 0);
  assert.equal(canMedaforce(attacker), false);
});
test('a full medaforce unlocks and is spent on use', () => {
  const c = fresh();
  c.think = () => {};                      // nobody else shooting, so the gauge only moves once
  const bot = c.bots[0];
  bot.medaforce = MEDAFORCE_FULL;
  assert.equal(canMedaforce(bot), true);
  assert.equal(c.tryAction(bot.id, 'medaforce', { x: 0, y: 0, z: 1 }), true);
  for (let i = 0; i < 60; i++) c.update(1 / 60);
  assert.equal(bot.medaforce, 0);
  assert.equal(canMedaforce(bot), false);
});
test('repair restores armour but never past the part maximum', () => {
  const c = fresh('warden', 'cadet');
  const medic = c.bots[0];
  medic.parts.rarm.armor = 1;
  c.repair(medic, getPart('warden-mender'));
  assert.ok(medic.parts.rarm.armor > 1);
  for (let i = 0; i < 50; i++) c.repair(medic, getPart('warden-mender'));
  for (const s of SLOTS) assert.ok(medic.parts[s].armor <= medic.parts[s].maxArmor, `${s} overhealed`);
});

console.log('\nprojectiles');
test('a round fired at an enemy head damages the head', () => {
  const c = fresh();
  const shooter = c.bots[0], victim = c.teams[1].bots[0];
  victim.pos = { x: shooter.pos.x, z: shooter.pos.z + 10 };
  const head = partCenter(victim, 'head');
  const m = muzzleOf(shooter, 'rarm');
  const d = { x: head.x - m.x, y: head.y - m.y, z: head.z - m.z };
  const len = Math.hypot(d.x, d.y, d.z);
  c.fireProjectile(shooter, 'rarm', getPart('raven-needle'), m, { x: d.x / len, y: d.y / len, z: d.z / len });
  const before = victim.parts.head.armor;
  for (let i = 0; i < 40 && c.projectiles.length; i++) c.stepProjectiles(1 / 60);
  assert.ok(victim.parts.head.armor < before, 'the shot should have connected');
});
test('friendly fire is impossible', () => {
  const c = fresh();
  const shooter = c.bots[0], ally = c.teams[0].bots[1];
  ally.pos = { x: shooter.pos.x, z: shooter.pos.z + 8 };
  const target = partCenter(ally, 'legs');
  const m = muzzleOf(shooter, 'rarm');
  const d = { x: target.x - m.x, y: target.y - m.y, z: target.z - m.z };
  const len = Math.hypot(d.x, d.y, d.z);
  c.fireProjectile(shooter, 'rarm', getPart('cadet-pistol'), m, { x: d.x / len, y: d.y / len, z: d.z / len });
  const before = ally.parts.legs.armor;
  for (let i = 0; i < 60 && c.projectiles.length; i++) c.stepProjectiles(1 / 60);
  assert.equal(ally.parts.legs.armor, before);
});
test('projectiles are stopped by cover', () => {
  const c = new Combat({ teams: [team('A', 'cadet'), team('B', 'cadet')], seed: 3, arena: 'junkyard' });
  const shooter = c.bots[0], victim = c.teams[1].bots[0];
  shooter.pos = { x: -14, z: 0 }; shooter.facing = Math.PI / 2;
  victim.pos = { x: 14, z: 0 };
  const m = muzzleOf(shooter, 'rarm');
  c.fireProjectile(shooter, 'rarm', getPart('cadet-pistol'), m, { x: 1, y: 0, z: 0 });
  const before = victim.parts.legs.armor;
  for (let i = 0; i < 120 && c.projectiles.length; i++) c.stepProjectiles(1 / 60);
  assert.equal(victim.parts.legs.armor, before, 'the stack of wrecks should have eaten the round');
});

console.log('\nfull battles');
test('sixty AI battles across the roster all terminate cleanly', () => {
  for (let seed = 0; seed < 60; seed++) {
    const op = OPPONENTS[seed % OPPONENTS.length];
    const c = new Combat({
      seed, difficulty: op.tier, arena: op.arena,
      teams: [team('Player', 'cadet'), { name: op.name, ai: true, leader: op.leader, bots: op.bots }],
    });
    let n = 0;
    while (!c.finished && n++ < 60000) c.update(1 / 60);
    assert.ok(c.finished, `seed ${seed} vs ${op.id} never finished`);
    assert.ok([0, 1, -1].includes(c.result.winner), `seed ${seed} bad winner`);
    for (const b of c.bots) {
      for (const s of SLOTS) {
        assert.ok(b.parts[s].armor >= 0, `${b.name} ${s} went negative`);
        assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.z), `${b.name} left the coordinate system`);
        assert.ok(Math.abs(b.pos.x) <= c.arena.width, `${b.name} escaped the arena`);
      }
    }
  }
});
test('identical seeds replay identically', () => {
  const mk = () => new Combat({ seed: 777, difficulty: 3, arena: 'grand', teams: [team('A', 'hornet'), team('B', 'mantis', 'stag')] });
  const a = mk(), b = mk();
  while (!a.finished) a.update(1 / 60);
  while (!b.finished) b.update(1 / 60);
  assert.deepEqual(a.result, b.result);
});
test('no battle can outlast the clock without being decided on points', () => {
  const c = new Combat({ seed: 5, difficulty: 1, arena: 'dome', teams: [team('A', 'bulwark', 'tortoise'), team('B', 'bulwark', 'tortoise')] });
  let n = 0;
  while (!c.finished && n++ < 60000) c.update(1 / 60);
  assert.ok(c.finished && c.result.time <= 151);
});
test('a human-driven robot is never steered by the AI', () => {
  const c = fresh('cadet', 'cadet', { teams: [team('A', 'cadet', 'beetle', false), team('B', 'cadet')] });
  c.playerBotId = c.teams[0].bots[0].id;
  const player = c.playerBot;
  c.setInput(player.id, { mx: 0, mz: 0, facing: 0 });
  const start = { ...player.pos };
  for (let i = 0; i < 120; i++) c.update(1 / 60);
  const moved = Math.hypot(player.pos.x - start.x, player.pos.z - start.z);
  assert.ok(moved < 2.5, `player robot wandered ${moved.toFixed(2)} units on its own`);
});

console.log(`\n${passed} passed\n`);
