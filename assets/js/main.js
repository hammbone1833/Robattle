/**
 * ROBATTLE 3D -- application shell.
 *
 * Owns the one WebGL renderer, the single animation loop, and the switch between the two
 * 3D scenes (the village you walk around and the arena you fight in). Everything else --
 * rules, save state, screens -- lives in its own module; this file is the wiring.
 */

import * as THREE from '../../vendor/three.module.js';
import { GameState } from './core/state.js';
import { Combat } from './core/combat.js';
import { ratingDelta } from './core/leaderboard.js';
import { VillageScene } from './render/village.js';
import { ArenaScene } from './render/arena.js';
import { Hud } from './ui/hud.js';
import { el, openPanel, closePanel, panelIsOpen, toast, confirmPanel } from './ui/shell.js';
import { TouchControls, toggleFullscreen } from './ui/touch.js';
import { loadSettings, resolveControls, resolveQuality, onSettingsChange } from './core/settings.js';
import {
  openGarage, openShop, openGym, openTournaments, openLeaderboard, openEvents, openHelp,
  openSettings, openResults,
} from './ui/panels.js';
import { getOpponent, lootPool } from './data/roster.js';
import { getCup } from './data/tournaments.js';
import { getPart, familyLoadout } from './data/parts.js';
import { makeRng } from './core/rng.js';

const PANELS = {
  garage: openGarage, shop: openShop, gym: openGym, tournaments: openTournaments,
  leaderboard: openLeaderboard, events: openEvents, help: openHelp, settings: openSettings,
};

class App {
  constructor() {
    this.state = GameState.load();
    this.canvas = document.getElementById('scene');
    this.overlay = document.getElementById('overlay');
    this.mode = 'boot';
    this.scene = null;
    this.combat = null;
    this.hud = null;
    this.cup = null;
    this.touch = null;
    this.lastFrame = performance.now();
    this.settings = loadSettings();
    this.quality = resolveQuality(this.settings);
    /** 'keyboard' or 'touch' -- the detector's guess unless the player overrode it. */
    this.controls = resolveControls(this.settings);
    this.isTouch = this.controls === 'touch';
    // Scenes must ignore input while a panel is up, or keys leak into the game behind it.
    this.blocked = () => panelIsOpen();
  }

  /* ---------------------------------------------------------------- boot */

