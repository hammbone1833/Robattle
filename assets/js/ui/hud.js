/**
 * The battle HUD.
 *
 * A Robattle is decided by which *part* is broken, so the HUD's main job is to keep four
 * armour bars per robot legible at a glance -- yours along the bottom, both teams' down
 * the sides -- without covering the middle of the screen, which is where you are aiming.
 */

import { el } from './shell.js';
import { SLOTS, SLOT_LABELS } from '../data/parts.js';
import { readyActions, canMedaforce, legStyle, MEDAFORCE_FULL } from '../core/combat.js';
import { MEDAFORCE } from '../data/medals.js';

const KEY_LABEL = { head: 'Q / 1', rarm: 'LMB / 2', larm: 'RMB / 3', legs: 'SPACE', medaforce: 'F' };
const SHORT_LABELS = { head: 'HEAD', rarm: 'R.ARM', larm: 'L.ARM', legs: 'LEGS' };

export class Hud {
  constructor(combat, arenaScene) {
    this.combat = combat;
    this.arena = arenaScene;
    this.root = document.getElementById('hud');
    this.allyHost = document.querySelector('#team-ally .team-bots');
    this.foeHost = document.querySelector('#team-foe .team-bots');
    this.selfHost = document.getElementById('self-status');
    this.actionHost = document.getElementById('action-bar');
    this.markerHost = document.getElementById('hud-markers');
    this.clockEl = document.getElementById('battle-clock');
    this.feedEl = document.getElementById('killfeed');
    this.energyEl = document.querySelector('.meter-fill.energy');
    this.forceEl = document.querySelector('.meter-fill.force');
    this.forfeitBtn = document.getElementById('forfeit');

    this.cards = new Map();
    this.actions = new Map();
    this.markers = new Map();
    this.feed = [];

    this.build();
    this.unsubscribe = combat.on((ev) => this.onEvent(ev));
    this.root.classList.remove('hidden');
  }

  build() {
    this.allyHost.innerHTML = '';
    this.foeHost.innerHTML = '';
    this.markerHost.innerHTML = '';
    this.feedEl.innerHTML = '';

    document.querySelector('#team-ally h3').textContent = this.combat.teams[0].name;
    document.querySelector('#team-foe h3').textContent = this.combat.teams[1].name;

    for (const bot of this.combat.bots) {
      const bars = {};
      const barRow = el('div', { class: 'partbars' });
      for (const slot of SLOTS) {
        const fill = el('i');
        const bar = el('div', { class: `partbar ${slot}`, title: SLOT_LABELS[slot] }, fill);
        bars[slot] = { bar, fill };
        barRow.append(bar);
      }
      const card = el('div', { class: `botcard${bot.isLeader ? ' leader' : ''}` },
        el('div', { class: 'botcard-name' },
          bot.isLeader ? el('span', { class: 'botcard-crown', text: '★', title: 'Leader' }) : null,
          bot.name),
        barRow);
      this.cards.set(bot.id, { card, bars });
      (bot.side === 0 ? this.allyHost : this.foeHost).append(card);

      const marker = el('div', { class: `marker ${bot.side === 0 ? 'ally' : ''}` });
      this.markerHost.append(marker);
      this.markers.set(bot.id, marker);
    }

    this.buildSelf();
  }

  buildSelf() {
    const bot = this.combat.playerBot;
    this.selfHost.innerHTML = '';
    this.actionHost.innerHTML = '';
    this.actions.clear();
    this.selfParts = {};
    if (!bot) return;

    this.selfHost.append(el('div', { class: 'self-name', text: bot.name }));
    const row = el('div', { class: 'self-parts' });
    for (const slot of SLOTS) {
      const fill = el('i');
      const box = el('div', { class: 'self-part' },
        el('div', { class: 'lbl', text: SHORT_LABELS[slot] }),
        el('div', { class: 'bar' }, fill));
      this.selfParts[slot] = { box, fill };
      row.append(box);
    }
    this.selfHost.append(row);

    for (const slot of ['head', 'rarm', 'larm', 'legs', 'medaforce']) {
      let label;
      if (slot === 'legs') label = legStyle(bot.parts.legs.part).action;
      else if (slot === 'medaforce') label = MEDAFORCE[bot.medal.medaforce].name;
      else label = bot.parts[slot].part.name;

      const cd = el('div', { class: 'cd' });
      const node = el('div', { class: 'action', dataset: { slot } },
        el('div', { class: 'key', text: KEY_LABEL[slot] }),
        el('div', { class: 'nm', text: label }),
        cd);
      node.addEventListener('click', () => this.arena?.fire(slot));
      node.style.pointerEvents = 'auto';
      this.actionHost.append(node);
      this.actions.set(slot, { node, cd });
    }
  }

  /* --------------------------------------------------------------- events */

