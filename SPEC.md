# Last Call Billiards — Design & Technical Spec

A pixel-art roguelike billiards game where **space itself is drunk**. The
table is a normal flat rectangle with cushions and six pockets — but shots
do not travel in straight lines, because the metric over the felt is warped.
The player's job is ordinary pool (pot the colors, then the 8-ball); the
game's job is to make them feel like they've had five beers while doing it.

> Earlier direction (billiards on a 3D sphere) was dropped in favor of this
> flat-table/warped-metric design. The sphere prototype is preserved at
> `experiments/sphere-table.html` for reference.

---

## 1. Design pillars

1. **Flat table, curved space.** The table looks like pool. The physics is a
   conformally-warped plane: "straight" shots follow geodesics that bend.
   The player must relearn aiming, not learn a new game.
2. **Feel drunk, play fair.** The aim line never lies (it traces the true
   geodesic), but it's *short*, and as runs progress the *rendering* gets
   drunker — the felt grid swims, the frame sways, double vision sets in.
   The lie is perceptual; the mechanics stay honest.
3. **Roguelike night out.** A run is one night at the bar: consecutive
   levels of escalating warp and weirdness, money earned per potted ball,
   a shop ("THE BAR") between levels, and harsh classic fail states
   (8-ball early = busted, out of shots = busted).
4. **Escalating mind-benders.** Beyond warp strength, later levels stack
   modifiers: portals, and eventually time travel, rule-swap cards
   (Baba-Is-You-style "CUE IS 8-BALL"), mirrored controls, etc.

## 2. Rules (current slice)

- Rack of colored balls + one 8-ball; cue ball on the left.
- Pot colors in any order → +$ each. Then pot the 8-ball → level clear.
- Pot the 8-ball while colors remain → **busted** (run over).
- Scratch on the 8-ball shot → **busted**.
- Scratch otherwise → cue respawns in the kitchen, −$10.
- Each level grants a shot budget; running out with balls up → **busted**.
- Clear level 3 → **YOU CLOSED THE BAR** (win screen).

### The chaser ramp (in-level difficulty curve)

Each level starts nearly sober: only **10%** of its warp value is active, so
the first shots play almost straight. Every **4 shots** the player downs a
chaser (mug icons in the HUD): **+35%** drunkenness per chaser, capped at
130%. Physics warp and drunk visuals scale together from the same factor,
so the world *feels* exactly as drunk as it *is*.

**Chasers land between turns, never mid-shot.** The step is applied when the
table comes to rest, so the shot you aimed always plays out at the
drunkenness you aimed it at, and you get to see the new geometry (and the
new aim line) before committing to the next one. Anything else reads as the
game cheating.

### The run (vertical slice)

| Level | Name | Colors | Warp bumps | Warp scale | Shots | Specials | Extras |
|---|---|---|---|---|---|---|---|
| 1 | HAPPY HOUR | 3 | 2 | 0.45 | 10 | 1 (simple) | honest rendering, mild grid warp |
| 2 | DOUBLE SHOT | 5 | 3 | 0.70 | 12 | 2 | grid swims |
| 3 | LAST CALL | 6 | 4 | 0.95 | 14 | 2 (any) | portal pair, screen wobble, double vision |

### Special balls

Random color balls carry a power (pulsing ring + tiny glyph) that triggers
**when the ball is potted**:

| Ball | Effect |
|---|---|
| TIP JAR ($) | +$25 |
| ON THE HOUSE (+) | +1 shot |
| FLOOR OPENS | permanent new pocket appears mid-table |
| RAILS ARE THIRSTY | for 2 shots, every cushion is a pocket (cue included — scratch risk!) |
| PORTAL CORK | spawns a portal pair if none exist |

Simple powers (cash/shot) unlock on level 1; the weird ones join the pool on
later levels. Potting a **portal ball while portals already exist** adds one
more portal — portals form a cycle (enter *i*, exit *i+1*), so every extra
portal rewires the whole network. Planned but not built: the **role-swap
ball** (for one turn you move the *table* under fixed balls, Baba-Is-You
style — pockets sliding under balls capture them, and the table keeps its
new position).

