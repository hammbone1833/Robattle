/**
 * Every non-combat screen: garage, shop, gym, tournaments, standings, events, help and
 * the post-battle results.
 *
 * Each function builds its DOM fresh from save state and hands it to the shared modal.
 * Re-rendering a whole panel after every change is more than fast enough here and means
 * no screen can drift out of sync with what the player actually owns.
 */

import { el, openPanel, closePanel, replaceBody, toast, confirmPanel } from './shell.js';
import { PARTS, SLOTS, SLOT_LABELS, getPart, purchasableParts, FAMILIES } from '../data/parts.js';
import { MEDALS, getMedal, MEDAFORCE, effectiveSkill } from '../data/medals.js';
import { OPPONENTS, getOpponent, lootPool } from '../data/roster.js';
import { ARENAS } from '../data/arenas.js';
import { CUPS, getCup, cupUnlocked } from '../data/tournaments.js';
import { currentEvents, shopSeed, timeUntil } from '../data/events.js';
import { standings, titleFor } from '../core/leaderboard.js';
import {
  loadSettings, saveSettings, CONTROL_CHOICES, QUALITY_CHOICES, detectedControls, resolveQuality,
} from '../core/settings.js';
import { makeRng } from '../core/rng.js';

/* ----------------------------------------------------------------- pieces */

const typePill = (type) =>
  el('span', { class: `pill pill-${String(type).toLowerCase()}`, text: type === 'LEGS' ? 'Legs' : type });

function partStats(part) {
  const row = el('div', { class: 'statline' });
  const add = (label, value) => row.append(el('span', { class: 'stat', html: `${label} <b>${value}</b>` }));
  add('Armour', part.armor);
  if (part.slot === 'legs') {
    add('Propulsion', part.propulsion);
    add('Mobility', part.mobility);
    add('Evasion', part.evasion);
    add('Defense', part.defense);
  } else {
    add('Power', part.power);
    add('Accuracy', part.success);
    add('Wind-up', part.charge);
    add('Recovery', part.cooldown);
    if (part.uses > 0) add('Uses', part.uses);
  }
  return row;
}

function partCard(part, extra = {}) {
  return el('div', { class: `card ${extra.class ?? ''}`, onclick: extra.onclick },
    el('div', { class: 'card-head' },
      el('span', { class: 'card-title', text: part.name }),
      typePill(part.type),
      extra.price !== undefined ? el('span', { class: 'card-price', text: `${extra.price} ᴿ` }) : null,
      extra.right ?? null),
    el('div', { class: 'faint', text: `${FAMILIES[part.family].name} · ${SLOT_LABELS[part.slot]}` }),
    partStats(part),
    extra.footer ?? null);
}

/* ----------------------------------------------------------------- garage */

