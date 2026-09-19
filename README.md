# ROBATTLE 3D — Medarra Circuit

A browser robot-battler with an embedded real-time 3D arena. Build a medabot out of four
interchangeable parts and a medal, walk it around a village hub, and fight live Robattles
where **the part you hit is the part that breaks**.

No build step, no bundler, no backend. Open `index.html` from any static host and it runs.

---

## Playing it

**Important:** you cannot play by double-clicking `index.html`. The game is built from ES
modules and every browser refuses to load those over `file://`, so it has to be served
over HTTP. That is the only requirement — there is nothing to compile and no packages to
install.

### Option 1 — GitHub Pages (no tools, playable from any device)

In the repo on GitHub: **Settings → Pages → Source: "Deploy from a branch"**, pick the
branch and `/ (root)`, and save. A minute later it is live at
`https://<your-username>.github.io/Robattle/`. The game works correctly from a sub-path,
so nothing needs changing. (Pages on a private repo needs a paid plan; public is free.)

### Option 2 — run it locally

Needs [Node](https://nodejs.org) installed. Nothing else, on any OS:

```bash
git clone -b claude/website-embedded-3d-game-6sumso https://github.com/hammbone1833/Robattle.git
cd Robattle
npm start           # then open http://localhost:8777
```

`npm start` runs `tools/serve.mjs`, a ~50 line static server written against Node's
standard library, so there is no `npm install` step and no Python dependency.

Already have a static server you like? Anything works — `npx serve`, `python3 -m
http.server`, VS Code's Live Server extension. Just serve the project root.

### Development

```bash
npm test           # 53 rule tests for the combat engine and progression
npm run balance    # AI-vs-AI simulation harness, prints match lengths and win rates
```

## First five minutes

1. You start in the village plaza. **Click once** to capture the mouse, then **WASD** to
   walk and the mouse to look around.
2. Walk to the **GYM** on your right and press **E**. Run the target drill — the frames
   move but never shoot back, so it is the place to learn where a head hitbox actually is.
3. Go to the **GARAGE** (straight ahead from the fountain) and look at your three
   medabots. You start with the cheapest chassis in the game and one spare Hornet
   Repeater — fit it.
4. Walk to the **ROBATTLE** hall and enter the **Rookie Cup**. It is free, and the first
   opponent is deliberately a pushover.
5. Winning pays Rodo and lets you strip a part off the losing team. Spend it in the
   **PARTS** shop, then check the **EVENTS** tent for this week's exclusive.

## Controls

The game detects your device and picks a scheme, but detection is only the default --
**Settings → Controls** lets you force keyboard & mouse or touch at any time, because a
touchscreen laptop reports touch support and is still played with a keyboard.

### Keyboard & mouse

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

### Touch

Twin-stick. The **left half** of the screen is a movement stick that appears wherever your
thumb lands; the **right half** is drag-to-look; the action buttons sit under your right
thumb. Both thumbs work at once, so you can move and aim together. The **⛶** button in the
top bar goes fullscreen and, where the browser allows it, locks to landscape.

| Button | Does |
|---|---|
| **R** | Right arm |
| **L** | Left arm |
| **H** | Head weapon |
| **»** | Legs: dash, blink or brace |
| **★** | Medaforce (lights up when charged) |
| **E** | Enter a building (village only, lights up at a door) |

Landscape is strongly preferred — the game says so once in portrait and then leaves you
alone.

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

## Performance

Graphics scale across three tiers (**Settings → Graphics**, or left on Auto). The tier
controls pixel ratio, shadows, crowd size, draw distance and effect pool sizes together:

| | Pixel ratio | Shadows | Crowd |
|---|---|---|---|
| **Low** | 1.0 | off | none |
| **Medium** | 1.5 | 512px | 140 |
| **High** | 2.0 | 1024px | 480 |

Auto drops touch devices a rung, because phones report pixel ratios of 3 or more and
rendering at native resolution there costs roughly nine times the fragments for a screen
too small to show the difference. A phone with four cores or less, or 3GB or less of
reported memory, drops to Low.

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

**One input path, two devices.** The village and the arena both want a movement vector, a
look delta and discrete presses, so they share one `InputController` rather than each
growing its own copy. The on-screen stick writes into the same vector WASD does, and
neither scene knows which one the player used -- which is why touch support is one
implementation rather than two, and why forcing a scheme in Settings works live without a
reload.

**Presses are buffered.** An action pressed during another action's wind-up used to be
dropped on the floor, which reads as the controls ignoring you. A press now survives half
a second and fires the moment the robot is free. The deadline is counted in simulation
seconds rather than wall-clock: it is waiting on the robot's action lock, and the two
clocks drift apart whenever the sim is paused behind a panel.

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
    input.js             one input path for keyboard, mouse and touch
    device.js            capability detection and the three quality tiers
    settings.js          player preferences: control scheme, graphics, sensitivity
    rng.js               seeded PRNG so battles replay exactly in tests
  data/                  parts, medals, opponent roster, arenas, cups, event rotation
  render/                procedural robot models, arena scene, village scene, effects, camera
  ui/                    shell helpers, battle HUD, on-screen touch pad, and every screen
tests/                   rule tests + the balance simulation harness
vendor/three.module.js   Three.js r160 (MIT), vendored so there is no CDN dependency
```

## Content

The game design is an original homage to the classic part-swapping robot-battler genre.
All of the content here — the chassis families, parts, medals, opponents, arenas and
village — is original to this project. No third-party characters, names, artwork or assets
are used, and every model is generated procedurally at runtime from primitives.

Three.js is bundled under its MIT licence (`vendor/THREE-LICENSE.txt`).
