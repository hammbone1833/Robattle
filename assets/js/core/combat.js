/**
 * Real-time Robattle.
 *
 * Three robots a side, one of them a leader, fighting live in a walled arena. You drive
 * your own medabot directly -- move it, aim it, and fire its head, right arm and left arm
 * while its legs give you a dash or a brace. There is no turn queue and no command menu:
 * the only scheduling is each part's own wind-up and recovery.
 *
 * What makes it a Robattle rather than a shooter is where the damage lands. A medabot is
 * four separate parts with four separate armour pools, and a shot damages whichever part
 * it physically hit. Shoot an arm off and that weapon is gone for the rest of the match.
 * Shoot the legs and it can barely move. Shoot the head and that robot is finished --
 * and if the head belonged to the enemy *leader*, the whole Robattle ends right there,
 * however healthy its team-mates are.
 *
 * The module is free of DOM and WebGL so the whole fight can be run headlessly in tests.
 */

import { getPart, SLOTS } from '../data/parts.js';
import { getMedal, effectiveSkill, MEDAFORCE } from '../data/medals.js';
import { getArena, spawnPoints, blockedByCover } from '../data/arenas.js';
import { RIG, hitPartAt, muzzleOf, partCenter, toWorld } from './rig.js';
import { makeRng, clamp } from './rng.js';

export const WEAPON_SLOTS = ['head', 'rarm', 'larm'];
export const MEDAFORCE_FULL = 100;
const TIME_LIMIT = 150;
const MAX_ENERGY = 100;

/* --------------------------------------------------------------- tuning */

/** Wind-up: the delay between pulling the trigger and the part actually firing. */
export const windupTime = (part) => 0.10 + part.charge * 0.011;
/** Recovery: how long that one part is unusable afterwards. Light legs shorten it. */
export const recoveryTime = (part, legs) => {
  // Support parts recover far slower than weapons -- a medic that could mend faster than
  // an enemy could shoot would make every match a stalemate.
  const support = part.type === 'REPAIR' || part.type === 'GUARD' ? 2.4 : 1;
  return (0.22 + part.cooldown * 0.032) * support * (1 - Math.min(0.35, legs.mobility * 0.0035));
};

const LEG_STYLE = {
  biped:    { speed: 1.00, action: 'BOOST', cost: 25, cd: 1.3 },
  wheel:    { speed: 1.10, action: 'BOOST', cost: 22, cd: 1.1 },
  multileg: { speed: 1.06, action: 'BOOST', cost: 24, cd: 1.2 },
  hover:    { speed: 1.14, action: 'BLINK', cost: 30, cd: 1.0 },
  flight:   { speed: 1.18, action: 'BLINK', cost: 30, cd: 1.0 },
  tank:     { speed: 0.84, action: 'BRACE', cost: 35, cd: 2.4 },
};
export const legStyle = (legsPart) => LEG_STYLE[legsPart.model] ?? LEG_STYLE.biped;

/** Preferred fighting distance for a weapon, which the AI uses to position itself. */
const RANGE_OF = { MELEE: 2.6, BREAK: 2.6, SHOOT: 13, SNIPE: 22, LASER: 15, REPAIR: 9, GUARD: 9 };
const PROJECTILE = {
  SHOOT: { speed: 46, radius: 0.30, life: 2.2 },
  SNIPE: { speed: 95, radius: 0.28, life: 2.4 },
};
// A swing cannot miss once it connects, so it has to be genuinely hard to get into
// position for: short reach, narrow arc, and you are inside everyone else's range.
const MELEE_RANGE = 2.9;
const MELEE_ARC = Math.PI * 0.32;

/* ---------------------------------------------------------- construction */

let uid = 0;

function makeBot(spec, side, index, isLeader, spawn) {
  const parts = {};
  for (const slot of SLOTS) {
    const part = getPart(spec.parts[slot]);
    // `condition` carries damage in from a previous tournament round: a ratio per slot,
    // floored so nobody starts a round already wrecked -- that is the field repair.
    const ratio = spec.condition ? Math.max(0.2, Math.min(1, spec.condition[slot] ?? 1)) : 1;
    parts[slot] = {
      slot, part,
      armor: Math.max(1, Math.round(part.armor * ratio)), maxArmor: part.armor,
      destroyed: false,
      usesLeft: part.uses > 0 ? part.uses : Infinity,
    };
  }
  return {
    id: `b${++uid}`,
    side, index, isLeader,
    name: spec.name,
    medal: getMedal(spec.medal),
    medalExp: spec.medalExp ? { ...spec.medalExp } : {},
    parts,
    functional: true,
    pos: { x: spawn.x, z: spawn.z },
    vel: { x: 0, z: 0 },
    facing: spawn.facing,
    lock: 0,
    windup: null,
    cooldown: { head: 0, rarm: 0, larm: 0, legs: 0 },
    energy: MAX_ENERGY,
    medaforce: 0,
    forceReady: false,
    guardUntil: 0,
    braceUntil: 0,
    dash: null,
    input: { mx: 0, mz: 0 },
    ai: { targetId: null, strafe: 1, nextThink: 0, nextStrafe: 0, jitter: 0 },
    downAt: null,
    stats: { damageDealt: 0, damageTaken: 0, partsWrecked: 0, shotsFired: 0, shotsHit: 0 },
  };
}