export function openGarage(app, selected = 0) {
  const state = app.state;
  const render = () => {
    const bot = state.data.team[selected];

    const list = el('div', { class: 'bot-list' },
      state.data.team.map((b, i) => el('button', {
        class: `bot-chip${i === selected ? ' chosen' : ''}`,
        onclick: () => { selected = i; replaceBody(render()); },
      },
        el('div', { class: 'n' }, b.name, i === state.data.leader ? el('span', { class: 'leader-badge', text: 'LEADER' }) : null),
        el('div', { class: 'm', text: getMedal(b.medal).name }))),
      el('div', { class: 'faint', style: 'margin-top:10px;line-height:1.5' },
        'Wreck the enemy leader’s head and the Robattle ends instantly — and the same is true of yours. Put the leader badge on the medabot you trust to survive.'));

    const slots = el('div', {},
      SLOTS.map((slot) => {
        const current = getPart(bot.parts[slot]);
        const options = [...state.ownedParts().keys()]
          .map(getPart)
          .filter((p) => p.slot === slot)
          .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

        const select = el('select', {
          onchange: (e) => {
            const id = e.target.value;
            if (id === current.id) return;
            if (state.equip(selected, slot, id)) {
              app.refreshStats();
              app.refreshAvatar();
              replaceBody(render());
            } else {
              toast('You do not have that part spare.', 'bad');
              e.target.value = current.id;
            }
          },
        }, options.map((p) => el('option', { value: p.id, selected: p.id === current.id ? true : null },
          `${p.name}${p.id === current.id ? ' (fitted)' : ` · ${state.countOf(p.id)} spare`}`)));

        return el('div', { class: 'slot-row' },
          el('div', { class: 'slot-label', text: SLOT_LABELS[slot] }),
          el('div', {},
            el('div', { class: 'slot-part' }, current.name, ' ', typePill(current.type)),
            partStats(current)),
          select);
      }));

    const medal = getMedal(bot.medal);
    const skills = Object.entries(medal.skills)
      .filter(([, v]) => v > 1)
      .sort((a, b) => b[1] - a[1]);
    const exp = state.data.medalExp[medal.id] ?? {};

    const medalBox = el('div', { class: 'card' },
      el('div', { class: 'card-head' },
        el('span', { class: 'card-title', text: medal.name }),
        el('select', {
          class: 'card-price',
          style: 'margin-left:auto',
          onchange: (e) => { state.setMedal(selected, e.target.value); replaceBody(render()); },
        }, state.data.medals.map((id) => el('option', { value: id, selected: id === medal.id ? true : null }, getMedal(id).name)))),
      el('div', { class: 'card-blurb', text: medal.blurb }),
      el('div', { class: 'statline' },
        skills.map(([type, base]) => {
          const eff = effectiveSkill(medal, type, exp);
          return el('span', { class: `stat${eff > base ? ' up' : ''}`, html: `${type} <b>${eff}${eff > base ? ` (+${eff - base})` : ''}</b>` });
        })),
      el('div', { class: 'faint', html: `<b>Medaforce:</b> ${MEDAFORCE[medal.medaforce].name} — ${MEDAFORCE[medal.medaforce].blurb}` }));

    const controls = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:14px' },
      el('input', {
        type: 'text', value: bot.name, maxlength: 16, style: 'flex:1;min-width:180px',
        onchange: (e) => { state.renameBot(selected, e.target.value); replaceBody(render()); },
      }),
      el('button', {
        class: 'btn',
        text: selected === state.data.leader ? 'This is your leader' : 'Make leader & pilot',
        title: 'Your leader is the medabot you personally drive, and the one whose head ends the battle',
        disabled: selected === state.data.leader ? true : null,
        onclick: () => { state.setLeader(selected); app.refreshStats(); app.refreshAvatar(); replaceBody(render()); },
      }));

    return el('div', { class: 'garage' }, list, el('div', {}, slots, medalBox, controls));
  };

  openPanel({
    title: 'Garage',
    sub: 'Fit parts, choose a medal, pick your leader',
    body: render(),
    footer: [
      el('div', { class: 'faint', text: 'You drive your leader in battle. The other two fight alongside you on their own.' }),
      el('button', { class: 'btn btn-primary', text: 'Done', style: 'margin-left:auto', onclick: closePanel }),
    ],
  });
}

/* ------------------------------------------------------------------- shop */

/** Stock is drawn from the week number, so it genuinely restocks every Monday. */
function weeklyStock(date = new Date()) {
  const rng = makeRng(shopSeed(date));
  const pool = purchasableParts().slice().sort((a, b) => a.id.localeCompare(b.id));
  const picks = [];
  const used = new Set();
  // Always carry a couple of cheap staples so a broke player is never stuck.
  for (const p of pool.filter((x) => x.tier <= 1)) {
    if (picks.length >= 3) break;
    if (rng() < 0.5) { picks.push(p); used.add(p.id); }
  }
  while (picks.length < 14) {
    const p = pool[Math.floor(rng() * pool.length)];
    if (used.has(p.id)) continue;
    used.add(p.id);
    picks.push(p);
  }
  const medalPool = Object.values(MEDALS).filter((m) => m.cost > 0);
  const medals = [];
  for (let i = 0; i < 2; i++) {
    const m = medalPool[Math.floor(rng() * medalPool.length)];
    if (!medals.includes(m)) medals.push(m);
  }
  return { picks, medals };
}