  start() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality.antialias,
      powerPreference: 'high-performance',
    });
    // Phones report pixel ratios of 3 or more; rendering at native resolution there costs
    // roughly nine times the fragments for a screen too small to show the difference.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio));
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = this.quality.shadowMapSize > 512 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    document.body.classList.toggle('touch', this.isTouch);
    onSettingsChange(() => this.applySettings());

    this.resize();
    window.addEventListener('resize', () => this.resize());

    for (const btn of document.querySelectorAll('#nav button')) {
      btn.addEventListener('click', () => this.openPanel(btn.dataset.panel));
    }
    document.getElementById('fullscreen-btn').addEventListener('click', async () => {
      const on = await toggleFullscreen();
      // The viewport changes size on the way in and out of fullscreen.
      setTimeout(() => this.resize(), 120);
      if (!on && this.isTouch) toast('Fullscreen is unavailable in this browser.', 'bad');
    });
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.setupRotateHint();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && panelIsOpen()) { closePanel(); return; }
      // Number keys are weapons in a fight, so only treat them as shortcuts in the village.
      if (this.mode !== 'village' || panelIsOpen()) return;
      const map = { KeyG: 'garage', KeyB: 'shop', KeyT: 'tournaments', KeyL: 'leaderboard', KeyV: 'events', KeyH: 'help', KeyO: 'settings' };
      if (map[e.code]) this.openPanel(map[e.code]);
    });

    this.refreshStats();
    this.enterVillage();
    this.applySettings();

    const boot = document.getElementById('boot');
    boot.classList.add('gone');
    setTimeout(() => boot.remove(), 600);

    this.loop();
  }

  /**
   * Re-apply preferences without a reload. Control scheme and sensitivity switch live;
   * the parts of a quality tier that are baked into a scene at build time (shadow map
   * size, crowd count) come in with the next scene, which is said out loud rather than
   * silently ignored.
   */
  applySettings() {
    const settings = loadSettings();
    const prevControls = this.controls;
    const prevQuality = this.quality;

    this.settings = settings;
    this.controls = resolveControls(settings);
    this.isTouch = this.controls === 'touch';
    this.quality = resolveQuality(settings);
    document.body.classList.toggle('touch', this.isTouch);

    if (this.scene?.input) {
      this.scene.input.sensitivity = settings.sensitivity;
      this.scene.input.invertY = settings.invertY;
      // A keyboard player wants the pointer captured; a touch player must never be.
      this.scene.input.usePointerLock = this.controls === 'keyboard' && 'pointerLockElement' in document;
      if (!this.scene.input.usePointerLock && document.pointerLockElement === this.canvas) {
        document.exitPointerLock?.();
      }
    }

    if (this.controls !== prevControls) {
      this.touch?.dispose();
      this.touch = null;
      if (this.isTouch && this.scene?.input) {
        this.touch = new TouchControls(this.scene.input, this.mode === 'battle' ? 'arena' : 'village');
        if (this.mode === 'village') this.touch.setActionEnabled('interact', !!this.scene.nearby);
      }
    }

    if (this.quality !== prevQuality) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio));
      this.renderer.shadowMap.enabled = this.quality.shadows;
      this.renderer.shadowMap.needsUpdate = true;
      this.resize();
      if (this.mode === 'battle') toast('Graphics changed — fully applies from the next battle.');
      else if (this.mode === 'village') this.enterVillage();
    }
  }

  /**
   * Portrait works, but a twin-stick game wants the wide axis. Nudge once, let the
   * player dismiss it, and never nag again this session.
   */
  setupRotateHint() {
    if (!this.isTouch) return;
    const hint = document.getElementById('rotate-hint');
    let dismissed = false;
    const sync = () => {
      const portrait = window.innerHeight > window.innerWidth;
      document.body.classList.toggle('portrait-hint', portrait && !dismissed);
    };
    hint.addEventListener('click', () => { dismissed = true; sync(); });
    window.addEventListener('resize', sync);
    sync();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.scene?.resize(w, h);
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    // A modal is a pause: no input reaches a scene the player cannot see.
    const paused = panelIsOpen();
    if (!paused && this.scene) this.scene.update(dt);
    if (this.hud) this.hud.update();
    if (this.touch) {
      this.touch.setVisible(!paused);
      if (!paused && this.mode === 'battle') this.touch.syncArena(this.combat?.playerBot, this.combat);
    }
    this.scene?.render();
  }

  /* -------------------------------------------------------------- scenes */

  disposeScene() {
    this.touch?.dispose();
    this.touch = null;
    this.hud?.dispose();
    this.hud = null;
    this.scene?.dispose();
    this.scene = null;
    this.combat = null;
    document.getElementById('prompt').classList.add('hidden');
  }

  enterVillage() {
    this.disposeScene();
    this.mode = 'village';
    document.getElementById('nav').classList.remove('hidden');
    const promptEl = document.getElementById('prompt');

    this.scene = new VillageScene(this.renderer, { canvas: this.canvas, overlay: this.overlay }, {
      loadout: this.state.loadoutOf(this.state.data.leader),
      quality: this.quality,
      blocked: this.blocked,
      onPrompt: (kind, landmark) => {
        if (kind === 'near') {
          // The touch ENTER button only lights up when there is a door to go through.
          this.touch?.setActionEnabled('interact', !!landmark);
          if (!landmark) { promptEl.classList.add('hidden'); return; }
          promptEl.querySelector('.prompt-name').textContent = landmark.label;
          promptEl.querySelector('.prompt-blurb').textContent = landmark.blurb;
          promptEl.classList.remove('hidden');
        } else if (kind === 'enter' && landmark) {
          this.openPanel(landmark.key);
        }
      },
    });
    this.tuneSceneInput();
    if (this.isTouch) this.touch = new TouchControls(this.scene.input, 'village');
    this.resize();
  }

  tuneSceneInput() {
    const input = this.scene?.input;
    if (!input) return;
    input.sensitivity = this.settings.sensitivity;
    input.invertY = this.settings.invertY;
    input.usePointerLock = this.controls === 'keyboard' && 'pointerLockElement' in document;
  }

  openPanel(key) {
    const fn = PANELS[key];
    if (!fn) return;
    if (this.mode === 'battle' && key !== 'help' && key !== 'settings') {
      toast('Finish the Robattle first.', 'bad');
      return;
    }
    fn(this);
  }

  refreshStats() {
    const d = this.state.data;
    document.getElementById('stat-rodo').textContent = d.rodo.toLocaleString();
    document.getElementById('stat-rating').textContent = d.rating;
    document.getElementById('stat-record').textContent = `${d.record.wins}–${d.record.losses}`;
  }

  refreshAvatar() {
    if (this.mode === 'village' && this.scene?.setLoadout) {
      this.scene.setLoadout(this.state.loadoutOf(this.state.data.leader));
    }
  }

  /* ------------------------------------------------------------- battles */

  /**
   * Put the player into a Robattle.
   * @param {object} cfg
   * @param {object} cfg.enemyTeam   team spec for the opposition
   * @param {string} cfg.arena
   * @param {number} cfg.difficulty
   * @param {object} [cfg.condition] per-bot carried damage, for cup rounds
   * @param {function} cfg.onEnd     receives ({ combat, result, won, draw })
   */
  startBattle(cfg) {
    this.disposeScene();
    this.mode = 'battle';
    document.getElementById('nav').classList.add('hidden');

    const playerTeam = this.state.teamSpec();
    if (cfg.condition) {
      playerTeam.bots.forEach((b, i) => { b.condition = cfg.condition[i]; });
    }

    const combat = new Combat({
      teams: [playerTeam, cfg.enemyTeam],
      arena: cfg.arena,
      difficulty: cfg.difficulty ?? 3,
      timeLimit: cfg.timeLimit,
      seed: (Math.random() * 1e9) | 0,
    });
    combat.playerBotId = combat.teams[0].bots[this.state.data.leader].id;
    this.combat = combat;

    this.scene = new ArenaScene(this.renderer, combat,
      { canvas: this.canvas, overlay: this.overlay },
      { quality: this.quality, blocked: this.blocked });
    this.scene.onRefused = (slot, why) => {
      // 'cooling' and 'busy' are the normal rhythm of the fight -- flash the button
      // instead of stacking toasts over the arena every time the player leans on a key.
      const quiet = { cooling: true, busy: true };
      this.hud?.flashAction(slot, quiet[why] ? 'cooling' : 'denied');
      if (quiet[why]) return;
      const words = { destroyed: 'That part is wrecked.', empty: 'No uses left on that head weapon.', 'no-energy': 'Not enough energy to boost.', 'not-charged': 'Medaforce is not charged yet.' };
      if (words[why]) toast(words[why], 'bad');
    };
    this.tuneSceneInput();
    if (this.isTouch) this.touch = new TouchControls(this.scene.input, 'arena');
    this.hud = new Hud(combat, this.scene);
    this.hud.setForfeitHandler(() => {
      if (combat.finished) return;
      // One stray thumb should not throw a Robattle away.
      confirmPanel({
        title: 'Forfeit this Robattle?',
        message: 'You will lose the match, the prize money and any salvage. In a cup run it ends the whole cup.',
        confirmLabel: 'Forfeit',
        danger: true,
        onConfirm: () => combat.forfeit(0),
      });
    });
    this.resize();

    combat.on((ev) => {
      if (ev.type !== 'end') return;
      // Let the last explosion play before the verdict lands on top of it.
      setTimeout(() => {
        const won = ev.winner === 0;
        const draw = ev.winner === -1;
        this.state.absorbMedalExp(combat.teams[0]);
        cfg.onEnd({ combat, result: ev, won, draw });
      }, 1200);
    });

    toast(`${cfg.label ?? 'Robattle'} — wreck the enemy leader's head to win.`);
  }

  /** Damage each of the player's medabots is carrying, as ratios, for the next round. */
  conditionFrom(combat) {
    return combat.teams[0].bots.map((b) => {
      const out = {};
      for (const slot of ['head', 'rarm', 'larm', 'legs']) {
        out[slot] = b.parts[slot].armor / b.parts[slot].maxArmor;
      }
      return out;
    });
  }

  enemyTeamFor(opponentId) {
    const op = getOpponent(opponentId);
    return { spec: { name: op.name, ai: true, leader: op.leader, bots: op.bots }, op };
  }

  /* ------------------------------------------------------------- flavours */

  /** A one-off ranked bout: pays money, loot and rating. */
  startExhibition(opponentId) {
    const { spec, op } = this.enemyTeamFor(opponentId);
    this.startBattle({
      enemyTeam: spec, arena: op.arena, difficulty: op.tier, label: op.name,
      onEnd: ({ combat, result, won, draw }) => this.settleRanked({ combat, result, won, draw, op }),
    });
  }

  settleRanked({ result, won, draw, op, extra = {} }) {
    const delta = ratingDelta(this.state.data.rating, op.tier, won, draw);
    const rodo = won ? op.reward : Math.round(op.reward * 0.15);
    let loot = null;
    if (won) {
      const rng = makeRng((Math.random() * 1e9) | 0);
      loot = rng.pick(lootPool(op));
      this.state.addPart(loot);
    }
    this.state.earn(rodo);
    this.state.recordResult({ won, draw, opponentId: op.id, ratingDelta: delta });
    this.refreshStats();

    openResults(this, {
      won, draw, reason: result.reason, rodo, ratingDelta: delta, loot,
      note: won ? 'Salvage rights: one part stripped from the losing team.' : 'You keep a small appearance fee. Nothing else.',
      ...extra,
    }, [
      el('button', { class: 'btn', text: 'Rematch', onclick: () => { closePanel(); this.startExhibition(op.id); } }),
      el('button', {
        class: 'btn btn-primary', text: 'Back to the village', style: 'margin-left:auto',
        onclick: () => { closePanel(); this.enterVillage(); },
      }),
    ]);
  }

  /** Gym: no stakes at all. */
  startTraining({ opponentId, passive = false } = {}) {
    let enemyTeam, arena, difficulty, label;
    if (passive) {
      enemyTeam = {
        name: 'Training Frames', ai: true, passive: true, leader: 0,
        bots: [0, 1, 2].map((i) => ({ name: `Frame ${i + 1}`, medal: 'beetle', parts: familyLoadout('cadet') })),
      };
      arena = 'gym';
      difficulty = 1;
      label = 'Target drill';
    } else {
      const { spec, op } = this.enemyTeamFor(opponentId);
      enemyTeam = spec;
      arena = 'gym';
      difficulty = op.tier;
      label = `Sparring: ${op.name}`;
    }

    this.startBattle({
      enemyTeam, arena, difficulty, label,
      onEnd: ({ result, won, draw }) => {
        openResults(this, {
          won, draw, reason: result.reason, title: 'Practice over',
          note: 'Practice results are not recorded. No Rodo, no rating, no salvage.',
        }, [
          el('button', { class: 'btn', text: 'Go again', onclick: () => { closePanel(); this.startTraining({ opponentId, passive }); } }),
          el('button', {
            class: 'btn btn-primary', text: 'Back to the village', style: 'margin-left:auto',
            onclick: () => { closePanel(); this.enterVillage(); },
          }),
        ]);
      },
    });
  }

  /* ----------------------------------------------------------------- cups */

  startCup(cupId) {
    const cup = getCup(cupId);
    if (!this.state.spend(cup.entry)) { toast('You cannot cover the entry fee.', 'bad'); return; }
    this.refreshStats();
    this.cup = { cup, round: 0, condition: null, earned: 0 };
    this.runCupRound();
  }

  runCupRound() {
    const run = this.cup;
    const { spec, op } = this.enemyTeamFor(run.cup.rounds[run.round]);
    this.startBattle({
      enemyTeam: spec, arena: op.arena, difficulty: op.tier, condition: run.condition,
      label: `${run.cup.name} — round ${run.round + 1} of ${run.cup.rounds.length}`,
      onEnd: ({ combat, result, won, draw }) => this.settleCupRound({ combat, result, won, draw, op }),
    });
  }

  settleCupRound({ combat, result, won, draw, op }) {
    const run = this.cup;
    const last = run.round === run.cup.rounds.length - 1;

    if (!won) {
      const delta = ratingDelta(this.state.data.rating, op.tier, false, draw);
      this.state.recordResult({ won: false, draw, opponentId: op.id, ratingDelta: delta });
      this.refreshStats();
      this.cup = null;
      openResults(this, {
        won: false, draw, reason: result.reason, ratingDelta: delta,
        title: `${run.cup.name} — eliminated`,
        note: `Knocked out in round ${run.round + 1}. The entry fee is gone; everything else you own is untouched.`,
      }, [el('button', {
        class: 'btn btn-primary', text: 'Back to the village', style: 'margin-left:auto',
        onclick: () => { closePanel(); this.enterVillage(); },
      })]);
      return;
    }

    const roundPurse = Math.round(op.reward * 0.6);
    const delta = ratingDelta(this.state.data.rating, op.tier, true, false);
    this.state.earn(roundPurse);
    this.state.recordResult({ won: true, opponentId: op.id, ratingDelta: delta });
    run.earned += roundPurse;
    run.condition = this.conditionFrom(combat);
    this.refreshStats();

    if (!last) {
      run.round += 1;
      const next = getOpponent(run.cup.rounds[run.round]);
      openResults(this, {
        won: true, reason: result.reason, rodo: roundPurse, ratingDelta: delta,
        title: `${run.cup.name} — round ${run.round} won`,
        note: `Next up: ${next.name}. Your damage carries over — you get field repairs, not a rebuild.`,
      }, [
        el('button', {
          class: 'btn btn-danger', text: 'Withdraw',
          onclick: () => { closePanel(); this.cup = null; this.enterVillage(); },
        }),
        el('button', {
          class: 'btn btn-primary', text: `Round ${run.round + 1}: ${next.name}`, style: 'margin-left:auto',
          onclick: () => { closePanel(); this.runCupRound(); },
        }),
      ]);
      return;
    }

    // Cup won.
    const prize = run.cup.prize;
    this.state.earn(prize.rodo);
    this.state.addPart(prize.part);
    this.state.data.rating += prize.rating;
    this.state.winCup(run.cup.id);
    this.state.save();
    this.refreshStats();
    this.cup = null;

    openResults(this, {
      won: true, reason: result.reason, rodo: prize.rodo + roundPurse,
      ratingDelta: delta + prize.rating, prize: prize.part,
      title: `${run.cup.name} — champions`,
      note: 'Cup taken. The prize part is in your garage.',
    }, [el('button', {
      class: 'btn btn-primary', text: 'Back to the village', style: 'margin-left:auto',
      onclick: () => { closePanel(); this.enterVillage(); },
    })]);
  }

  /* --------------------------------------------------------------- events */

  startEvent(ev) {
    const { spec, op } = this.enemyTeamFor(ev.opponent);
    this.startBattle({
      enemyTeam: spec,
      arena: ev.arena,
      difficulty: ev.modifier?.difficulty ?? op.tier,
      timeLimit: ev.modifier?.timeLimit,
      label: `${ev.name} — ${ev.rule}`,
      onEnd: ({ result, won, draw }) => {
        const delta = ratingDelta(this.state.data.rating, op.tier, won, draw);
        const rodo = won ? Math.round(op.reward * 1.2) : 0;
        let prize = null;
        if (won && this.state.claimEvent(ev.key)) {
          prize = ev.reward;
          this.state.addPart(prize);
        }
        if (rodo) this.state.earn(rodo);
        this.state.recordResult({ won, draw, opponentId: op.id, ratingDelta: delta });
        this.refreshStats();

        openResults(this, {
          won, draw, reason: result.reason, rodo, ratingDelta: delta, prize,
          title: `${ev.name} — ${ev.kind} event`,
          note: won
            ? (prize ? 'Event part claimed. It is yours permanently.' : 'Already claimed this period — no second part.')
            : 'The event stays open until it rotates. Refit and try again.',
        }, [
          el('button', { class: 'btn', text: 'Try again', onclick: () => { closePanel(); this.startEvent(ev); } }),
          el('button', {
            class: 'btn btn-primary', text: 'Back to the village', style: 'margin-left:auto',
            onclick: () => { closePanel(); this.enterVillage(); },
          }),
        ]);
      },
    });
  }
}

/* ------------------------------------------------------------------ boot */

function fail(message, detail) {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.remove('gone');
  boot.querySelector('.boot-status').innerHTML =
    `<span style="color:var(--red)">${message}</span><br><span style="font-size:11px">${detail ?? ''}</span>`;
}

try {
  const probe = document.createElement('canvas');
  const ok = !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  if (!ok) throw new Error('WebGL is unavailable in this browser.');
  const app = new App();
  window.__robattle = app;     // handy for debugging from the console
  app.start();
} catch (err) {
  console.error(err);
  fail('Could not start the game.', err?.message ?? '');
}