export function legsStats(bot) {
  const p = bot.parts.legs.part;
  if (bot.parts.legs.destroyed) {
    return { propulsion: p.propulsion * 0.4, mobility: p.mobility * 0.4, evasion: 0, defense: p.defense * 0.4, wrecked: true };
  }
  return { propulsion: p.propulsion, mobility: p.mobility, evasion: p.evasion, defense: p.defense, wrecked: false };
}

export function moveSpeed(bot) {
  const legs = legsStats(bot);
  const style = legStyle(bot.parts.legs.part);
  const base = (3.4 + legs.propulsion * 0.055) * style.speed;
  return bot.parts.legs.destroyed ? base * 0.42 : base;
}

/** Weapon slots this robot can still fire right now. */
export function readyActions(bot, time) {
  return WEAPON_SLOTS.filter((s) => {
    const st = bot.parts[s];
    return !st.destroyed && st.usesLeft > 0 && bot.cooldown[s] <= time;
  });
}
export function usableActions(bot) {
  return WEAPON_SLOTS.filter((s) => !bot.parts[s].destroyed && bot.parts[s].usesLeft > 0);
}
export function canMedaforce(bot) {
  return bot.functional && bot.medaforce >= MEDAFORCE_FULL && !bot.parts.head.destroyed;
}
export function partHealth(bot) {
  let cur = 0, max = 0;
  for (const s of SLOTS) { cur += Math.max(0, bot.parts[s].armor); max += bot.parts[s].maxArmor; }
  return max ? cur / max : 0;
}

const norm = (v) => {
  const l = Math.hypot(v.x, v.y ?? 0, v.z) || 1;
  return { x: v.x / l, y: (v.y ?? 0) / l, z: v.z / l };
};

/* ------------------------------------------------------------------ engine */

export class Combat {
  /**
   * @param {object} cfg
   * @param {Array}  cfg.teams  [{ name, bots:[{name,medal,parts}], leader, ai }]
   * @param {string} cfg.arena  key into the arena table
   * @param {string} [cfg.playerBotId] filled in after construction by the caller
   * @param {number} [cfg.difficulty] 1..5
   */
  constructor({ teams, arena = 'dome', seed, difficulty = 3, timeLimit = TIME_LIMIT }) {
    this.rng = makeRng(seed ?? (Math.random() * 1e9) | 0);
    this.arena = getArena(arena);
    this.arenaId = arena;
    this.difficulty = difficulty;
    this.timeLimit = timeLimit;
    this.time = 0;
    this.finished = false;
    this.result = null;
    this.listeners = new Set();
    this.projectiles = [];
    this.events = [];

    this.teams = teams.map((t, side) => {
      const spawns = spawnPoints(this.arena, side, t.bots.length);
      return {
        side,
        name: t.name,
        ai: t.ai !== false,
        // Training frames: they move and dodge so you have something to lead, but they
        // never shoot back, which is the whole point of a drill.
        passive: !!t.passive,
        leaderIndex: t.leader ?? 0,
        bots: t.bots.map((b, i) => makeBot(b, side, i, i === (t.leader ?? 0), spawns[i])),
      };
    });
    this.bots = this.teams.flatMap((t) => t.bots);
    this.byId = new Map(this.bots.map((b) => [b.id, b]));
    /** The one robot a human is driving. Everything else thinks for itself. */
    this.playerBotId = null;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data = {}) {
    const ev = { time: this.time, ...data, type };
    this.events.push(ev);
    if (this.events.length > 400) this.events.shift();
    for (const fn of this.listeners) fn(ev);
  }

  bot(id) { return this.byId.get(id); }
  enemiesOf(bot) { return this.teams[1 - bot.side].bots.filter((b) => b.functional); }
  alliesOf(bot) { return this.teams[bot.side].bots.filter((b) => b.functional && b !== bot); }
  leaderOf(side) { const t = this.teams[side]; return t.bots[t.leaderIndex]; }
  get playerBot() { return this.playerBotId ? this.byId.get(this.playerBotId) : null; }

  skill(bot, type) { return effectiveSkill(bot.medal, type, bot.medalExp); }