export function openShop(app) {
  const state = app.state;
  const { picks, medals } = weeklyStock();
  const events = currentEvents();

  const render = () => {
    const owned = state.ownedParts();
    const partGrid = el('div', { class: 'grid grid-3' },
      picks.map((p) => partCard(p, {
        price: p.cost,
        right: owned.has(p.id) ? el('span', { class: 'card-tag', text: `own ${owned.get(p.id)}` }) : null,
        footer: el('button', {
          class: 'btn btn-sm btn-primary', text: 'Buy', style: 'margin-top:8px',
          disabled: !state.canAfford(p.cost) ? true : null,
          onclick: () => {
            if (!state.spend(p.cost)) return toast('Not enough Rodo.', 'bad');
            state.addPart(p.id);
            app.refreshStats();
            toast(`Bought ${p.name}.`, 'good');
            replaceBody(render());
          },
        }),
      })));

    const medalGrid = el('div', { class: 'grid grid-2' },
      medals.map((m) => el('div', { class: 'card' },
        el('div', { class: 'card-head' },
          el('span', { class: 'card-title', text: m.name }),
          el('span', { class: 'card-price', text: `${m.cost} ᴿ` })),
        el('div', { class: 'card-blurb', text: m.blurb }),
        el('div', { class: 'statline' },
          Object.entries(m.skills).filter(([, v]) => v > 2)
            .map(([t, v]) => el('span', { class: 'stat', html: `${t} <b>${v}</b>` }))),
        el('button', {
          class: 'btn btn-sm btn-primary', style: 'margin-top:8px',
          text: state.hasMedal(m.id) ? 'Owned' : 'Buy',
          disabled: state.hasMedal(m.id) || !state.canAfford(m.cost) ? true : null,
          onclick: () => {
            if (!state.spend(m.cost)) return toast('Not enough Rodo.', 'bad');
            state.addMedal(m.id);
            app.refreshStats();
            toast(`Bought ${m.name}.`, 'good');
            replaceBody(render());
          },
        }))));

    const spares = [...Object.entries(state.data.inventory)]
      .map(([id, n]) => ({ part: getPart(id), n }))
      .sort((a, b) => b.part.cost - a.part.cost);

    const sellGrid = spares.length
      ? el('div', { class: 'grid grid-3' }, spares.map(({ part, n }) => {
          const value = Math.round(part.cost * 0.4);
          return partCard(part, {
            price: value,
            right: el('span', { class: 'card-tag', text: `${n} spare` }),
            footer: el('button', {
              class: 'btn btn-sm', text: `Sell for ${value}`, style: 'margin-top:8px',
              onclick: () => {
                state.removePart(part.id);
                state.earn(value);
                app.refreshStats();
                toast(`Sold ${part.name} for ${value} Rodo.`, 'good');
                replaceBody(render());
              },
            }),
          });
        }))
      : el('p', { class: 'muted', text: 'No spare parts to sell. Everything you own is fitted.' });

    return el('div', {},
      el('p', { class: 'muted', style: 'margin-top:0' },
        'Stock rotates every Monday. Event parts are never sold here — ',
        el('b', { text: events.weekly.name }), ' is the only way to get this week’s relic.'),
      el('h3', { text: 'Medaparts in stock' }), partGrid,
      el('h3', { text: 'Medals', style: 'margin-top:22px' }), medalGrid,
      el('h3', { text: 'Sell spares', style: 'margin-top:22px' }), sellGrid);
  };

  openPanel({
    title: 'Cogsworth Parts',
    sub: `Restocks in ${timeUntil(events.weekly.endsAt)}`,
    body: render(),
    footer: [el('button', { class: 'btn btn-primary', text: 'Close', style: 'margin-left:auto', onclick: closePanel })],
    wide: true,
  });
}

/* -------------------------------------------------------------------- gym */

