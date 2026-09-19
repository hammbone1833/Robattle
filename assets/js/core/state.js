/**
 * Save state.
 *
 * Everything the player owns lives here and is mirrored into localStorage, so the site
 * needs no account and no server. Parts are either equipped on one of your three
 * medabots or sitting in the garage inventory -- never both -- which keeps "what do I
 * own" answerable by looking in exactly two places.
 */

import { getPart, SLOTS, familyLoadout } from '../data/parts.js';
import { STARTER_MEDALS, getMedal } from '../data/medals.js';

const KEY = 'robattle3d.save.v2';

function starterTeam() {
  const cadet = familyLoadout('cadet');
  return [
    { name: 'Vanguard', medal: 'beetle', parts: { ...cadet } },
    { name: 'Flank', medal: 'stag', parts: { ...cadet } },
    { name: 'Anchor', medal: 'tortoise', parts: { ...cadet } },
  ];
}

function defaultData() {
  return {
    version: 2,
    name: 'Rookie',
    rodo: 900,
    rating: 1000,
    record: { wins: 0, losses: 0, draws: 0 },
    team: starterTeam(),
    leader: 0,
    // Spare parts so the garage is not empty on the first visit.
    inventory: { 'cadet-optic': 1, 'cadet-pistol': 1, 'cadet-shield': 1, 'cadet-strider': 1, 'hornet-repeat': 1 },
    medals: [...STARTER_MEDALS],
    medalExp: {},
    cupsWon: [],
    eventsClaimed: [],
    defeated: {},
    battles: 0,
    createdAt: new Date().toISOString(),
  };
}

export class GameState {
  constructor(data) {
    this.data = data ?? defaultData();
    this.listeners = new Set();
  }