  /* ------------------------------------------------------------ main loop */

  update(dt) {
    if (this.finished) return;
    let left = Math.min(dt, 0.1);
    while (left > 0 && !this.finished) {
      const step = Math.min(left, 1 / 60);
      this.step(step);
      left -= step;
    }
  }

  step(dt) {
    this.time += dt;
    for (const bot of this.bots) {
      if (!bot.functional) continue;
      this.regen(bot, dt);
      if (this.teams[bot.side].ai || bot.id !== this.playerBotId) this.think(bot, dt);
      this.move(bot, dt);
      if (bot.windup && this.time >= bot.windup.releaseAt) this.release(bot);
    }
    this.stepProjectiles(dt);
    this.separate();
    if (this.time >= this.timeLimit && !this.finished) this.decideOnTime();
  }

  regen(bot, dt) {
    const legs = legsStats(bot);
    bot.energy = Math.min(MAX_ENERGY, bot.energy + (14 + legs.mobility * 0.12) * dt);
    if (!bot.forceReady && bot.medaforce >= MEDAFORCE_FULL) {
      bot.forceReady = true;
      this.emit('medaforce-ready', { botId: bot.id });
    }
  }

  /* ------------------------------------------------------------- movement */

  /** Drive a robot this frame. Called by the renderer for the human-controlled one. */
  setInput(botId, input) {
    const bot = this.bot(botId);
    if (!bot || !bot.functional) return;
    bot.input.mx = input.mx ?? 0;
    bot.input.mz = input.mz ?? 0;
    if (input.facing !== undefined) bot.facing = input.facing;
  }