export function openGym(app) {
  const body = el('div', {},
    el('p', { class: 'muted', style: 'margin-top:0' },
      'Nothing here counts. No entry fee, no prize money, no effect on your rating or record — and no loot either. Use it to learn a new loadout before you risk it.'),
    el('h3', { text: 'Target drill' }),
    el('div', { class: 'grid grid-2' },
      el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('span', { class: 'card-title', text: 'Static targets' })),
        el('div', { class: 'card-blurb', text: 'Three training frames that move but never shoot back. The place to learn where the head hitbox actually is.' }),
        el('button', {
          class: 'btn btn-sm btn-primary', style: 'margin-top:10px', text: 'Start drill',
          onclick: () => { closePanel(); app.startTraining({ passive: true }); },
        })),
      el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('span', { class: 'card-title', text: 'Live sparring' })),
        el('div', { class: 'card-blurb', text: 'A full Robattle against a training team that fights back properly. Pick the opponent below.' }))),
    el('h3', { text: 'Spar against', style: 'margin-top:22px' }),
    el('div', { class: 'grid grid-3' },
      OPPONENTS.map((op) => el('div', { class: 'card' },
        el('div', { class: 'card-head' },
          el('span', { class: 'card-title', text: op.name }),
          el('span', { class: 'card-tag', text: `Tier ${op.tier}` })),
        el('div', { class: 'card-blurb', text: op.blurb }),
        el('div', { class: 'faint', style: 'margin-top:6px', text: `${ARENAS[op.arena].name} · led by ${op.bots[op.leader].name}` }),
        el('button', {
          class: 'btn btn-sm', style: 'margin-top:10px', text: 'Spar',
          onclick: () => { closePanel(); app.startTraining({ opponentId: op.id }); },
        })))));

  openPanel({
    title: 'Practice Gym',
    sub: 'Free sparring — nothing at stake',
    body,
    footer: [el('button', { class: 'btn', text: 'Close', style: 'margin-left:auto', onclick: closePanel })],
    wide: true,
  });
}

/* ------------------------------------------------------------ tournaments */

export function openTournaments(app) {
  const state = app.state;
  const body = el('div', {},
    el('p', { class: 'muted', style: 'margin-top:0' },
      'Cups run several Robattles back to back. Damage carries between rounds and you only get rough field repairs, so a cup tests whether your loadout lasts — not just whether it wins once. Lose and you forfeit the entry fee, nothing more.'),
    el('div', { class: 'grid grid-2' },
      CUPS.map((cup) => {
        const unlocked = cupUnlocked(cup, state.data.cupsWon);
        const won = state.hasWonCup(cup.id);
        const affordable = state.canAfford(cup.entry);
        const prizePart = getPart(cup.prize.part);
        return el('div', { class: `card${unlocked ? '' : ' locked'}` },
          el('div', { class: 'card-head' },
            el('span', { class: 'card-title', text: cup.name }),
            el('span', { class: 'card-tag', text: `Tier ${cup.tier}` }),
            won ? el('span', { class: 'card-tag', style: 'border-color:var(--green);color:var(--green)', text: 'Won' }) : null,
            el('span', { class: 'card-price', text: cup.entry ? `${cup.entry} ᴿ` : 'Free' })),
          el('div', { class: 'card-blurb', text: cup.blurb }),
          el('div', { class: 'faint', style: 'margin-top:8px' },
            `Rounds: ${cup.rounds.map((r) => getOpponent(r).name).join(' → ')}`),
          el('div', { class: 'statline' },
            el('span', { class: 'stat', html: `Purse <b>${cup.prize.rodo} ᴿ</b>` }),
            el('span', { class: 'stat', html: `Rating <b>+${cup.prize.rating}</b>` }),
            el('span', { class: 'stat', html: `Prize part <b>${prizePart.name}</b>` })),
          el('button', {
            class: 'btn btn-sm btn-primary', style: 'margin-top:8px',
            text: !unlocked ? `Win the ${getCup(cup.requires).name} first` : !affordable ? 'Cannot afford entry' : 'Enter cup',
            disabled: !unlocked || !affordable ? true : null,
            onclick: () => { closePanel(); app.startCup(cup.id); },
          }));
      })));

  openPanel({
    title: 'Tournament Hall',
    sub: 'Cups, purses and prize parts',
    body,
    footer: [el('button', { class: 'btn', text: 'Close', style: 'margin-left:auto', onclick: closePanel })],
    wide: true,
  });
}

/* ------------------------------------------------------------ leaderboard */

