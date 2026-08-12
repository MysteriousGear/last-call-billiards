/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — render-table.js
   The world layer: rails, felt, the warp tint, the swimming grid, zones,
   pockets, portals, balls, the aim line, and the helper animations (crane,
   cat, yin-yang).

   The world is drawn honestly — the grid swims and the frame sways, but the
   aim line and the physics never disagree. The lie is perceptual, not
   mechanical.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};
  var Cfg = LCB.Config, Geo = LCB.Geo, Phys = LCB.Phys, R = LCB.Render;
  var PAL = Cfg.PAL, BALLS = Cfg.BALL_COLORS;

  /* ── zones ───────────────────────────────────────────────────────────── */

  function inBridge(world, x, y) {
    var zs = world.zones;
    if (!zs) return false;
    for (var i = 0; i < zs.length; i++)
      if (zs[i].type === "bridge" && Phys.inZone(zs[i], x, y)) return true;
    return false;
  }

  /**
   * Bridges sit at an angle, so the deck is rasterized per pixel rather than
   * filled as a rect — canvas rotation would antialias the edges and break
   * the pixel look. It never moves, so bake it once and blit thereafter.
   */
  function bridgeSprite(z) {
    if (z._spr) return z._spr;
    var hl = z.len / 2, pad = 2;
    var ex = Math.abs(z.cos) * hl + Math.abs(z.sin) * z.hw + pad;
    var ey = Math.abs(z.sin) * hl + Math.abs(z.cos) * z.hw + pad;
    var ox = Math.floor(z.cx - ex), oy = Math.floor(z.cy - ey);
    var w = Math.ceil(ex * 2) + 1, h = Math.ceil(ey * 2) + 1;

    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    var c = cv.getContext("2d");
    for (var py = 0; py < h; py++) {
      for (var px = 0; px < w; px++) {
        var dx = ox + px - z.cx, dy = oy + py - z.cy;
        var u = dx * z.cos + dy * z.sin;
        var v = -dx * z.sin + dy * z.cos;
        if (Math.abs(u) > hl || Math.abs(v) > z.hw) continue;
        var onRail = Math.abs(v) > z.hw - 1.6;
        var seam = !onRail && (Math.round(u + hl) % 6) === 0;
        c.fillStyle = onRail ? PAL.railLight : (seam ? PAL.railDark : PAL.rail);
        c.fillRect(px, py, 1, 1);
      }
    }
    z._spr = { cv: cv, ox: ox, oy: oy };
    return z._spr;
  }

  function drawZones(game) {
    var zs = game.world.zones, c = R.bctx;
    if (!zs) return;
    var base = game.glass ? 0.45 : 1;
    for (var i = 0; i < zs.length; i++) {
      var z = zs[i];
      if (z.type === "bridge") {
        var sp = bridgeSprite(z);
        R.alpha(base);
        c.drawImage(sp.cv, sp.ox, sp.oy);
      } else {
        // euclidean patch: a pale calm island with a dashed border
        R.alpha(0.08 * base);
        R.fill(z.x, z.y, z.w, z.h, "#cfd8ff");
        R.alpha(0.5);
        c.fillStyle = "#7fd6c0";
        var s;
        for (s = 0; s < z.w; s += 4) {
          c.fillRect((z.x + s) | 0, z.y | 0, 2, 1);
          c.fillRect((z.x + s) | 0, (z.y + z.h) | 0, 2, 1);
        }
        for (s = 0; s < z.h; s += 4) {
          c.fillRect(z.x | 0, (z.y + s) | 0, 1, 2);
          c.fillRect((z.x + z.w) | 0, (z.y + s) | 0, 1, 2);
        }
      }
    }
    R.alpha(1);
  }

  /* ── balls ───────────────────────────────────────────────────────────── */

  function drawBall(b, t) {
    if (b.sunk) return;
    var c = BALLS[b.color] || BALLS.red;
    var x = Math.round(b.x), y = Math.round(b.y), r = b.r;
    R.pixCircle(x, y, r, c.dark);                            // rim
    R.pixCircle(x - 1, y - 1, r - 1, c.base);                // lit body
    R.pixCircle(x - 2, y - 2, Math.max(1, r - 4), c.light);  // highlight
    R.fill(x - 2, y - 3, 1, 1, "#ffffff");                   // specular
    if (b.color === "eight") {
      R.fill(x - 1, y - 1, 3, 3, "#f2ede4");
      R.fill(x, y, 1, 1, "#23232c");
    }
    if (b.special) {
      var s = LCB.Specials.byKey[b.special];
      R.alpha(0.5 + 0.4 * Math.sin(t * 5));
      R.pixRing(x, y, r + 2, (s && s.tint) || "#ffffff", t * 3);
      R.alpha(1);
      if (s && s.glyph) s.glyph(R, x, y);                    // each power draws itself
    }
  }

  /* ── helper animations ───────────────────────────────────────────────── */

  function drawCrane(game, t) {
    var cr = game.world.crane, ca = game.craneAnim, c = R.bctx;
    if (cr) {
      var col = cr.used ? "#5a5346" : PAL.pocketRim;
      if (!cr.used) {
        R.alpha(0.6 + 0.4 * Math.sin(t * 3));
        R.pixRing(cr.x, cr.y, cr.r + 2, col, t * 1.5);
      }
      R.alpha(cr.used ? 0.4 : 1);
      R.pixRing(cr.x, cr.y, cr.r, col);
      R.fill(cr.x - 1, cr.y - 3, 1, 4, col);                 // hook glyph
      R.fill(cr.x - 2, cr.y, 3, 1, col);
      R.alpha(1);
    }
    if (!ca) return;
    var p = Math.min(1, (t - ca.t0) / ca.dur);
    var e = p * p * (3 - 2 * p);
    var x = ca.from.x + (ca.to.x - ca.from.x) * e;
    var y = ca.from.y + (ca.to.y - ca.from.y) * e;
    var lift = Math.sin(Math.min(1, p * 1.15) * Math.PI) * 7;
    R.fill(x, 0, 1, y - lift, "#8a8378");                    // cable from on high
    R.alpha(0.35);
    R.pixCircle(x, y, 3, "#07070c");                         // shadow stays down
    R.alpha(1);
    drawBall({ x: x, y: y - lift, r: ca.b.r, color: ca.b.color, sunk: false }, t);
    R.fill(x - 2, y - lift - ca.b.r - 2, 5, 2, "#8a8378");   // the claw
  }

  function drawCat(game, t) {
    var cat = game.cat;
    if (!cat) return;
    var age = t - cat.t0;
    var fade = Math.max(0, Math.min(1, age / 0.4, (2.4 - age) / 0.4));
    if (fade <= 0) return;
    R.alpha(fade);
    // it pads in as softly as it pads out, walking the last few pixels
    var walk = 1 - Math.min(1, age / 0.4);
    var x = Math.round(cat.x - walk * cat.dir.x * 9);
    var y = Math.round(cat.y - walk * cat.dir.y * 9);

    R.fill(x - 5, y - 2, 9, 5, "#e8963e");                   // body
    R.fill(x - 4, y - 1, 2, 1, "#b06a24"); R.fill(x - 1, y - 1, 2, 1, "#b06a24");
    R.fill(x + 2, y - 5, 5, 5, "#e8963e");                   // head
    R.fill(x + 2, y - 6, 1, 2, "#e8963e"); R.fill(x + 6, y - 6, 1, 2, "#e8963e");
    R.fill(x + 3, y - 4, 1, 1, "#1a1a20"); R.fill(x + 5, y - 4, 1, 1, "#1a1a20");
    var tw = Math.round(Math.sin(t * 5) * 2);                // tail with its own ideas
    R.fill(x - 7, y - 3 + tw, 2, 1, "#e8963e");
    R.fill(x - 8, y - 4 + tw, 2, 1, "#b06a24");

    var reach = age < 0.9 ? age / 0.9 * 6 : Math.max(0, 6 - (age - 0.9) * 20);
    if (reach > 0.5)
      R.fill(Math.round(x + 6 + cat.dir.x * reach),
             Math.round(y - 1 + cat.dir.y * reach), 2, 2, "#f6e3c0");
    R.alpha(1);
  }

  /** The two balls turn a half-circle about their midpoint under a rising
      yin-yang. Positions only commit at the end, so this draws them itself. */
  function drawYin(game, t) {
    var y = game.yin, c = R.bctx;
    if (!y) return;
    var p = Math.min(1, (t - y.t0) / y.dur);
    var e = p * p * (3 - 2 * p);
    var mx = (y.a.x + y.b.x) / 2, my = (y.a.y + y.b.y) / 2;
    var ang = Math.PI * e, ca = Math.cos(ang), sa = Math.sin(ang);

    [y.a, y.b].forEach(function (ball) {
      var dx = ball.x - mx, dy = ball.y - my;
      drawBall({ x: mx + dx * ca - dy * sa, y: my + dx * sa + dy * ca,
                 r: ball.r, color: ball.color, sunk: false }, t);
    });

    R.alpha(0.5 * (1 - p));                                  // halo rings
    R.pixRing(mx, my, 8 + e * 26, "#f2ede4", t * 2);
    R.pixRing(mx, my, 4 + e * 18, "#23232c", -t * 2);

    var gy = my - 10 - e * 22, RAD = 7;                      // the symbol, rising
    R.alpha(Math.min(1, (1 - p) * 1.6));
    for (var oy = -RAD; oy <= RAD; oy++) {
      for (var ox = -RAD; ox <= RAD; ox++) {
        if (ox * ox + oy * oy > RAD * RAD) continue;
        var col;
        if (Math.hypot(ox, oy + RAD / 2) <= RAD / 2) col = "#23232c";
        else if (Math.hypot(ox, oy - RAD / 2) <= RAD / 2) col = "#f2ede4";
        else col = oy < 0 ? "#f2ede4" : "#23232c";
        c.fillStyle = col;
        c.fillRect(Math.round(mx + ox), Math.round(gy + oy), 1, 1);
      }
    }
    R.fill(mx, gy - RAD / 2, 1, 1, "#f2ede4");               // the two eyes
    R.fill(mx, gy + RAD / 2, 1, 1, "#23232c");
    R.alpha(1);
  }

  /* ── the table ───────────────────────────────────────────────────────── */

  function visualDisp(game, x, y, t) {
    // euclidean ground: the grid is dead straight there — that's the point
    if (Phys.inEuclid(game.world, x, y)) return { x: 0, y: 0 };
    var vis = game.vis || game.level.visuals;
    var g = Geo.grad(game.world.field, x, y);
    var dx = g.x * vis.gridWarp * 90;
    var dy = g.y * vis.gridWarp * 90;
    if (vis.swim > 0) {
      dx += Math.sin(t * 0.9 + y * 0.045) * vis.swim;
      dy += Math.cos(t * 0.7 + x * 0.035) * vis.swim;
    }
    return { x: dx, y: dy };
  }

  /** Glass mode: no wood, no felt — a minimal pale chassis holding the void. */
  function drawGlassFrame(rect, rail) {
    var C = PAL.chrome, D = PAL.chromeDim, c = R.bctx;
    var x0 = rect.x - rail, y0 = rect.y - rail;
    var w = rect.w + rail * 2, h = rect.h + rail * 2;
    R.alpha(0.5);
    R.fill(x0, y0, w, 1, D); R.fill(x0, y0 + h - 1, w, 1, D);
    R.fill(x0, y0, 1, h, D); R.fill(x0 + w - 1, y0, 1, h, D);
    R.alpha(0.85);
    R.fill(rect.x - 1, rect.y - 1, rect.w + 2, 1, C);
    R.fill(rect.x - 1, rect.y + rect.h, rect.w + 2, 1, C);
    R.fill(rect.x - 1, rect.y - 1, 1, rect.h + 2, C);
    R.fill(rect.x + rect.w, rect.y - 1, 1, rect.h + 2, C);
    [[x0, y0, 1, 1], [x0 + w - 1, y0, -1, 1],
     [x0, y0 + h - 1, 1, -1], [x0 + w - 1, y0 + h - 1, -1, -1]]
      .forEach(function (k) {                                 // corner brackets
        for (var i = 0; i < rail; i++) c.fillRect(k[0] + k[2] * i, k[1] + k[3] * i, 1, 1);
      });
    R.alpha(1);
  }

  function drawTable(game, t) {
    var rect = game.world.rect, rail = Cfg.RAIL, c = R.bctx;

    if (game.glass) {
      drawGlassFrame(rect, rail);
    } else {
      R.fill(rect.x - rail, rect.y - rail, rect.w + rail * 2, rect.h + rail * 2, PAL.rail);
      R.fill(rect.x - rail, rect.y - rail, rect.w + rail * 2, 2, PAL.railLight);
      R.fill(rect.x - rail, rect.y + rect.h + rail - 2, rect.w + rail * 2, 2, PAL.railDark);
    }

    if (game.world.railMouth > 0) {          // the whole frame goes hungry
      R.alpha(0.55 + 0.35 * Math.sin(t * 6));
      R.fill(rect.x - 3, rect.y - 3, rect.w + 6, 3, PAL.pocket);
      R.fill(rect.x - 3, rect.y + rect.h, rect.w + 6, 3, PAL.pocket);
      R.fill(rect.x - 3, rect.y, 3, rect.h, PAL.pocket);
      R.fill(rect.x + rect.w, rect.y, 3, rect.h, PAL.pocket);
      R.alpha(1);
    }

    var glassMul = game.glass ? 0.22 : 1;
    if (!game.glass) R.fill(rect.x, rect.y, rect.w, rect.h, PAL.feltBase);

    // warp contour tint: the spilled drinks — hills lighter, wells darker
    var cell = 4;
    for (var y = rect.y; y < rect.y + rect.h; y += cell) {
      for (var x = rect.x; x < rect.x + rect.w; x += cell) {
        var v = Geo.phi(game.world.field, x + 2, y + 2);
        if (Math.abs(v) < 0.06) continue;
        R.alpha(Math.min(0.5, Math.abs(v) * 0.6) * glassMul);
        c.fillStyle = v > 0 ? PAL.feltHill : PAL.feltWell;
        c.fillRect(x, y, cell, cell);
      }
    }
    R.alpha(1);

    drawZones(game);

    // grid lines, displaced by the visual warp — this is what "swims"
    c.fillStyle = game.glass ? PAL.gridGlass : PAL.grid;
    R.alpha(game.glass ? 0.3 : 0.55);
    var gx, gy, p;
    for (gx = rect.x + 22; gx < rect.x + rect.w; gx += 22) {
      for (gy = rect.y; gy < rect.y + rect.h; gy += 2) {
        p = visualDisp(game, gx, gy, t);
        var px = gx + p.x, py = gy + p.y;
        if (px > rect.x && px < rect.x + rect.w - 1 && py > rect.y &&
            py < rect.y + rect.h - 1 && !inBridge(game.world, px, py))
          c.fillRect(px | 0, py | 0, 1, 1);
      }
    }
    for (gy = rect.y + 22; gy < rect.y + rect.h; gy += 22) {
      for (gx = rect.x; gx < rect.x + rect.w; gx += 2) {
        p = visualDisp(game, gx, gy, t);
        var qx = gx + p.x, qy = gy + p.y;
        if (qx > rect.x && qx < rect.x + rect.w - 1 && qy > rect.y &&
            qy < rect.y + rect.h - 1 && !inBridge(game.world, qx, qy))
          c.fillRect(qx | 0, qy | 0, 1, 1);
      }
    }
    R.alpha(1);

    for (var i = 0; i < game.world.pockets.length; i++) {    // pockets
      var pk = game.world.pockets[i];
      R.alpha(game.glass ? 0.35 : 1);
      R.pixCircle(pk.x, pk.y, pk.r, PAL.pocket);
      R.alpha(1);
      R.pixRing(pk.x, pk.y, pk.r, PAL.pocketRim);
    }

    var ps = game.world.portals;                             // the portal cycle
    if (ps && ps.length >= 2) {
      for (i = 0; i < ps.length; i++) {
        var col = Cfg.PORTAL_COLORS[i % Cfg.PORTAL_COLORS.length];
        R.pixCircle(ps[i].x, ps[i].y, ps[i].r - 2, "#120a1c");
        R.pixRing(ps[i].x, ps[i].y, ps[i].r, col, t * 2.4);
        R.pixRing(ps[i].x, ps[i].y, ps[i].r - 2, col, -t * 3.2);
      }
    }

    drawCrane(game, t);
  }

  /* ── the aim line ────────────────────────────────────────────────────── */

  function drawAim(game, t) {
    var aim = game.aim, c = R.bctx;
    if (!aim || !aim.active || !aim.trace) return;
    var pts = aim.trace.pts;
    var cue = LCB.Table.cueBall(game.world);

    // The cue stick sits behind the ball, on the side you are dragging
    // toward. The shot goes the other way, so the line you are reading is
    // never under your own finger.
    if (aim.pull && cue) {
      var back = cue.r + 3 + aim.power * 16;
      for (var s = back; s < back + 32; s++) {
        var wx = cue.x + aim.pull.x * s, wy = cue.y + aim.pull.y * s;
        c.fillStyle = s < back + 4 ? "#e8e0cf" : (s < back + 10 ? "#8a5530" : "#6b3f23");
        c.fillRect(wx | 0, wy | 0, 1, 1);
        c.fillRect((wx - aim.pull.y) | 0, (wy + aim.pull.x) | 0, 1, 1);
      }
    }

    // dashed geodesic: the truth, but only as far as your eyes can afford
    for (var i = 0; i < pts.length; i++) {
      if ((i % 6) > 2) continue;
      R.alpha(1 - (i / pts.length) * 0.65);
      c.fillStyle = i < 4 ? PAL.accent : PAL.text;
      c.fillRect(pts[i].x | 0, pts[i].y | 0, 1, 1);
    }
    R.alpha(1);

    var hit = aim.trace.hit;
    if (hit) {
      R.pixRing(hit.x, hit.y, cue.r, PAL.accent, t * 4);
      if (game.run.items.bounceReader) {                     // where it departs
        c.fillStyle = (BALLS[hit.ball.color] || BALLS.red).light;
        for (var d = 4; d < 26; d += 2)
          c.fillRect((hit.ball.x + hit.nx * d) | 0, (hit.ball.y + hit.ny * d) | 0, 1, 1);
      }
    }
  }

  /* ── the world layer ─────────────────────────────────────────────────── */

  R.layers.world = function (game, t) {
    drawTable(game, t);
    for (var i = 0; i < game.world.balls.length; i++) {
      var b = game.world.balls[i];
      // the yin-yang animation draws its own two balls, mid-swap
      if (game.yin && (b === game.yin.a || b === game.yin.b)) continue;
      drawBall(b, t);
    }
    drawYin(game, t);
    drawCat(game, t);
    if (game.state === "play") drawAim(game, t);
  };

  R.drawBall = drawBall;
})(typeof window !== "undefined" ? window : globalThis);