  move(bot, dt) {
    const speed = moveSpeed(bot) * (bot.windup ? 0.45 : 1);
    let vx = bot.input.mx, vz = bot.input.mz;
    const len = Math.hypot(vx, vz);
    if (len > 1) { vx /= len; vz /= len; }

    if (bot.dash && this.time < bot.dash.until) {
      vx = bot.dash.x; vz = bot.dash.z;
      bot.pos.x += vx * bot.dash.speed * dt;
      bot.pos.z += vz * bot.dash.speed * dt;
    } else {
      if (bot.dash) bot.dash = null;
      bot.pos.x += vx * speed * dt;
      bot.pos.z += vz * speed * dt;
    }
    bot.vel.x = vx * speed; bot.vel.z = vz * speed;

    // Arena walls.
    const hw = this.arena.width / 2 - 1.2, hd = this.arena.depth / 2 - 1.2;
    bot.pos.x = clamp(bot.pos.x, -hw, hw);
    bot.pos.z = clamp(bot.pos.z, -hd, hd);

    // Cover: push the robot out of the nearest face of any block it has entered.
    const r = RIG.bodyRadius;
    for (const [bx, bz, bhw, bhd] of this.arena.blocks) {
      const dx = bot.pos.x - bx, dz = bot.pos.z - bz;
      const ox = bhw + r - Math.abs(dx), oz = bhd + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) bot.pos.x = bx + Math.sign(dx || 1) * (bhw + r);
        else bot.pos.z = bz + Math.sign(dz || 1) * (bhd + r);
      }
    }
  }

  /** Keep robots from standing inside each other. */
  separate() {
    const r = RIG.bodyRadius * 2;
    for (let i = 0; i < this.bots.length; i++) {
      const a = this.bots[i];
      if (!a.functional) continue;
      for (let j = i + 1; j < this.bots.length; j++) {
        const b = this.bots[j];
        if (!b.functional) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.0001 && d < r) {
          const push = (r - d) / 2;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }
  }

  /* -------------------------------------------------------------- actions */

  /**
   * Begin an action. `slot` is 'head' | 'rarm' | 'larm' | 'legs' | 'medaforce'.
   * @returns {boolean|string} true, or a short reason it was refused.
   */
  tryAction(botId, slot, aimDir) {
    const bot = this.bot(botId);
    if (!bot || !bot.functional || this.finished) return 'unavailable';
    if (bot.lock > this.time || bot.windup) return 'busy';

    if (slot === 'legs') return this.legsAction(bot, aimDir);
    if (slot === 'medaforce') {
      if (!canMedaforce(bot)) return 'not-charged';
      bot.windup = { slot, releaseAt: this.time + 0.45, aim: norm(aimDir ?? this.facingVector(bot)) };
      bot.lock = bot.windup.releaseAt + 0.2;
      this.emit('windup', { botId: bot.id, slot, duration: 0.45 });
      return true;
    }

    const st = bot.parts[slot];
    if (!st || st.destroyed) return 'destroyed';
    if (st.usesLeft <= 0) return 'empty';
    if (bot.cooldown[slot] > this.time) return 'cooling';

    const w = windupTime(st.part);
    bot.windup = { slot, releaseAt: this.time + w, aim: norm(aimDir ?? this.facingVector(bot)) };
    bot.lock = bot.windup.releaseAt + 0.12;
    this.emit('windup', { botId: bot.id, slot, duration: w, actionType: st.part.type });
    return true;
  }

  facingVector(bot) { return { x: Math.sin(bot.facing), y: 0, z: Math.cos(bot.facing) }; }

  legsAction(bot, aimDir) {
    if (bot.parts.legs.destroyed) return 'destroyed';
    if (bot.cooldown.legs > this.time) return 'cooling';
    const style = legStyle(bot.parts.legs.part);
    if (bot.energy < style.cost) return 'no-energy';
    bot.energy -= style.cost;
    bot.cooldown.legs = this.time + style.cd;

    if (style.action === 'BRACE') {
      bot.braceUntil = this.time + 2.4;
      this.emit('brace', { botId: bot.id, duration: 2.4 });
      return true;
    }
    // Dash along the movement stick if it is pushed, otherwise straight ahead.
    let dx = bot.input.mx, dz = bot.input.mz;
    if (Math.hypot(dx, dz) < 0.1) { const f = this.facingVector(bot); dx = f.x; dz = f.z; }
    const l = Math.hypot(dx, dz) || 1;
    const blink = style.action === 'BLINK';
    bot.dash = { x: dx / l, z: dz / l, until: this.time + (blink ? 0.20 : 0.26), speed: moveSpeed(bot) * (blink ? 3.4 : 2.7) };
    this.emit('dash', { botId: bot.id, kind: style.action });
    return true;
  }

  release(bot) {
    const { slot, aim } = bot.windup;
    bot.windup = null;

    if (slot === 'medaforce') { this.fireMedaforce(bot, aim); return; }

    const st = bot.parts[slot];
    if (!st || st.destroyed) { this.emit('action-aborted', { botId: bot.id, slot }); return; }

    const part = st.part;
    const legs = legsStats(bot);
    bot.cooldown[slot] = this.time + recoveryTime(part, legs);
    if (st.usesLeft !== Infinity) st.usesLeft -= 1;
    bot.stats.shotsFired++;
    this.gainMedalExp(bot, part.type);

    const muzzle = muzzleOf(bot, slot);
    this.emit('fire', {
      botId: bot.id, slot, actionType: part.type, partName: part.name,
      from: { ...muzzle }, dir: { ...aim },
      usesLeft: st.usesLeft === Infinity ? null : st.usesLeft,
    });

    switch (part.type) {
      case 'LASER':  this.fireBeam(bot, slot, part, muzzle, aim); break;
      case 'MELEE':
      case 'BREAK':  this.swing(bot, slot, part, aim); break;
      case 'REPAIR': this.repair(bot, part); break;
      case 'GUARD':  this.raiseGuard(bot, part); break;
      default:       this.fireProjectile(bot, slot, part, muzzle, aim); break;
    }
  }

  gainMedalExp(bot, type) { bot.medalExp[type] = (bot.medalExp[type] ?? 0) + 4; }

  /** Accuracy shows up as cone spread rather than a dice roll -- you can still miss. */
  spreadFor(part, bot) {
    const skill = this.skill(bot, part.type);
    const base = (100 - part.success) * 0.0010;
    return Math.max(0, base - skill * 0.00075);
  }

  jitter(dir, spread) {
    if (spread <= 0) return dir;
    const a = (this.rng() - 0.5) * spread * 2;
    const b = (this.rng() - 0.5) * spread * 2;
    // Rotate around Y for horizontal spread, then tilt vertically.
    const c = Math.cos(a), s = Math.sin(a);
    return norm({ x: dir.x * c - dir.z * s, y: dir.y + b, z: dir.x * s + dir.z * c });
  }

  fireProjectile(bot, slot, part, muzzle, aim) {
    const cfg = PROJECTILE[part.type] ?? PROJECTILE.SHOOT;
    const dir = this.jitter(aim, this.spreadFor(part, bot));
    this.projectiles.push({
      id: `p${++uid}`,
      ownerId: bot.id, side: bot.side, slot,
      x: muzzle.x, y: muzzle.y, z: muzzle.z,
      vx: dir.x * cfg.speed, vy: dir.y * cfg.speed, vz: dir.z * cfg.speed,
      radius: cfg.radius, life: cfg.life,
      damage: this.damageOf(bot, part), actionType: part.type,
      ignoresDefense: false, family: part.family,
    });
  }

  fireBeam(bot, slot, part, muzzle, aim) {
    const hit = this.raycast(muzzle, aim, 46, bot.side, bot.id);
    this.emit('beam', {
      botId: bot.id, slot, from: { ...muzzle },
      to: hit ? hit.point : { x: muzzle.x + aim.x * 46, y: muzzle.y + aim.y * 46, z: muzzle.z + aim.z * 46 },
      family: part.family,
    });
    if (hit && hit.bot) {
      bot.stats.shotsHit++;
      this.damage(hit.bot, hit.slot, this.damageOf(bot, part), bot, part, hit.point);
    }
  }

  swing(bot, slot, part, aim) {
    const reach = MELEE_RANGE + 0.4;
    let best = null, bestD = Infinity;
    for (const foe of this.enemiesOf(bot)) {
      const dx = foe.pos.x - bot.pos.x, dz = foe.pos.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const ang = Math.abs(this.angleBetween({ x: dx / d, z: dz / d }, aim));
      if (ang > MELEE_ARC) continue;
      if (d < bestD) { bestD = d; best = foe; }
    }
    this.emit('swing', { botId: bot.id, slot, family: part.family, hit: !!best });
    if (!best) return;

    // The part struck is whatever the swing arc actually crosses.
    const muzzle = muzzleOf(bot, slot);
    const hit = this.rayAgainstBot(best, muzzle, aim, reach + 1.5);
    const targetSlot = hit ? hit.slot : this.rng.pick(SLOTS.filter((s) => !best.parts[s].destroyed));
    if (!targetSlot) return;
    bot.stats.shotsHit++;
    const point = hit ? hit.point : partCenter(best, targetSlot);
    this.damage(best, targetSlot, this.damageOf(bot, part), bot, part, point);
  }

  repair(bot, part) {
    const skill = this.skill(bot, 'REPAIR');
    const amount = Math.round((part.power * 0.5 + skill * 1.5) * this.rng.range(0.9, 1.1));
    // Mend whichever friendly part is furthest from full, self included.
    let target = null, slot = null, worst = 1.0;
    for (const a of [bot, ...this.alliesOf(bot)]) {
      if (Math.hypot(a.pos.x - bot.pos.x, a.pos.z - bot.pos.z) > 16) continue;
      for (const s of SLOTS) {
        const st = a.parts[s];
        if (st.destroyed) continue;
        const ratio = st.armor / st.maxArmor;
        if (ratio < worst) { worst = ratio; target = a; slot = s; }
      }
    }
    if (!target) return;
    const st = target.parts[slot];
    const healed = Math.min(amount, st.maxArmor - st.armor);
    st.armor += healed;
    this.emit('repair', { botId: bot.id, targetBotId: target.id, slot, healed, at: partCenter(target, slot) });
  }

  raiseGuard(bot, part) {
    const skill = this.skill(bot, 'GUARD');
    const duration = 1.5 + skill * 0.2;
    bot.guardUntil = this.time + duration;
    this.emit('guard', { botId: bot.id, duration });
  }

  damageOf(bot, part) {
    return (part.power + this.skill(bot, part.type) * 3) * this.rng.range(0.9, 1.1);
  }

  angleBetween(a, b) {
    const dot = clamp(a.x * b.x + a.z * b.z, -1, 1);
    return Math.acos(dot);
  }

  /* ---------------------------------------------------------- projectiles */

  stepProjectiles(dt) {
    const hw = this.arena.width / 2, hd = this.arena.depth / 2;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const dist = Math.hypot(p.vx, p.vy, p.vz) * dt;
      const steps = Math.max(1, Math.ceil(dist / 0.3));
      let consumed = false;

      for (let s = 0; s < steps && !consumed; s++) {
        p.x += (p.vx * dt) / steps;
        p.y += (p.vy * dt) / steps;
        p.z += (p.vz * dt) / steps;

        for (const foe of this.bots) {
          if (!foe.functional || foe.side === p.side) continue;
          const slot = hitPartAt(foe, p.x, p.y, p.z, p.radius);
          if (!slot) continue;
          const owner = this.bot(p.ownerId);
          if (owner) owner.stats.shotsHit++;
          this.damage(foe, slot, p.damage, owner, null, { x: p.x, y: p.y, z: p.z }, p.actionType);
          consumed = true;
          break;
        }
        if (consumed) break;

        if (p.y <= 0.05 || Math.abs(p.x) > hw || Math.abs(p.z) > hd) {
          this.emit('impact', { at: { x: p.x, y: Math.max(0.05, p.y), z: p.z }, family: p.family });
          consumed = true; break;
        }
        for (const [bx, bz, bhw, bhd, bh] of this.arena.blocks) {
          if (p.y <= bh && Math.abs(p.x - bx) <= bhw + p.radius && Math.abs(p.z - bz) <= bhd + p.radius) {
            this.emit('impact', { at: { x: p.x, y: p.y, z: p.z }, family: p.family });
            consumed = true; break;
          }
        }
      }

      p.life -= dt;
      if (consumed || p.life <= 0) this.projectiles.splice(i, 1);
    }
  }

  /** First thing an aim ray meets: an enemy part, or cover. */
  raycast(origin, dir, maxDist, fromSide, ignoreId) {
    const step = 0.28;
    for (let d = 0.4; d < maxDist; d += step) {
      const x = origin.x + dir.x * d, y = origin.y + dir.y * d, z = origin.z + dir.z * d;
      if (y <= 0.03) return { point: { x, y: 0.03, z }, bot: null };
      for (const bot of this.bots) {
        if (!bot.functional || bot.id === ignoreId) continue;
        if (fromSide !== undefined && bot.side === fromSide) continue;
        const slot = hitPartAt(bot, x, y, z, 0);
        if (slot) return { point: { x, y, z }, bot, slot };
      }
      for (const [bx, bz, bhw, bhd, bh] of this.arena.blocks) {
        if (y <= bh && Math.abs(x - bx) <= bhw && Math.abs(z - bz) <= bhd) return { point: { x, y, z }, bot: null };
      }
      if (Math.abs(x) > this.arena.width / 2 || Math.abs(z) > this.arena.depth / 2) return { point: { x, y, z }, bot: null };
    }
    return null;
  }

  rayAgainstBot(bot, origin, dir, maxDist) {
    for (let d = 0.2; d < maxDist; d += 0.2) {
      const x = origin.x + dir.x * d, y = origin.y + dir.y * d, z = origin.z + dir.z * d;
      const slot = hitPartAt(bot, x, y, z, 0.12);
      if (slot) return { slot, point: { x, y, z } };
    }
    return null;
  }

  /* --------------------------------------------------------------- damage */

  damage(target, slot, rawAmount, source, part = null, at = null, actionType = null) {
    const st = target.parts[slot];
    if (!st || st.destroyed || !target.functional) return false;

    const type = actionType ?? part?.type ?? 'SHOOT';
    const legs = legsStats(target);
    // Defense is proportional, never a flat subtraction. Subtracting it outright let a
    // heavy chassis reduce a light weapon to zero and made tank-vs-tank unwinnable;
    // this way armour makes you durable without making you immune.
    const ignoresDefense = type === 'BREAK';
    let dmg = rawAmount * (ignoresDefense ? 1 : 1 - legs.defense / (legs.defense + 120));
    if (this.time < target.guardUntil) dmg *= 0.6;
    if (this.time < target.braceUntil) dmg *= 0.6;
    dmg = Math.max(1, Math.round(dmg));

    st.armor -= dmg;
    target.stats.damageTaken += dmg;
    if (source) source.stats.damageDealt += dmg;

    // The medaforce gauge is filled by punishment, not by dealing it.
    target.medaforce = Math.min(MEDAFORCE_FULL, target.medaforce + dmg * 0.5);

    const destroyed = st.armor <= 0;
    if (destroyed) { st.armor = 0; st.destroyed = true; }

    this.emit('hit', {
      botId: source?.id ?? null, targetBotId: target.id, slot,
      damage: dmg, destroyed, actionType: type,
      at: at ?? partCenter(target, slot),
    });

    if (destroyed) {
      if (source) source.stats.partsWrecked++;
      this.emit('part-destroyed', { botId: target.id, slot, by: source?.id ?? null, at: partCenter(target, slot) });
      if (slot === 'head') this.takeDown(target, source);
    }
    return destroyed;
  }

  takeDown(target, source) {
    target.functional = false;
    target.downAt = this.time;
    target.windup = null;
    target.dash = null;
    this.emit('bot-down', { botId: target.id, leader: target.isLeader, by: source?.id ?? null });
    this.checkEnd();
  }

  checkEnd() {
    if (this.finished) return;
    for (const side of [0, 1]) {
      if (!this.leaderOf(side).functional) return this.finish(1 - side, 'leader');
      if (this.teams[side].bots.every((b) => !b.functional)) return this.finish(1 - side, 'wipeout');
    }
  }

  /**
   * Nobody landed a killing blow before the clock ran out, so the match is awarded on
   * points the way a real bout would be: robots still standing first, then damage dealt,
   * then remaining armour. Judging on armour alone would hand the win to whichever team
   * simply brought the thickest plating and hid behind it.
   */
  decideOnTime() {
    const score = (side) => {
      const bots = this.teams[side].bots;
      return {
        standing: bots.filter((b) => b.functional).length,
        dealt: bots.reduce((n, b) => n + b.stats.damageDealt, 0),
        armor: bots.reduce((n, b) => n + (b.functional ? partHealth(b) : 0), 0),
      };
    };
    const a = score(0), b = score(1);
    let winner = -1;
    if (a.standing !== b.standing) winner = a.standing > b.standing ? 0 : 1;
    else if (Math.abs(a.dealt - b.dealt) > 1) winner = a.dealt > b.dealt ? 0 : 1;
    else if (Math.abs(a.armor - b.armor) > 0.001) winner = a.armor > b.armor ? 0 : 1;
    this.finish(winner, 'time');
  }

  finish(winner, reason) {
    if (this.finished) return;
    this.finished = true;
    this.result = { winner, reason, time: this.time };
    this.emit('end', this.result);
  }

  forfeit(side) { if (!this.finished) this.finish(1 - side, 'forfeit'); }

  /* ----------------------------------------------------------- medaforce */

  fireMedaforce(bot, aim) {
    const kind = bot.medal.medaforce;
    const force = MEDAFORCE[kind];
    const skill = Math.max(...Object.values(bot.medal.skills));
    const power = force.power + skill * 2;
    bot.medaforce = 0;
    bot.forceReady = false;
    this.emit('medaforce', { botId: bot.id, kind, name: force.name, at: { ...bot.pos } });

    const muzzle = muzzleOf(bot, 'head');
    if (kind === 'MEND') {
      for (const a of [bot, ...this.alliesOf(bot)]) {
        for (const s of SLOTS) {
          const st = a.parts[s];
          if (st.destroyed || st.armor >= st.maxArmor) continue;
          const healed = Math.min(power, st.maxArmor - st.armor);
          st.armor += healed;
          this.emit('repair', { botId: bot.id, targetBotId: a.id, slot: s, healed, at: partCenter(a, s) });
        }
      }
      return;
    }
    if (kind === 'QUAKE') {
      for (const foe of this.enemiesOf(bot)) {
        if (Math.hypot(foe.pos.x - bot.pos.x, foe.pos.z - bot.pos.z) > 18) continue;
        const live = SLOTS.filter((s) => !foe.parts[s].destroyed);
        if (!live.length) continue;
        this.damage(foe, this.rng.pick(live), power, bot, null, partCenter(foe, 'legs'), 'BREAK');
      }
      return;
    }
    if (kind === 'BARRAGE') {
      const hit = this.raycast(muzzle, aim, 40, bot.side, bot.id);
      if (!hit?.bot) return;
      for (const s of SLOTS) {
        if (hit.bot.parts[s].destroyed) continue;
        this.damage(hit.bot, s, power, bot, null, partCenter(hit.bot, s), 'SHOOT');
      }
      return;
    }
    // PIERCE and SEVER are single-part finishers along the aim line.
    const hit = this.raycast(muzzle, aim, 46, bot.side, bot.id);
    if (!hit?.bot) return;
    const st = hit.bot.parts[hit.slot];
    let dmg = power;
    if (kind === 'SEVER' && st.armor <= st.maxArmor * 0.5) dmg = st.armor;   // clean amputation
    this.damage(hit.bot, hit.slot, dmg, bot, null, hit.point, 'BREAK');
  }

  /* -------------------------------------------------------------------- AI */

  think(bot, dt) {
    const sharp = clamp(this.difficulty / 5, 0.2, 1);
    const ai = bot.ai;
    const foes = this.enemiesOf(bot);
    if (!foes.length) { bot.input.mx = bot.input.mz = 0; return; }

    if (this.time >= ai.nextThink) {
      ai.nextThink = this.time + this.rng.range(0.25, 0.55) * (2 - sharp);
      ai.targetId = this.pickTarget(bot, foes, sharp)?.id ?? null;
    }
    let target = ai.targetId ? this.bot(ai.targetId) : null;
    if (!target || !target.functional) { target = foes[0]; ai.targetId = target.id; }

    const dx = target.pos.x - bot.pos.x, dz = target.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const ux = dx / dist, uz = dz / dist;

    // Face the target, easing round so the AI does not snap like a turret.
    const want = Math.atan2(ux, uz);
    let diff = want - bot.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.facing += clamp(diff, -6 * dt, 6 * dt);

    const usable = usableActions(bot);
    const ranges = usable.map((s) => RANGE_OF[bot.parts[s].part.type] ?? 12);
    const want_range = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 12;

    if (this.time >= ai.nextStrafe) {
      ai.nextStrafe = this.time + this.rng.range(0.8, 2.2);
      ai.strafe = this.rng.chance(0.5) ? 1 : -1;
    }
    // Close, back off, or hold -- then always drift sideways so it is not a standing target.
    let mx = 0, mz = 0;
    const band = want_range * 0.22;
    if (dist > want_range + band) { mx += ux; mz += uz; }
    else if (dist < want_range - band) { mx -= ux; mz -= uz; }
    const strafeStrength = 0.55 + sharp * 0.35;
    mx += -uz * ai.strafe * strafeStrength;
    mz += ux * ai.strafe * strafeStrength;
    bot.input.mx = mx; bot.input.mz = mz;

    if (bot.windup || bot.lock > this.time) return;
    if (this.teams[bot.side].passive) return;

    if (canMedaforce(bot) && this.rng.chance(0.02 + sharp * 0.04)) {
      this.tryAction(bot.id, 'medaforce', { x: ux, y: 0.12, z: uz });
      return;
    }
    // Dodge-dash, more often the sharper the opponent.
    if (this.rng.chance(dt * (0.25 + sharp * 0.9)) && bot.energy > 45) {
      this.tryAction(bot.id, 'legs');
      return;
    }

    const ready = readyActions(bot, this.time).filter((s) => {
      const t = bot.parts[s].part.type;
      if (t === 'MELEE' || t === 'BREAK') return dist <= MELEE_RANGE;
      if (t === 'REPAIR') return this.needsRepair(bot);
      if (t === 'GUARD') return this.rng.chance(0.25);
      return true;
    });
    if (!ready.length) return;

    const slot = this.pickWeapon(bot, ready, dist, sharp);
    const part = bot.parts[slot].part;
    if (part.type === 'REPAIR' || part.type === 'GUARD') { this.tryAction(bot.id, slot); return; }

    const aimSlot = this.pickAimPart(bot, target, part, sharp);
    const muzzle = muzzleOf(bot, slot);
    const aimAt = partCenter(target, aimSlot);
    // Lead the shot; a sharper opponent leads it better.
    const projSpeed = (PROJECTILE[part.type] ?? PROJECTILE.SHOOT).speed;
    const travel = dist / projSpeed;
    const lead = part.type === 'LASER' ? 0 : travel * (0.55 + sharp * 0.6);
    const aim = norm({
      x: aimAt.x + target.vel.x * lead - muzzle.x,
      y: aimAt.y - muzzle.y,
      z: aimAt.z + target.vel.z * lead - muzzle.z,
    });
    if (part.type !== 'MELEE' && part.type !== 'BREAK' &&
        blockedByCover(this.arena, muzzle.x, muzzle.y, muzzle.z, aimAt.x, aimAt.y, aimAt.z)) return;

    // Sloppier opponents simply aim worse.
    const wobble = (1 - sharp) * 0.09;
    this.tryAction(bot.id, slot, this.jitter(aim, wobble));
  }

  needsRepair(bot) {
    for (const a of [bot, ...this.alliesOf(bot)]) {
      for (const s of SLOTS) {
        const st = a.parts[s];
        if (!st.destroyed && st.armor < st.maxArmor * 0.6) return true;
      }
    }
    return false;
  }

  pickTarget(bot, foes, sharp) {
    const leader = foes.find((f) => f.isLeader);
    if (leader && this.rng.chance(0.15 + sharp * 0.3)) return leader;
    // Otherwise the closest thing worth shooting, weighted toward wounded robots.
    let best = foes[0], bestScore = -Infinity;
    for (const f of foes) {
      const d = Math.hypot(f.pos.x - bot.pos.x, f.pos.z - bot.pos.z);
      const score = -d * 0.6 + (1 - partHealth(f)) * 22 * sharp;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  pickWeapon(bot, ready, dist, sharp) {
    if (this.rng.chance(1 - sharp)) return this.rng.pick(ready);
    let best = ready[0], bestScore = -Infinity;
    for (const s of ready) {
      const p = bot.parts[s].part;
      const ideal = RANGE_OF[p.type] ?? 12;
      const fit = 1 / (1 + Math.abs(dist - ideal) / 8);
      const score = (p.power + this.skill(bot, p.type) * 3) * fit;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  pickAimPart(bot, target, part, sharp) {
    const live = SLOTS.filter((s) => !target.parts[s].destroyed);
    if (!live.length) return 'legs';
    if (this.rng.chance(0.35 * (1 - sharp))) return this.rng.pick(live);

    const est = part.power + this.skill(bot, part.type) * 3;
    let best = live[0], bestScore = -Infinity;
    for (const s of live) {
      const st = target.parts[s];
      const ratio = st.armor / st.maxArmor;
      let score = -st.armor * 0.1;
      if (est >= st.armor) score += 180;                 // finish it now
      if (s === 'head') {
        score -= 80;                                     // small target, deepest armour
        if (ratio < 0.45) score += (target.isLeader ? 300 : 150) * sharp;
      } else if (s === 'legs') score += 25 * sharp;
      else score += (25 + st.part.power * 0.5) * sharp;  // silence the dangerous arm first
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }
}