export function openLeaderboard(app) {
  const state = app.state;
  const rows = standings(state);
  const d = state.data;
  const table = el('table', { class: 'rank' },
    el('thead', {}, el('tr', {},
      el('th', { text: '#' }), el('th', { text: 'Medafighter' }), el('th', { text: 'Signature team' }),
      el('th', { class: 'num', text: 'W' }), el('th', { class: 'num', text: 'L' }), el('th', { class: 'num', text: 'Rating' }))),
    el('tbody', {}, rows.map((r) => el('tr', { class: r.isPlayer ? 'me' : '' },
      el('td', { text: r.rank }),
      el('td', { text: r.name }),
      el('td', { text: r.team }),
      el('td', { class: 'num', text: r.wins }),
      el('td', { class: 'num', text: r.losses }),
      el('td', { class: 'num', text: r.rating })))));

  const me = rows.find((r) => r.isPlayer);
  const body = el('div', {},
    el('div', { class: 'reward-row', style: 'margin:0 0 18px' },
      el('div', { class: 'reward' }, el('div', { class: 'v', text: `#${me.rank}` }), el('div', { class: 'l', text: 'Regional rank' })),
      el('div', { class: 'reward' }, el('div', { class: 'v', text: d.rating }), el('div', { class: 'l', text: 'Rating' })),
      el('div', { class: 'reward' }, el('div', { class: 'v', text: titleFor(d.rating) }), el('div', { class: 'l', text: 'Title' })),
      el('div', { class: 'reward' }, el('div', { class: 'v', text: `${d.record.wins}–${d.record.losses}` }), el('div', { class: 'l', text: 'Record' })),
      el('div', { class: 'reward' }, el('div', { class: 'v', text: d.cupsWon.length }), el('div', { class: 'l', text: 'Cups won' }))),
    el('p', { class: 'faint', style: 'margin-top:0' },
      'The regional table reshuffles every Monday. Your rating is yours — beating a team ranked far above you is worth far more than farming one below you.'),
    table);

  openPanel({
    title: 'Standings Monument',
    sub: 'Regional rankings',
    body,
    footer: [el('button', { class: 'btn', text: 'Close', style: 'margin-left:auto', onclick: closePanel })],
  });
}

/* ----------------------------------------------------------------- events */

export function openEvents(app) {
  const state = app.state;
  const events = currentEvents();

  const card = (ev) => {
    const reward = getPart(ev.reward);
    const claimed = state.hasClaimedEvent(ev.key);
    const op = getOpponent(ev.opponent);
    return el('div', { class: 'card' },
      el('div', { class: 'card-head' },
        el('span', { class: 'card-title', text: ev.name }),
        el('span', { class: 'card-tag', text: ev.kind }),
        el('span', { class: 'card-price', text: `ends in ${timeUntil(ev.endsAt)}` })),
      el('div', { class: 'card-blurb', text: ev.rule }),
      el('div', { class: 'faint', style: 'margin-top:8px', text: `${op.name} · ${ARENAS[ev.arena].name}` }),
      el('div', { style: 'margin-top:12px' }, partCard(reward, {
        right: el('span', { class: 'card-tag', style: 'border-color:var(--green);color:var(--green)', text: 'Event only' }),
      })),
      el('button', {
        class: `btn btn-sm ${claimed ? '' : 'btn-primary'}`, style: 'margin-top:10px',
        text: claimed ? 'Already claimed this period' : 'Attempt challenge',
        disabled: claimed ? true : null,
        onclick: () => { closePanel(); app.startEvent(ev); },
      }));
  };

  const body = el('div', {},
    el('p', { class: 'muted', style: 'margin-top:0' },
      'Events rotate on the calendar: a new challenge every Monday and a heavier one every month. Win it once while it is live and the part is yours permanently — miss it and you wait for it to come round again.'),
    el('div', { class: 'grid grid-2' }, card(events.weekly), card(events.monthly)));

  openPanel({
    title: 'Event Tent',
    sub: 'Weekly and monthly specials',
    body,
    footer: [el('button', { class: 'btn', text: 'Close', style: 'margin-left:auto', onclick: closePanel })],
    wide: true,
  });
}

/* ------------------------------------------------------------------- help */