### The bartender's mercy

Once per run, the first time the 8-ball drops while colors remain, the
bartender fishes it out and replaces it near the rack instead of busting
you. The second time — any level, same run — is a bust. (Scratching on the
final 8-ball shot is still an immediate bust; mercy covers only the
too-soon case.)

### Table helpers (random per level)

High warp + a stranded cue ball can be hopeless, so each level rolls
assists that create playable lines *without* weakening the non-euclidean
physics itself:

| Helper | Behavior |
|---|---|
| **Euclidean patch** | pale dashed rectangle where geometry is flat: balls travel straight until they exit; the grid inside is visibly still |
| **Bridge** | wooden causeway, euclidean deck, railings on the long edges that balls bounce off — a guided corridor across drunk space |
| **Crane dock** | brass target ring; roll any ball onto it and a claw lifts it straight to the nearest pocket. One use per level. Won't take the cue ball, won't touch the 8-ball while colors remain |
| **Bar cat** | once per level, while the table is at rest, a tabby strolls up and paws a color ball (or the lone 8-ball) toward the nearest pocket. It aims straight; drunk space may disagree |

Level 1 gets one zone; levels 2–3 get a bridge plus a patch. The crane dock
appears with 60% probability. Zones affect the aim tracer identically to
the physics (the preview stays honest), and cat/crane pots pay out like any
other pot.

### Ambience toggles

Two toggles, as HUD corner buttons (mobile) and keys (desktop):

- **GLASS** (`T`): the felt turns translucent and the psychedelic backdrop
  shows through the table.
- **TRIP** (`C`): a slow global hue drift (≈40s per full cycle) over the
  whole world layer. HUD text stays sober.

### Ambience

Subtle trippy backdrop behind the table: twinkling stars, purple/blue
nebula blobs, rotating gears, drifting jellyfish, floating physics
equations. A goblin peeks over the bottom rail every ~35s at a random spot,
eyes tracking the cue ball. Downing a chaser is a moment: gulp-gulp-gulp
audio, the glass hits the bar, and your eyes lose focus — the whole frame
goes soft and sharpens back over ~1.6s (canvas `filter: blur()`, eased out).

### Dev keys (temporary)

| Key | Effect |
|---|---|
| **D** | toggle the full-length aim trajectory (1600px trace); "DEV PATH" shows in the HUD |
| **N** | skip the current level — takes the normal clear path, so it pays out and opens the shop |

Remove both before release.

## 4b. Platform / delivery

- **PWA**: `manifest.webmanifest` (fullscreen, landscape, maskable icons) +
  `sw.js` precaching the app shell, so the game installs to a home screen and
  runs offline. Icons are generated by `tools/mkicons.js` (pure Node, hand-
  rolled PNG encoder — no image deps) at 32/192/512.
- **Scaling**: the 400×225 buffer is fitted in *device* pixels — integer
  factor when it wastes under 20% of the screen, fractional otherwise, so a
  landscape phone fills its display instead of showing a postage stamp. The
  context carries the DPR transform; all drawing code stays in CSS pixels.
- **Mobile**: pointer events already unify mouse/touch; `touch-action: none`,
  no tap highlight, `viewport-fit=cover` with safe-area padding. Portrait
  phones get a dismissible "turn your phone" hint (the table is 16:9).
- Served from GitHub Pages; a `file://` open still works (classic scripts,
  service worker registration is skipped).

### Shop items (between levels)

| Item | Effect |
|---|---|
| LONGER LOOK | aim line +70px (stackable) |
| BOUNCE READER | shows the struck ball's departure direction |
| SOBER SIP | next level's warp −30% (stackable) |
| WIDE MOUTH | pockets +2px for the run |
| ONE MORE ROUND | +3 shots every level |
| TIP JAR | +$6 per potted color |

Economy: $12/color (+TIP JAR), $30 for the 8-ball, $20 level-clear bonus,
−$10 per scratch. 4 random items stocked per shop visit.

## 3. Physics & math

