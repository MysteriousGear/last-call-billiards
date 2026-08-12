/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — helpers.js
   Table helpers: the things that make a badly warped table playable without
   softening the geometry itself. Each helper owns its own placement and its
   own per-frame behaviour, so adding one means adding one entry here.

   A helper entry may define:
     place(world)        put it on the table (called on level build and on
                         every live edit in the dev TABLE SETUP menu)
     clear(world)        take it off
     update(ctx, dt)     per-frame behaviour; ctx is the bridge back to game.js
     busy(game)          true while it is mid-animation (blocks aiming and
                         holds the shot open until it has finished meddling)

   ctx = { game, world, run, now, say, sfx, pot, beginShot, table, PAL }
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};
  var Cfg = LCB.Config, Phys = LCB.Phys, Table = LCB.Table;
  var RECT = Cfg.RECT, R = Cfg.BALL_R, clamp = LCB.clamp;

  /* ── zone geometry (flat patches and bridges) ────────────────────────── */

  /**
   * A bridge is only worth crossing if it goes somewhere: its axis passes
   * exactly through a pocket, and the far end stops BRIDGE_GAP short, so a
   * ball that rides the corridor exits pointed at the hole with one last
   * stretch of drunk space to survive.
   *
   * The axis is tilted BRIDGE_TILT off the rail-parallel direction, in
   * whichever of the two directions swings the mouth toward the middle of the
   * table. A corridor lying flat along a rail can only be entered from along
   * that rail; angling it opens the mouth to the centre, where the cue ball
   * actually lives.
   */
  function bridgeToPocket(world) {
    var pk = world.pockets[Math.floor(Math.random() * world.pockets.length)];
    var mx = RECT.x + RECT.w / 2, my = RECT.y + RECT.h / 2;
    var dx = pk.x - mx, dy = pk.y - my;
    var len = 74 + Math.random() * 26, hw = 8;

    var base = Math.abs(dx) > Math.abs(dy)
      ? (dx < 0 ? Math.PI : 0)
      : (dy < 0 ? -Math.PI / 2 : Math.PI / 2);

    var best = null;
    for (var s = -1; s <= 1; s += 2) {
      var ang = base + s * Cfg.BRIDGE_TILT;
      var ux = Math.cos(ang), uy = Math.sin(ang);
      var ex = pk.x - ux * Cfg.BRIDGE_GAP, ey = pk.y - uy * Cfg.BRIDGE_GAP;
      var entX = ex - ux * len, entY = ey - uy * len;
      var reach = Math.hypot(entX - mx, entY - my);   // mouth nearest the middle wins
      if (!best || reach < best.reach)
        best = { reach: reach, ang: ang, cos: ux, sin: uy,
                 cx: ex - ux * (len / 2), cy: ey - uy * (len / 2) };
    }
    return { type: "bridge", aimAt: pk, cx: best.cx, cy: best.cy,
             ang: best.ang, cos: best.cos, sin: best.sin, len: len, hw: hw };
  }

  function euclidPatch() {
    var pw = 58 + Math.random() * 32, ph = 40 + Math.random() * 20;
    return {
      type: "euclid", w: pw, h: ph,
      x: RECT.x + 20 + Math.random() * (RECT.w * 0.65 - pw),
      y: RECT.y + 14 + Math.random() * (RECT.h - 28 - ph),
    };
  }

  function bridgeCorners(z) {
    var px = -z.sin, py = z.cos, hl = z.len / 2, out = [];
    for (var a = -1; a <= 1; a += 2)
      for (var b = -1; b <= 1; b += 2)
        out.push({ x: z.cx + z.cos * hl * a + px * z.hw * b,
                   y: z.cy + z.sin * hl * a + py * z.hw * b });
    return out;
  }

  function zoneBBox(z) {
    if (z.type !== "bridge") return { x: z.x, y: z.y, w: z.w, h: z.h };
    var c = bridgeCorners(z);
    var xs = c.map(function (p) { return p.x; }), ys = c.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Reject a zone that runs off the felt, traps a ball on a railing, or
      overlaps one already placed. */
  function zoneBlocked(z, world) {
    var i, bb = zoneBBox(z), placed = world.zones;

    if (z.type === "bridge") {
      var c = bridgeCorners(z);
      for (i = 0; i < c.length; i++)
        if (c[i].x < RECT.x + 2 || c[i].x > RECT.x + RECT.w - 2 ||
            c[i].y < RECT.y + 2 || c[i].y > RECT.y + RECT.h - 2) return true;

      for (i = 0; i < world.balls.length; i++) {
        var b = world.balls[i];
        // a ball resting on the deck is fine; resting ON a railing is not
        var u = (b.x - z.cx) * z.cos + (b.y - z.cy) * z.sin;
        if (Math.abs(u) > z.len / 2 + R * 2) continue;
        var v = -(b.x - z.cx) * z.sin + (b.y - z.cy) * z.cos;
        if (Math.abs(Math.abs(v) - z.hw) < R + 2) return true;
      }
    }
    for (i = 0; i < placed.length; i++) {
      var o = zoneBBox(placed[i]);
      if (bb.x < o.x + o.w && bb.x + bb.w > o.x &&
          bb.y < o.y + o.h && bb.y + bb.h > o.y) return true;
    }
    return false;
  }

  function placeZone(world, make) {
    for (var t = 0; t < 24; t++) {
      var z = make(world);
      if (!zoneBlocked(z, world)) { world.zones.push(z); return; }
    }
  }

  /* ── the helpers themselves ──────────────────────────────────────────── */

  var LIST = [
    {
      key: "euclid", name: "FLAT PATCH", desc: "flat ground, shots run straight",
      place: function (world) { placeZone(world, euclidPatch); },
    },
    {
      key: "bridge", name: "BRIDGE", desc: "railed corridor aimed at a pocket",
      place: function (world) { placeZone(world, bridgeToPocket); },
    },
    {
      key: "crane", name: "CRANE", desc: "dock a ball, the claw drops it in",
      place: function (world) {
        world.crane = {
          x: RECT.x + RECT.w * (0.28 + Math.random() * 0.3),
          y: RECT.y + RECT.h * (0.25 + Math.random() * 0.5),
          r: 7,
          used: world.craneUsed,   // survives toggling in the dev menu
        };
      },
      clear: function (world) { world.crane = null; },
      busy: function (game) { return !!game.craneAnim; },
      update: updateCrane,
    },
    {
      key: "cat", name: "BAR CAT", desc: "nudges one ball to a better spot",
      place: function (world) { world.catAllowed = true; },
      clear: function (world) { world.catAllowed = false; },
      busy: function (game) { return !!(game.cat && game.cat.armed); },
      update: updateCat,
    },
    {
      key: "yin", name: "YIN-YANG", desc: "swaps the cue and the 8-ball",
      place: function (world) { world.yinAllowed = true; },
      clear: function (world) { world.yinAllowed = false; },
      busy: function (game) { return !!game.yin; },
      update: updateYin,
    },
  ];

  var BY_KEY = {};
  LIST.forEach(function (h) { BY_KEY[h.key] = h; });

  /**
   * The crane dock: roll any ball onto it and a claw carries it straight to
   * the nearest pocket. One lift per level. It won't take the cue ball, and
   * it won't touch the 8-ball while colors remain.
   */
  function updateCrane(ctx, dt) {
    var world = ctx.world, cr = world.crane, ca = ctx.game.craneAnim;

    if (ca) {                                   // animate the lift, deliver at the end
      if (ctx.now() - ca.t0 >= ca.dur) {
        ctx.sfx.pocket();
        ctx.pot(ca.b);
        ctx.game.craneAnim = null;
      }
      return;
    }
    if (!cr || cr.used) return;
    for (var i = 0; i < world.balls.length; i++) {
      var b = world.balls[i];
      if (b.sunk || b.color === "cue") continue;
      if (b.color === "eight" && Table.colorsLeft(world) > 0) continue;
      if (Math.hypot(b.x - cr.x, b.y - cr.y) > cr.r + b.r) continue;

      cr.used = true;
      world.craneUsed = true;
      ctx.beginShot();
      b.sunk = true; b.vx = 0; b.vy = 0;         // off the table while airborne
      var pk = Table.nearestPocket(world, b.x, b.y);
      ctx.game.craneAnim = { b: b, from: { x: b.x, y: b.y },
                             to: { x: pk.x, y: pk.y }, t0: ctx.now(), dur: 1.4 };
      ctx.sfx.crane();
      ctx.say("the crane obliges", ctx.PAL.accent, 2400);
      return;
    }
  }

  /**
   * The bar cat. Once per level, table at rest, it pads up to a color ball —
   * or the lone 8-ball — and *taps* it toward the nearest pocket to improve
   * your position. It only commits to a real pot from inside CAT_COMMIT.
   */
  function updateCat(ctx, dt) {
    var world = ctx.world, cat = ctx.game.cat;
    if (cat) {
      if (cat.armed && ctx.now() - cat.t0 >= 0.9) {          // the swipe
        cat.armed = false;
        var b = cat.ball;
        if (!b.sunk) {
          ctx.beginShot();
          b.vx = cat.dir.x * cat.speed;
          b.vy = cat.dir.y * cat.speed;
          ctx.sfx.meow();
          ctx.say(cat.commit ? "the cat sinks it. smug."
                             : "the cat improves your position", ctx.PAL.ok, 2400);
        }
      }
      if (ctx.now() - cat.t0 > 2.4) ctx.game.cat = null;
      return;
    }
    if (world.catDone || !world.catAllowed) return;          // strictly once
    if (ctx.shotOpen() || ctx.game.craneAnim || ctx.game.yin) return;
    if (Phys.anyMoving(world)) return;
    if (Math.random() > dt / Cfg.CAT_EVERY) return;

    var pool = world.balls.filter(function (b) {
      return !b.sunk && b.color !== "cue" && b.color !== "eight";
    });
    if (!pool.length) pool = world.balls.filter(function (b) {
      return !b.sunk && b.color === "eight";
    });
    if (!pool.length) return;

    var ball = pool[Math.floor(Math.random() * pool.length)];
    var pk = Table.nearestPocket(world, ball.x, ball.y);
    var dx = pk.x - ball.x, dy = pk.y - ball.y;
    var dd = Math.hypot(dx, dy) || 1;

    var commit = dd < Cfg.CAT_COMMIT;
    var travel = commit ? dd + 14 : Cfg.CAT_NUDGE + Math.random() * Cfg.CAT_NUDGE_VAR;
    var speed = Math.sqrt(2 * Phys.FRICTION * travel);
    var jitter = (Math.random() - 0.5) * (commit ? 0.10 : 0.34);
    var cs = Math.cos(jitter), sn = Math.sin(jitter);
    var dir = { x: (dx * cs - dy * sn) / dd, y: (dx * sn + dy * cs) / dd };

    world.catDone = true;
    ctx.game.cat = {
      ball: ball, dir: dir, speed: speed, commit: commit,
      t0: ctx.now(), armed: true,
      x: ball.x - dir.x * 14, y: ball.y - dir.y * 14,
    };
  }

  /**
   * Yin-yang: once per level, cue and 8-ball trade places. They turn a
   * half-circle about their shared midpoint while the symbol rises over them,
   * because the swap needs to be *seen* to be understood.
   */
  function updateYin(ctx, dt) {
    var world = ctx.world, y = ctx.game.yin;
    if (y) {
      if (ctx.now() - y.t0 >= y.dur) {
        var ax = y.a.x, ay = y.a.y;
        y.a.x = y.b.x; y.a.y = y.b.y;
        y.b.x = ax;    y.b.y = ay;
        y.a.vx = y.a.vy = y.b.vx = y.b.vy = 0;
        y.a.portalCd = y.b.portalCd = -1;
        ctx.game.yin = null;
        ctx.say("cue and 8 have traded places", ctx.PAL.accent, 3000);
      }
      return;
    }
    if (world.yinDone || !world.yinAllowed) return;
    if (ctx.shotOpen() || ctx.game.craneAnim || ctx.game.cat) return;
    if (Phys.anyMoving(world)) return;
    if (Math.random() > dt / Cfg.YIN_EVERY) return;

    var cue = Table.cueBall(world), eight = Table.ballOfColor(world, "eight");
    if (!cue || !eight || cue.sunk || eight.sunk) return;

    world.yinDone = true;
    ctx.game.yin = { a: cue, b: eight, t0: ctx.now(), dur: 1.7 };
    ctx.sfx.yin();
    ctx.say("YIN AND YANG", ctx.PAL.text, 2000);
  }

  /* ── selection ───────────────────────────────────────────────────────── */

  LCB.Helpers = {
    list: LIST,
    byKey: BY_KEY,

    /** n random distinct helper keys, capped at HELPER_MAX. */
    randomSet: function (n) {
      if (!n) return [];
      var pool = LCB.shuffle(LIST.map(function (h) { return h.key; }));
      return pool.slice(0, Math.min(n, Cfg.HELPER_MAX));
    },

    /**
     * Put exactly the chosen helpers on the table. Safe to call mid-level —
     * the dev setup menu calls it live on every toggle. Per-level "already
     * spent" flags live on the world, so toggling is never a refill.
     */
    apply: function (world, keys) {
      world.zones = [];
      LIST.forEach(function (h) { if (h.clear) h.clear(world); });
      keys.forEach(function (k) {
        var h = BY_KEY[k];
        if (h && h.place) h.place(world);
      });
    },

    /** Run every helper's per-frame behaviour. */
    update: function (ctx, dt) {
      for (var i = 0; i < LIST.length; i++)
        if (LIST[i].update) LIST[i].update(ctx, dt);
    },

    /** True while any helper is mid-animation. */
    busy: function (game) {
      for (var i = 0; i < LIST.length; i++)
        if (LIST[i].busy && LIST[i].busy(game)) return true;
      return false;
    },

    // exposed for tests and for the renderer
    bridgeToPocket: bridgeToPocket,
    euclidPatch: euclidPatch,
    bridgeCorners: bridgeCorners,
  };
})(typeof window !== "undefined" ? window : globalThis);