export function openHelp(app) {
  const key = (k, t) => el('div', { class: 'keyrow' }, el('kbd', { text: k }), el('b', { text: t }));
  const touch = app.controls === 'touch';

  const controlSection = touch
    ? [
        el('h3', { text: 'In the village' }),
        el('div', { class: 'keys' },
          key('Left side', 'Drag to walk'), key('Right side', 'Drag to look'),
          key('E button', 'Enter a building'), key('⛶', 'Fullscreen')),
        el('h3', { text: 'In a Robattle', style: 'margin-top:20px' }),
        el('div', { class: 'keys' },
          key('Left side', 'Move'), key('Right side', 'Aim'), key('R', 'Right arm'), key('L', 'Left arm'),
          key('H', 'Head weapon'), key('»', 'Legs: dash or brace'), key('★', 'Medaforce')),
        el('p', { class: 'faint', style: 'margin-top:10px' },
          'Move and aim at the same time — one thumb per side. Landscape gives you far more room.'),
      ]
    : [
        el('h3', { text: 'In the village' }),
        el('div', { class: 'keys' },
          key('W A S D', 'Walk'), key('Mouse', 'Look around'), key('Shift', 'Run'), key('E', 'Enter a building')),
        el('h3', { text: 'In a Robattle', style: 'margin-top:20px' }),
        el('div', { class: 'keys' },
          key('W A S D', 'Move'), key('Mouse', 'Aim'), key('LMB / 2', 'Right arm'), key('RMB / 3', 'Left arm'),
          key('Q / 1', 'Head weapon'), key('Space', 'Legs: dash or brace'), key('F', 'Medaforce'), key('Esc', 'Release the mouse')),
      ];

  const body = el('div', {},
    controlSection,
    el('p', { class: 'faint', style: 'margin-top:8px' },
      'Using something else? Change the control scheme in Settings.'),
    el('h3', { text: 'How a Robattle is won', style: 'margin-top:20px' }),
    el('ul', { class: 'muted', style: 'line-height:1.65;padding-left:20px' },
      el('li', { html: 'A medabot is <b>four separate parts</b> — head, right arm, left arm and legs — each with its own armour. Damage lands on whichever part your shot actually hit.' }),
      el('li', { html: 'Shoot an arm off and that weapon is <b>gone for the rest of the battle</b>. Shoot the legs and it can barely move or dodge.' }),
      el('li', { html: 'Wreck a head and that medabot <b>ceases functioning</b>. Wreck the enemy <b>leader’s</b> head (marked ★) and you win on the spot, however healthy the rest of their team is.' }),
      el('li', { html: 'Heads carry far more armour than arms and are a smaller target, so stripping the weapons first is usually the sane opening.' }),
      el('li', { html: 'Head weapons have <b>limited uses</b>. Arms are unlimited but have their own recovery time.' }),
      el('li', { html: 'Your <b>medaforce</b> gauge fills from damage you <i>take</i>, not damage you deal. Losing badly is how you unlock your best attack.' }),
      el('li', { html: 'Beam weapons cannot be dodged. Break weapons ignore armour plating. Cover stops everything except a medabot walking around it.' })),
    el('h3', { text: 'Progress', style: 'margin-top:20px' }),
    el('ul', { class: 'muted', style: 'line-height:1.65;padding-left:20px' },
      el('li', { html: 'Winning pays <b>Rodo</b> and lets you strip one part off the losing team.' }),
      el('li', { html: 'The shop restocks every Monday. Event parts are never sold — the only way to get a Relic part is to win that event while it is live.' }),
      el('li', { html: 'Medals learn: every action banks experience and raises that skill, up to three levels above the printed value.' })));

  openPanel({
    title: 'How to play',
    sub: 'Controls and rules',
    body,
    footer: [
      el('button', {
        class: 'btn btn-danger', text: 'Reset all progress',
        onclick: () => confirmPanel({
          title: 'Reset everything?',
          message: 'This wipes your parts, medals, Rodo, rating and record. It cannot be undone.',
          confirmLabel: 'Wipe my save', danger: true,
          onConfirm: () => { app.state.reset(); app.refreshStats(); app.refreshAvatar(); toast('Save wiped.', 'bad'); },
        }),
      }),
      el('button', { class: 'btn btn-primary', text: 'Got it', style: 'margin-left:auto', onclick: closePanel }),
    ],
  });
}

/* --------------------------------------------------------------- settings */