Space over the felt carries a conformal metric
`ds² = e^{2φ(x,y)} (dx² + dy²)` where φ is a sum of Gaussian bumps
("the drinks"), randomized per level, scaled by the level's warp value.

- A geodesic of that metric, seen in ordinary table coordinates, has signed
  curvature `k = ∇φ · n̂` (n̂ = unit normal to the direction of travel). So
  the integrator just rotates the velocity direction by `k·ds` each substep.
  Speed is handled separately: constant friction deceleration, so warp
  tuning and feel tuning stay independent.
- ∇φ is analytic (sum of Gaussian gradients) — no field sampling.
- Balls: equal-mass elastic collisions with restitution, resolved in plain
  table coordinates (local-flat approximation), positional de-overlap,
  fixed 240Hz substeps.
- Cushions: axis-aligned reflection with restitution.
- Pockets: capture when ball center enters pocket radius.
- Portals: non-oriented disc pair; a ball entering one exits the other with
  the same heading, with a cooldown until it fully leaves the exit disc.
  The aim tracer passes through portals too — the preview stays honest.
- Aim line: traces the *exact* same integrator (bend + cushion + portal)
  from the cue ball, stopping at the first ball contact or at the player's
  current aim-line length. Length is the upgrade lever.

## 4. Rendering

- 400×225 offscreen buffer, hard pixels, blitted to a display canvas with
  `imageSmoothingEnabled = false` at integer scale. Text drawn on the
  display canvas in Press Start 2P at integer multiples (the "sober layer" —
  HUD text never wobbles).
- Warp legibility: felt is tinted by φ contours (hills lighter, wells
  darker) so the player can *see* the drinks; a grid overlays the felt,
  displaced by ∇φ (exaggerated per level) plus a time-varying swim term.
- Drunk post-FX per level: grid warp → swim → frame wobble + ghost
  double-vision blit. All visual-only; physics is never affected.
- Balls are procedural pixel circles (dark rim, lit body, highlight blob,
  specular pixel).

## 5. Files

```
index.html          boot + canvas + font + PWA wiring + portrait hint
manifest.webmanifest PWA manifest
sw.js               service worker (offline app shell)
icons/              generated PNG icons (32/192/512)
tools/mkicons.js    regenerates the icons (pure Node)
src/geometry.js     warp field: bumps, φ, ∇φ, curvature, geodesic bend
src/physics.js      balls, cushions, pockets, portals, step(), tracePath()
src/render.js       pixel buffer, table/balls/aim/HUD/screens, drunk FX
src/game.js         run state, levels, shop, rules, input, audio, main loop
experiments/        old sphere-table prototype (reference only)
```

Vanilla JS, classic scripts (works over `file://`), zero dependencies.
`geometry.js` and `physics.js` are window-free and run under Node — see the
headless smoke test pattern (fuzz shots for NaN/escape/non-termination,
collision/pocket/portal/tracer checks).

## 6. Roadmap after the slice

- **More modifiers** (one new concept per level band, taught by a one-line
  intro tag): moving warp bumps ("someone's stirring"), time travel (rewind
  the last N seconds of ball motion, cue stays), rule cards à la Baba Is You
  ("CUE IS 8-BALL" — roles swap for one level), mirror table, gravity tide
  (warp field slowly rotates), lying aim line as a *curse* item.
- **Run structure:** more levels with a difficulty curve, run seeds,
  persistent meta-unlocks (new starting items), bosses ("THE REGULAR" —
  a rival who takes alternating shots?).
- **Feel:** ball-spin/english, better SFX, CRT scanline shader toggle,
  screenshake on hard breaks.
- **Ship:** itch.io web build first; Android via WebView wrapper (input is
  already pointer-unified; buffer scaling already handles any aspect).

## 7. Open questions

- Should busting on the 8-ball end the *run* (current, harsh) or cost money
  and rerack the level (kind)? Playtest.
- Difficulty of warp 0.95 + portals on level 3 — may need tuning per
  playtest; all knobs are constants at the top of `game.js`/`physics.js`.
- Whether money should also be the *health* resource (scratches literally
  drain your tab toward a bust at $0).