  static load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return new GameState();
      const parsed = JSON.parse(raw);
      const state = new GameState({ ...defaultData(), ...parsed });
      state.validate();
      return state;
    } catch {
      // A corrupt or half-written save should never lock a player out of the game.
      return new GameState();
    }
  }

  /** Drop anything that no longer exists in the catalogue, so old saves still load. */
  validate() {
    const d = this.data;
    d.medals = d.medals.filter((m) => { try { getMedal(m); return true; } catch { return false; } });
    if (!d.medals.length) d.medals = [...STARTER_MEDALS];
    for (const [id, n] of Object.entries(d.inventory)) {
      let ok = true;
      try { getPart(id); } catch { ok = false; }
      if (!ok || !(n > 0)) delete d.inventory[id];
    }
    if (!Array.isArray(d.team) || d.team.length !== 3) d.team = starterTeam();
    d.team.forEach((bot, i) => {
      if (!d.medals.includes(bot.medal)) bot.medal = d.medals[i % d.medals.length];
      for (const slot of SLOTS) {
        let ok = true;
        try { ok = getPart(bot.parts?.[slot]).slot === slot; } catch { ok = false; }
        if (!ok) bot.parts[slot] = familyLoadout('cadet')[slot];
      }
    });
    d.leader = Math.max(0, Math.min(2, d.leader ?? 0));
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode, keep playing */ }
    for (const fn of this.listeners) fn(this.data);
  }
  reset() { this.data = defaultData(); this.save(); }

  /* ------------------------------------------------------------- economy */

  get rodo() { return this.data.rodo; }
  canAfford(n) { return this.data.rodo >= n; }
  earn(n) { this.data.rodo += Math.round(n); this.save(); }
  spend(n) {
    if (!this.canAfford(n)) return false;
    this.data.rodo -= Math.round(n);
    this.save();
    return true;
  }

  /* ----------------------------------------------------------- inventory */

  countOf(id) { return this.data.inventory[id] ?? 0; }
  addPart(id, n = 1) {
    getPart(id);
    this.data.inventory[id] = (this.data.inventory[id] ?? 0) + n;
    this.save();
  }
  removePart(id, n = 1) {
    const have = this.countOf(id);
    if (have < n) return false;
    if (have === n) delete this.data.inventory[id];
    else this.data.inventory[id] = have - n;
    this.save();
    return true;
  }
  /** Every part id the player owns, equipped or not. */
  ownedParts() {
    const all = new Map();
    for (const [id, n] of Object.entries(this.data.inventory)) all.set(id, n);
    for (const bot of this.data.team) {
      for (const slot of SLOTS) all.set(bot.parts[slot], (all.get(bot.parts[slot]) ?? 0) + 1);
    }
    return all;
  }

  hasMedal(id) { return this.data.medals.includes(id); }
  addMedal(id) {
    getMedal(id);
    if (!this.hasMedal(id)) { this.data.medals.push(id); this.save(); }
  }

  /* --------------------------------------------------------------- team */

  /**
   * Fit a part from the inventory onto a medabot; whatever came off goes back to the
   * inventory, so a swap never destroys anything.
   */
  equip(botIndex, slot, partId) {
    const part = getPart(partId);
    if (part.slot !== slot) return false;
    const bot = this.data.team[botIndex];
    if (!bot) return false;
    if (bot.parts[slot] === partId) return true;
    if (!this.countOf(partId)) return false;

    const previous = bot.parts[slot];
    this.removePart(partId, 1);
    bot.parts[slot] = partId;
    if (previous) this.addPart(previous, 1);
    this.save();
    return true;
  }

  setMedal(botIndex, medalId) {
    if (!this.hasMedal(medalId)) return false;
    const bot = this.data.team[botIndex];
    if (!bot) return false;
    bot.medal = medalId;
    this.save();
    return true;
  }

  setLeader(index) {
    this.data.leader = Math.max(0, Math.min(2, index));
    this.save();
  }

  renameBot(index, name) {
    const clean = String(name ?? '').trim().slice(0, 16);
    if (!clean) return false;
    this.data.team[index].name = clean;
    this.save();
    return true;
  }

  loadoutOf(index) { return { ...this.data.team[index].parts }; }

  /** The team in the shape the combat engine wants, carrying banked medal experience. */
  teamSpec(name = 'Your Team') {
    return {
      name,
      ai: false,
      leader: this.data.leader,
      bots: this.data.team.map((b) => ({
        name: b.name,
        medal: b.medal,
        parts: { ...b.parts },
        medalExp: { ...(this.data.medalExp[b.medal] ?? {}) },
      })),
    };
  }

  /** Bank the experience each medal earned during a battle. */
  absorbMedalExp(combatTeam) {
    for (const bot of combatTeam.bots) {
      const id = bot.medal.id;
      const bank = this.data.medalExp[id] ?? (this.data.medalExp[id] = {});
      for (const [type, value] of Object.entries(bot.medalExp)) {
        bank[type] = Math.max(bank[type] ?? 0, value);
      }
    }
    this.save();
  }

  /* ------------------------------------------------------------- records */

  recordResult({ won, draw = false, opponentId, ratingDelta = 0 }) {
    const d = this.data;
    d.battles += 1;
    if (draw) d.record.draws += 1;
    else if (won) d.record.wins += 1;
    else d.record.losses += 1;
    d.rating = Math.max(100, Math.round(d.rating + ratingDelta));
    if (won && opponentId) d.defeated[opponentId] = (d.defeated[opponentId] ?? 0) + 1;
    this.save();
  }

  winCup(cupId) {
    if (!this.data.cupsWon.includes(cupId)) { this.data.cupsWon.push(cupId); this.save(); }
  }
  hasWonCup(cupId) { return this.data.cupsWon.includes(cupId); }

  claimEvent(key) {
    if (this.data.eventsClaimed.includes(key)) return false;
    this.data.eventsClaimed.push(key);
    // Only the last few keys matter; the rest is dead weight in the save file.
    if (this.data.eventsClaimed.length > 40) this.data.eventsClaimed = this.data.eventsClaimed.slice(-40);
    this.save();
    return true;
  }
  hasClaimedEvent(key) { return this.data.eventsClaimed.includes(key); }
}