export function openSettings(app) {
  const render = () => {
    const s = loadSettings();

    const chooser = (choices, current, key, extra) => el('div', { class: 'grid grid-2' },
      choices.map((c) => el('div', {
        class: `card selectable${current === c.id ? ' chosen' : ''}`,
        onclick: () => { saveSettings({ [key]: c.id }); app.applySettings(); replaceBody(render()); },
      },
        el('div', { class: 'card-head' },
          el('span', { class: 'card-title', text: c.label }),
          current === c.id ? el('span', { class: 'card-tag', style: 'border-color:var(--amber);color:var(--amber)', text: 'Active' }) : null),
        el('div', { class: 'card-blurb', text: c.blurb }),
        c.id === 'auto' && extra ? el('div', { class: 'faint', style: 'margin-top:6px', text: extra }) : null)));

    const sens = el('input', {
      type: 'range', min: '0.4', max: '2.2', step: '0.1', value: String(s.sensitivity),
      style: 'flex:1;min-width:180px',
      oninput: (e) => {
        saveSettings({ sensitivity: Number(e.target.value) });
        app.applySettings();
        e.target.parentElement.querySelector('.sens-value').textContent = `${Number(e.target.value).toFixed(1)}x`;
      },
    });

    return el('div', {},
      el('h3', { text: 'Controls' }),
      chooser(CONTROL_CHOICES, s.controls, 'controls', `This device looks like: ${detectedControls() === 'touch' ? 'touch' : 'keyboard & mouse'}`),

      el('h3', { text: 'Look sensitivity', style: 'margin-top:22px' }),
      el('div', { style: 'display:flex;align-items:center;gap:12px' },
        sens,
        el('b', { class: 'sens-value', style: 'min-width:44px', text: `${s.sensitivity.toFixed(1)}x` })),
      el('label', { class: 'keyrow', style: 'margin-top:10px;cursor:pointer' },
        el('input', {
          type: 'checkbox', checked: s.invertY ? true : null,
          onchange: (e) => { saveSettings({ invertY: e.target.checked }); app.applySettings(); },
        }),
        el('b', { text: 'Invert vertical look' })),

      el('h3', { text: 'Graphics', style: 'margin-top:22px' }),
      chooser(QUALITY_CHOICES, s.quality, 'quality', `Auto picks: ${resolveQuality({ ...s, quality: 'auto' }).name}`),
      el('p', { class: 'faint', style: 'margin-top:10px' },
        'Lower settings turn off shadows, thin out the crowd and render at a lower resolution. Changing this mid-Robattle applies fully from the next battle.'));
  };

  openPanel({
    title: 'Settings',
    sub: 'Controls and graphics',
    body: render(),
    footer: [el('button', { class: 'btn btn-primary', text: 'Done', style: 'margin-left:auto', onclick: closePanel })],
    wide: true,
  });
}

/* ---------------------------------------------------------------- results */

/**
 * Post-battle summary. `summary` carries the verdict plus whatever was earned, and
 * `actions` are the buttons that continue whatever flow we were in (next cup round,
 * back to the village, and so on).
 */
export function openResults(app, summary, actions) {
  const { won, draw, reason, rodo = 0, ratingDelta = 0, loot, prize, title } = summary;
  const verdict = draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
  const reasons = {
    leader: won ? 'You wrecked their leader’s head.' : 'Your leader’s head was wrecked.',
    wipeout: won ? 'Their whole team ceased functioning.' : 'Your whole team ceased functioning.',
    time: 'Time ran out — the bout was awarded on points.',
    forfeit: won ? 'Your opponent withdrew.' : 'You withdrew.',
  };

  const rewards = el('div', { class: 'reward-row' });
  if (rodo) rewards.append(el('div', { class: 'reward' }, el('div', { class: 'v', text: `${rodo > 0 ? '+' : ''}${rodo}` }), el('div', { class: 'l', text: 'Rodo' })));
  if (ratingDelta) rewards.append(el('div', { class: 'reward' }, el('div', { class: 'v', text: `${ratingDelta > 0 ? '+' : ''}${ratingDelta}` }), el('div', { class: 'l', text: 'Rating' })));
  if (loot) rewards.append(el('div', { class: 'reward' }, el('div', { class: 'v', style: 'font-size:15px', text: getPart(loot).name }), el('div', { class: 'l', text: 'Salvaged part' })));
  if (prize) rewards.append(el('div', { class: 'reward' }, el('div', { class: 'v', style: 'font-size:15px', text: getPart(prize).name }), el('div', { class: 'l', text: 'Prize part' })));

  openPanel({
    title: title ?? 'Robattle over',
    body: el('div', {},
      el('div', { class: 'result-head' },
        el('div', { class: `result-verdict ${draw ? 'draw' : won ? 'win' : 'lose'}`, text: verdict }),
        el('div', { class: 'result-reason', text: reasons[reason] ?? '' })),
      rewards,
      summary.note ? el('p', { class: 'muted', style: 'text-align:center;margin-top:16px', text: summary.note }) : null),
    footer: actions,
  });
}
