# ROBATTLE 3D — Medarra Circuit

A browser robot-battler with an embedded real-time 3D arena. Build a medabot out of four
interchangeable parts and a medal, walk it around a village hub, and fight live Robattles
where **the part you hit is the part that breaks**.

No build step, no bundler, no backend. Open `index.html` from any static host and it runs.

---

## Running it

```bash
npm start          # serves the folder at http://127.0.0.1:8777
npm test           # 53 rule tests for the combat engine and progression
npm run balance    # AI-vs-AI simulation harness, prints match length / win rates
```

Any static server works — it is plain ES modules plus a vendored copy of Three.js. There
is nothing to compile and nothing to install to *play* it (`npm` is only used for the
test scripts, which run on Node with no dependencies).

## Controls

| | Village | Robattle |
|---|---|---|
| **W A S D** | Walk | Move |
| **Mouse** | Look | Aim (click to capture the pointer) |
| **Shift** | Run | — |
| **E** | Enter a building | — |
| **LMB / 2** | — | Right arm |
| **RMB / 3** | — | Left arm |
| **Q / 1** | — | Head weapon (limited uses) |
| **Space** | — | Legs: dash, blink or brace |
| **F** | — | Medaforce |
| **Esc** | Close a panel | Release the pointer |

## How a Robattle works

A medabot is **four separate parts** — head, right arm, left arm, legs — each with its own
armour pool, plus a **medal** that acts as its brain. Damage is applied to whichever part
the shot physically struck, which is why aiming is the whole skill of the game:

- **Shoot an arm off** and that weapon is gone for the rest of the battle.
- **Shoot the legs** and the target can barely move or dodge.
- **Shoot a head** and that medabot ceases functioning.
- **Shoot the enemy *leader's* head** (marked ★) and you win on the spot, however healthy
  the rest of their team is. The same is true of yours.

Heads carry far more armour than arms and are a smaller target, so stripping the weapons
first is usually the sane opening and the head is the closer.

Supporting rules: head weapons have limited uses; beam weapons cannot be dodged; break
weapons ignore armour plating; cover stops everything except a medabot walking around it;
and your **medaforce** gauge fills from damage you *take*, not damage you deal — losing
badly is how you unlock your strongest attack.

## What's in it

- **Medarra Village** — a walkable hub. The garage, parts shop, practice gym, tournament
  hall, standings monument and event tent are buildings you walk up to and enter.
- **Garage** — fit any part you own to any of your three medabots, change medals, pick
  which one is your leader. Your leader is the medabot you personally drive; the other two
  fight alongside you on their own. Changing the leader's parts changes the model you walk
  around the village in.
- **Shop** — stock rotates every Monday. You can sell spares back at 40%.
- **Practice gym** — target drills against frames that never shoot back, and free sparring
  against any team on the register. Nothing there touches your rating, record or wallet.
- **Tournaments** — five cups in an unlock chain. Damage carries between rounds and you
  only get rough field repairs, so a cup tests whether a loadout *lasts*.
- **Standings** — an Elo-style rating. Beating a team ranked far above you is worth far
  more than farming one below you.
- **Events** — a new weekly challenge every Monday and a heavier monthly one, each paying
  out a Relic part that is never sold in the shop. Win it while it is live or wait for it
  to come round again.
- 52 parts across 12 chassis families, 9 medals that learn as they fight, 9 opponent teams
  and 7 arenas.

## Design notes

**One rig, two consumers.** `core/rig.js` defines the robot's body once — where the head
sphere sits, where each arm box sits, where the muzzles are. The renderer builds meshes
from it and the simulation tests hits against it. That is what makes aiming honest: the
head you can see is exactly the volume a bullet is tested against. A shot that lands on
the torso is credited to the legs, because the legs part *is* the chassis.

**The rules are headless.** `core/combat.js` has no DOM and no WebGL in it, so a whole
Robattle can be run in Node. `npm test` plays 60 full AI-vs-AI matches across the roster
and asserts nobody escapes the arena, no armour goes negative and every match terminates.
`npm run balance` plays hundreds more and prints match lengths and win rates, which is how
the numbers below were tuned rather than guessed.

**Things the simulation caught.** Heads originally died to three focused hits in under two
seconds, so head armour is scaled far harder than any other slot and head shots take an
accuracy penalty for being a small target. Defense was a flat subtraction, which let a
heavy chassis reduce a light weapon to literally zero and made tank-vs-tank unwinnable —
it is proportional now. Repair was balanced for a turn-based exchange and in real time it
out-healed three attackers at once, so every match with a medic in it ran to the clock;
support parts now recover 2.4× slower than weapons. One opponent team was all slow melee
chassis and could not physically catch a faster team, so it was rebuilt with reach.

**Events without a server.** The weekly and monthly rotations are derived from the
calendar — the ISO week number and month index seed which event is live — so everyone
opening the site in the same week sees the same event, it changes on its own every Monday,
and nothing has to be deployed to make that happen.

**Saves are defensive.** A corrupt or half-written save falls back to a playable one, and
a save referencing a part that no longer exists is repaired rather than rejected, so
changing the catalogue never locks a player out of their own garage.

## Layout

```
index.html               the page; the 3D canvas fills it and the UI floats over it
assets/css/site.css      interface styling
assets/js/
  main.js                app shell: one renderer, one loop, scene switching, battle flows
  core/
    rig.js               robot body definition + hit detection (shared by sim and renderer)
    combat.js            the entire rule set, headless and testable
    state.js             save state, inventory, economy
    leaderboard.js       ratings and regional standings
    rng.js               seeded PRNG so battles replay exactly in tests
  data/                  parts, medals, opponent roster, arenas, cups, event rotation
  render/                procedural robot models, arena scene, village scene, effects, camera
  ui/                    shell helpers, battle HUD, and every non-combat screen
tests/                   rule tests + the balance simulation harness
vendor/three.module.js   Three.js r160 (MIT), vendored so there is no CDN dependency
```

## Content

The game design is an original homage to the classic part-swapping robot-battler genre.
All of the content here — the chassis families, parts, medals, opponents, arenas and
village — is original to this project. No third-party characters, names, artwork or assets
are used, and every model is generated procedurally at runtime from primitives.

Three.js is bundled under its MIT licence (`vendor/THREE-LICENSE.txt`).
