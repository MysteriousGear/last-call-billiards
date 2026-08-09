# 🎱 Last Call Billiards

**[▶ Play it here](https://mysteriousgear.github.io/last-call-billiards/)**

Pixel-art roguelike billiards where **space is drunk**. The table is flat and
rectangular like any pool table — but the felt carries a warped metric, so a
"straight" shot follows a geodesic that curves. Pool is already a game for
drunk people. This one makes the *geometry* drunk too.

## How to play

Pot the colored balls in any order, then the 8-ball. Sink the 8 too early, or
scratch on it, and the night is over.

- **Drag from the cue ball** to aim — direction and power. Release to shoot.
- The dashed line is the **true** path your shot will take, curves and
  cushion bounces included. It's honest — it's just *short*. Upgrade it.
- Every **4 shots you down a chaser**: the room goes soft for a moment and
  space tilts a step further. Chasers land between turns, so you always aim
  under the drunkenness you're about to play at.
- Between levels, **THE BAR** sells upgrades: a longer aim line, an
  object-ball bounce preview, a sober sip, wider pockets, extra shots, a tip
  jar.
- Some balls carry **powers** that fire when potted — cash, an extra shot, a
  new mid-table pocket, portals, or two shots where *every cushion is a
  pocket* (the cue ball included — good luck).

Three levels: **HAPPY HOUR → DOUBLE SHOT → LAST CALL**. Clear all three and
you've closed the bar.

## Install

It's a PWA — open the link on a phone and "Add to Home Screen" for a
fullscreen, offline-capable install. Landscape is strongly recommended; the
table is 16:9.

## Dev keys (temporary)

| Key | Effect |
|---|---|
| `D` | show the full-length aim trajectory |
| `N` | skip the current level (pays out, opens the shop) |

## Running it locally

No build step, no dependencies. Either open `index.html` directly, or serve
the folder (needed for the service worker):

```sh
python -m http.server 8000   # then visit http://localhost:8000
```

## How it works

Space over the felt carries a conformal metric `ds² = e^{2φ(x,y)}(dx²+dy²)`,
where φ is a sum of Gaussian bumps — the spilled drinks, visible as lighter
and darker patches. A geodesic of that metric, seen in ordinary table
coordinates, has signed curvature `k = ∇φ · n̂`, so the integrator just
rotates each ball's direction by `k·ds` per substep. Everything else —
friction, collisions, cushions — is plain flat-table physics.

The drunk *visuals* (swimming grid, screen wobble, double vision, the chaser
defocus) are strictly cosmetic. The physics and the aim line never disagree
with each other; the lie is only in your eyes.

See [SPEC.md](SPEC.md) for the full design doc and roadmap.

## Layout

```
index.html            boot, canvas, PWA wiring
src/geometry.js       warp field: φ, ∇φ, geodesic bend
src/physics.js        balls, cushions, pockets, portals, aim tracer
src/render.js         400×225 pixel buffer, drunk post-FX
src/game.js           run state, levels, shop, rules, input, audio
tools/mkicons.js      regenerates the PWA icons (pure Node)
experiments/          the original spherical-table prototype
```

`geometry.js` and `physics.js` are DOM-free and run under Node, which is how
the physics is smoke-tested (fuzzed shots for NaNs, escapes, and shots that
never come to rest).