  onEvent(ev) {
    switch (ev.type) {
      case 'part-destroyed': {
        const bot = this.combat.bot(ev.botId);
        this.pushFeed(`<b>${bot.name}</b> loses its ${SLOT_LABELS[ev.slot].toLowerCase()}`, ev.slot === 'head');
        break;
      }
      case 'bot-down': {
        const bot = this.combat.bot(ev.botId);
        this.pushFeed(`<b>${bot.name}</b> ceases functioning${ev.leader ? ' — leader down!' : ''}`, true);
        break;
      }
      case 'medaforce': {
        const bot = this.combat.bot(ev.botId);
        this.pushFeed(`<b>${bot.name}</b> unleashes ${ev.name}`, true);
        break;
      }
      default: break;
    }
  }

  pushFeed(html, big = false) {
    const line = el('div', { class: `feed-line${big ? ' big' : ''}`, html });
    this.feedEl.append(line);
    this.feed.push(line);
    while (this.feed.length > 6) this.feed.shift().remove();
    setTimeout(() => {
      if (!line.isConnected) return;
      line.style.transition = 'opacity .4s';
      line.style.opacity = '0';
      setTimeout(() => line.remove(), 420);
    }, 5200);
  }

  /* --------------------------------------------------------------- update */

  update() {
    const combat = this.combat;
    const now = combat.time;

    for (const bot of combat.bots) {
      const entry = this.cards.get(bot.id);
      if (entry) {
        entry.card.classList.toggle('down', !bot.functional);
        for (const slot of SLOTS) {
          const st = bot.parts[slot];
          const { bar, fill } = entry.bars[slot];
          bar.classList.toggle('dead', st.destroyed);
          fill.style.width = `${Math.max(0, (st.armor / st.maxArmor) * 100)}%`;
        }
      }

      const marker = this.markers.get(bot.id);
      if (marker) {
        const pos = bot.functional && bot.id !== combat.playerBotId ? this.arena?.screenPosition(bot) : null;
        if (!pos || pos.x < 1 || pos.x > 99 || pos.y < 5 || pos.y > 95) {
          marker.style.display = 'none';
        } else {
          marker.style.display = '';
          marker.style.left = `${pos.x}%`;
          marker.style.top = `${pos.y}%`;
          marker.textContent = `${bot.isLeader ? '★ ' : ''}${bot.name}`;
        }
      }
    }

    const bot = combat.playerBot;
    if (bot) {
      for (const slot of SLOTS) {
        const st = bot.parts[slot];
        const ref = this.selfParts[slot];
        if (!ref) continue;
        ref.box.classList.toggle('dead', st.destroyed);
        ref.fill.style.width = `${Math.max(0, (st.armor / st.maxArmor) * 100)}%`;
      }

      const ready = new Set(readyActions(bot, now));
      for (const [slot, { node, cd }] of this.actions) {
        if (slot === 'medaforce') {
          const charged = canMedaforce(bot);
          node.className = `action ${charged ? 'charged' : 'cooling'}`;
          cd.style.width = `${(bot.medaforce / MEDAFORCE_FULL) * 100}%`;
          continue;
        }
        const st = bot.parts[slot];
        if (st.destroyed) { node.className = 'action broken'; cd.style.width = '0'; continue; }
        if (slot === 'legs') {
          const left = bot.cooldown.legs - now;
          const style = legStyle(bot.parts.legs.part);
          const ok = left <= 0 && bot.energy >= style.cost;
          node.className = `action ${ok ? 'ready' : 'cooling'}`;
          cd.style.width = left > 0 ? `${Math.max(0, 100 - (left / style.cd) * 100)}%` : '100%';
          continue;
        }
        if (st.usesLeft <= 0) { node.className = 'action broken'; continue; }
        const isReady = ready.has(slot);
        node.className = `action ${isReady ? 'ready' : 'cooling'}`;
        const left = bot.cooldown[slot] - now;
        cd.style.width = isReady ? '100%' : `${Math.max(0, 100 - (left / 2.5) * 100)}%`;
        if (slot === 'head') {
          const nm = node.querySelector('.nm');
          const uses = st.usesLeft === Infinity ? '' : ` (${st.usesLeft})`;
          const base = st.part.name;
          if (nm.textContent !== base + uses) nm.textContent = base + uses;
        }
      }

      this.energyEl.style.width = `${bot.energy}%`;
      this.forceEl.style.width = `${(bot.medaforce / MEDAFORCE_FULL) * 100}%`;
    }

    const remaining = Math.max(0, combat.timeLimit - combat.time);
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    this.clockEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.clockEl.style.color = remaining < 30 ? 'var(--red)' : '';
  }

  /** Brief visual kick on an action button when the engine refuses the input. */
  flashAction(slot, kind) {
    const entry = this.actions.get(slot);
    if (!entry) return;
    entry.node.classList.remove('flash-cooling', 'flash-denied');
    void entry.node.offsetWidth;                      // restart the animation
    entry.node.classList.add(kind === 'denied' ? 'flash-denied' : 'flash-cooling');
  }

  setForfeitHandler(fn) {
    this.forfeitBtn.onclick = fn;
  }

  hide() { this.root.classList.add('hidden'); }

  dispose() {
    this.unsubscribe?.();
    this.hide();
    this.forfeitBtn.onclick = null;
    this.markerHost.innerHTML = '';
    this.feedEl.innerHTML = '';
  }
}
