/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — render.js
   Everything is drawn into a 400×225 offscreen buffer with hard pixels, then
   blitted to the display canvas with smoothing off (and, at higher drunk
   levels, with wobble and double vision). Text is drawn on the display canvas
   in Press Start 2P at integer multiples so it stays crisp.

   The world is rendered honestly at low drunkenness; as levels rise the felt
   grid swims and the whole frame sways — but the aim line and physics never
   disagree. The lie is perceptual, not mechanical.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var Geo = root.Geo;
  var Phys = root.Phys;

  var BW = 400, BH = 225;

  var PAL = {
    bg: "#0d0a12",
    feltBase: "#1c5c3e",
    feltHill: "#2e7a52",
    feltWell: "#123f2b",
    grid: "#2a7a52",
    railDark: "#4a2b17",
    rail: "#6b3f23",
    railLight: "#8a5530",
    pocket: "#07070c",
    pocketRim: "#c7a06a",
    text: "#f2ede4",
    dim: "#9a917f",
    accent: "#f2c230",
    danger: "#e23d3d",
    ok: "#3fbf5f",
    card: "#1a1522",
    cardHi: "#2a2136",
  };

  var BALL_COLORS = {
    cue:    { base: "#f2ede4", dark: "#b8ad97", light: "#ffffff" },
    red:    { base: "#e23d3d", dark: "#8f1f26", light: "#ff8a7a" },
    yellow: { base: "#f2c230", dark: "#a3761c", light: "#ffe89a" },
    blue:   { base: "#3d6de2", dark: "#22398f", light: "#8ab2ff" },
    purple: { base: "#a04ad6", dark: "#5c2585", light: "#d69aff" },
    orange: { base: "#f07f2e", dark: "#96431a", light: "#ffc08a" },
    green:  { base: "#3fbf5f", dark: "#1f6f38", light: "#9affb4" },
    eight:  { base: "#23232c", dark: "#0d0d13", light: "#4a4a5c" },
  };

  var canvas, dctx, buf, bctx, scale = 2, offX = 0, offY = 0;
  var dpr = 1, cssW = BW, cssH = BH;
  var buttons = [];

  /* backdrop actors — generated once */
  var stars = [], blobs = [], jellies = [];
  var GEARS = [
    { x: 9, y: 208, r: 8, sp: 0.5 }, { x: 391, y: 14, r: 10, sp: -0.35 },
    { x: 6, y: 16, r: 6, sp: 0.7 },
  ];
  // Several of these drift across the table's own band (y 44..186) so the
  // glass table has something worth looking at underneath it.
  var EQNS = [
    { s: "ds²=e²ᵠ(dx²+dy²)", x: 40, y: 14, sp: 3 },
    { s: "k=∇φ·n̂", x: 300, y: 218, sp: -4 },
    { s: "φ→∞ ?", x: 180, y: 222, sp: 5 },
    { s: "R³⋉(hic)", x: 250, y: 10, sp: -2.5 },
    { s: "∮ dθ = 2π − ∬K dA", x: 20, y: 62, sp: 2.2 },
    { s: "exp(−r²/2σ²)", x: 260, y: 108, sp: -3.4 },
    { s: "K = −e^{−2φ}Δφ", x: 120, y: 156, sp: 2.8 },
    { s: "one more?", x: 330, y: 132, sp: -1.8 },
  ];

  function initBackdrop() {
    var i;
    for (i = 0; i < 70; i++)
      stars.push({ x: Math.random() * BW, y: Math.random() * BH,
                   tw: Math.random() * 6.28, big: Math.random() < 0.12 });
    for (i = 0; i < 6; i++)
      blobs.push({ x: Math.random() * BW, y: Math.random() * BH,
                   r: 8 + Math.random() * 16, ph: Math.random() * 6.28,
                   sp: 0.06 + Math.random() * 0.1, warm: i % 2 === 0 });
    // spread across the width, not just the margins, so they swim behind
    // the table and are visible once the felt turns to glass
    [12, 96, 188, 286, 388].forEach(function (x) {
      jellies.push({ x: x, y: Math.random() * 225, ph: Math.random() * 6 });
    });
  }

  function init(cv) {
    canvas = cv;
    dctx = cv.getContext("2d");
    buf = document.createElement("canvas");
    buf.width = BW; buf.height = BH;
    bctx = buf.getContext("2d");
    initBackdrop();
    resize();
    root.addEventListener("resize", resize);
  }

  /**
   * Fit the 400x225 buffer to the screen.
   * Scaling is chosen in *device* pixels so phone displays stay crisp: take
   * the integer factor when it wastes little (<20%), otherwise fall back to
   * fractional so a landscape phone fills its screen instead of showing a
   * postage stamp. The context carries the DPR transform, so every drawing
   * call elsewhere keeps working in CSS pixels.
   */
  function resize() {
    cssW = root.innerWidth; cssH = root.innerHeight;
    dpr = Math.min(root.devicePixelRatio || 1, 3);

    var sd = Math.min(cssW * dpr / BW, cssH * dpr / BH); // device-px factor
    var id = Math.floor(sd);
    var dev = (id >= 1 && id / sd > 0.8) ? id : sd;
    scale = dev / dpr;                                    // css-px factor

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.imageSmoothingEnabled = false;

    // snap the letterbox offsets to whole device pixels
    offX = Math.round((cssW - BW * scale) / 2 * dpr) / dpr;
    offY = Math.round((cssH - BH * scale) / 2 * dpr) / dpr;
  }

  /** client-space pointer → buffer coordinates. */
  function toBuffer(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - offX) / scale, y: (cy - r.top - offY) / scale };
  }

  /* ── pixel primitives (buffer space) ─────────────────────────────────── */

  function fill(x, y, w, h, c) { bctx.fillStyle = c; bctx.fillRect(x | 0, y | 0, w, h); }

  function pixCircle(cx, cy, r, c) {
    bctx.fillStyle = c;
    cx |= 0; cy |= 0;
    for (var dy = -r; dy <= r; dy++) {
      var w = Math.floor(Math.sqrt(r * r - dy * dy));
      bctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    }
  }

  function pixRing(cx, cy, r, c, dashT) {
    bctx.fillStyle = c;
    var n = Math.max(12, r * 6);
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + (dashT || 0);
      if (dashT !== undefined && (i % 6) > 3) continue;
      bctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }

  /* ── text & buttons (display space, coords given in buffer units) ────── */

  /* Text is queued and flushed AFTER the buffer blit so it never gets
     painted over — and so the HUD stays on the sober layer, unwobbled. */
  var textQueue = [];
  function text(str, x, y, size, color, align, alpha) {
    textQueue.push({ s: str, x: x, y: y, sz: size, c: color || PAL.text,
                     a: align || "left", al: alpha === undefined ? 1 : alpha });
  }
  function flushText(game, t) {
    dctx.textBaseline = "top";
    // text goes soft with the rest of the room during a chaser
    var blur = game ? defocusPx(game, t) * 0.55 : 0;
    dctx.filter = blur > 0.05 ? "blur(" + blur.toFixed(2) + "px)" : "none";
    for (var i = 0; i < textQueue.length; i++) {
      var q = textQueue[i];
      dctx.globalAlpha = q.al;
      dctx.fillStyle = q.c;
      dctx.font = Math.round(q.sz * scale) + 'px "Press Start 2P", monospace';
      dctx.textAlign = q.a;
      dctx.fillText(q.s, offX + q.x * scale, offY + q.y * scale);
    }
    dctx.globalAlpha = 1;
    dctx.filter = "none";
    textQueue = [];
  }

  function button(id, x, y, w, h, label, hot, size) {
    fill(x, y, w, h, hot ? PAL.cardHi : PAL.card);
    fill(x, y, w, 1, PAL.railLight); fill(x, y + h - 1, w, 1, PAL.railDark);
    fill(x, y, 1, h, PAL.railLight); fill(x + w - 1, y, 1, h, PAL.railDark);
    buttons.push({ id: id, x: x, y: y, w: w, h: h });
    text(label, x + w / 2, y + (h - (size || 7)) / 2 + 1, size || 7, hot ? PAL.accent : PAL.text, "center");
  }

  function hitButton(p) {
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b.id;
    }
    return null;
  }

  /* ── backdrop: the bar is having its own night ───────────────────────── */

  /** `k` brightens the whole backdrop — glass mode turns the night up. */
  function drawBackdrop(t, k) {
    var i;
    // nebula fog
    for (i = 0; i < blobs.length; i++) {
      var bl = blobs[i];
      var bx = bl.x + Math.sin(t * bl.sp + bl.ph) * 14;
      var by = bl.y + Math.cos(t * bl.sp * 0.7 + bl.ph) * 9;
      bctx.globalAlpha = 0.07 * k;
      pixCircle(bx, by, bl.r, bl.warm ? "#7a3fa0" : "#2f4aa0");
      bctx.globalAlpha = 0.05 * k;
      pixCircle(bx + 3, by - 2, bl.r * 0.6, bl.warm ? "#c05fd6" : "#3fa0c0");
    }
    bctx.globalAlpha = 1;
    // stars
    for (i = 0; i < stars.length; i++) {
      var s = stars[i];
      bctx.globalAlpha = Math.min(1, (0.18 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.8 + s.tw))) * k);
      bctx.fillStyle = "#cfd8ff";
      bctx.fillRect(s.x | 0, s.y | 0, s.big ? 2 : 1, s.big ? 2 : 1);
    }
    bctx.globalAlpha = 1;
    // slow gears
    for (i = 0; i < GEARS.length; i++) {
      var g = GEARS[i];
      bctx.globalAlpha = Math.min(1, 0.22 * k);
      pixRing(g.x, g.y, g.r, "#8a7aa0");
      bctx.fillStyle = "#8a7aa0";
      for (var k2 = 0; k2 < 6; k2++) {
        var a = t * g.sp + (k2 / 6) * Math.PI * 2;
        bctx.fillRect(Math.round(g.x + Math.cos(a) * (g.r + 2)),
                      Math.round(g.y + Math.sin(a) * (g.r + 2)), 2, 2);
      }
      bctx.fillRect(g.x, g.y, 1, 1);
    }
    bctx.globalAlpha = 1;
    // jellyfish drifting up through the room
    for (i = 0; i < jellies.length; i++) {
      var j = jellies[i];
      var jy = ((j.y - t * 4 + j.ph * 20) % (BH + 30) + BH + 30) % (BH + 30) - 15;
      var jx = j.x + Math.sin(t * 0.8 + j.ph) * 4;
      bctx.globalAlpha = Math.min(1, 0.3 * k);
      // dome, drawn as rows so it never has to paint over the stars behind it
      bctx.fillStyle = "#c05fd6";
      for (var dy = -4; dy <= 0; dy++) {
        var hw = Math.floor(Math.sqrt(16 - dy * dy));
        bctx.fillRect((jx - hw) | 0, (jy + dy) | 0, hw * 2 + 1, 1);
      }
      bctx.fillStyle = "#d69aff";
      for (var q = 0; q < 3; q++)
        bctx.fillRect(Math.round(jx - 2 + q * 2 + Math.sin(t * 3 + q + j.ph) * 1.5),
                      (jy + 1 + ((q + t * 6) | 0) % 3) | 0, 1, 3);
    }
    bctx.globalAlpha = 1;
    // drifting equations
    bctx.font = "7px monospace";
    bctx.globalAlpha = Math.min(1, 0.28 * k);
    bctx.fillStyle = "#9a8fc0";
    for (i = 0; i < EQNS.length; i++) {
      var eq = EQNS[i];
      var ex = ((eq.x + t * eq.sp) % (BW + 120) + BW + 120) % (BW + 120) - 60;
      bctx.fillText(eq.s, ex, eq.y);
    }
    bctx.globalAlpha = 1;
  }

  /** The goblin lives under the table. Sometimes he checks on you. */
  function drawGoblin(game, t) {
    var gb = game.goblin;
    if (!gb) return;
    var life = t - gb.t0, total = gb.until - gb.t0;
    var pop = Math.min(1, life / 0.45, Math.max(0, (gb.until - t) / 0.45));
    if (pop <= 0) return;
    var x = Math.round(gb.x), yBase = gb.y, rise = Math.round(pop * 9);
    var y = yBase - rise;

    // ears, face, eyes that track the cue ball
    bctx.fillStyle = "#3f7a2f";
    bctx.fillRect(x - 5, y - 2, 2, 3); bctx.fillRect(x + 4, y - 2, 2, 3);
    bctx.fillStyle = "#5fae3f";
    bctx.fillRect(x - 4, y, 9, rise > 6 ? 6 : Math.max(1, rise - 2));
    bctx.fillRect(x - 3, y - 1, 7, 2);
    if (rise > 4) {
      var cue = game.cue && game.cue();
      var lx = cue && cue.x > gb.x ? 1 : 0;
      bctx.fillStyle = "#f2ede4";
      bctx.fillRect(x - 3, y + 1, 2, 2); bctx.fillRect(x + 2, y + 1, 2, 2);
      bctx.fillStyle = "#1a1a20";
      bctx.fillRect(x - 3 + lx, y + 2, 1, 1); bctx.fillRect(x + 2 + lx, y + 2, 1, 1);
      // little fingers gripping the rail
      bctx.fillStyle = "#7fce5f";
      bctx.fillRect(x - 6, yBase - 1, 1, 2); bctx.fillRect(x - 8, yBase - 1, 1, 2);
      bctx.fillRect(x + 6, yBase - 1, 1, 2); bctx.fillRect(x + 8, yBase - 1, 1, 2);
    }
  }

  /* ── zones, dock, crane, cat ─────────────────────────────────────────── */

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
    var ext = Math.abs(z.cos) * hl + Math.abs(z.sin) * z.hw + pad;
    var ext2 = Math.abs(z.sin) * hl + Math.abs(z.cos) * z.hw + pad;
    var ox = Math.floor(z.cx - ext), oy = Math.floor(z.cy - ext2);
    var w = Math.ceil(ext * 2) + 1, h = Math.ceil(ext2 * 2) + 1;

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

  function drawZones(game, t) {
    var zs = game.world.zones;
    if (!zs) return;
    var base = game.glass ? 0.45 : 1;
    for (var i = 0; i < zs.length; i++) {
      var z = zs[i];
      if (z.type === "bridge") {
        var sp = bridgeSprite(z);
        bctx.globalAlpha = base;
        bctx.drawImage(sp.cv, sp.ox, sp.oy);
      } else {
        // euclidean patch: a pale calm island — dashed border, still grid
        bctx.globalAlpha = 0.08 * base;
        fill(z.x, z.y, z.w, z.h, "#cfd8ff");
        bctx.globalAlpha = 0.5;
        bctx.fillStyle = "#7fd6c0";
        var s;
        for (s = 0; s < z.w; s += 4) {
          bctx.fillRect((z.x + s) | 0, z.y | 0, 2, 1);
          bctx.fillRect((z.x + s) | 0, (z.y + z.h) | 0, 2, 1);
        }
        for (s = 0; s < z.h; s += 4) {
          bctx.fillRect(z.x | 0, (z.y + s) | 0, 1, 2);
          bctx.fillRect((z.x + z.w) | 0, (z.y + s) | 0, 1, 2);
        }
      }
    }
    bctx.globalAlpha = 1;
  }

  function drawDockAndCrane(game, t) {
    var cr = game.world.crane;
    if (cr) {
      var col = cr.used ? "#5a5346" : PAL.pocketRim;
      if (!cr.used) {
        bctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3);
        pixRing(cr.x, cr.y, cr.r + 2, col, t * 1.5);
      }
      bctx.globalAlpha = cr.used ? 0.4 : 1;
      pixRing(cr.x, cr.y, cr.r, col);
      fill(cr.x - 1, cr.y - 3, 1, 4, col);   // little hook glyph
      fill(cr.x - 2, cr.y, 3, 1, col);
      bctx.globalAlpha = 1;
    }
    var ca = game.craneAnim;
    if (ca) {
      var p = Math.min(1, (t - ca.t0) / ca.dur);
      var e = p * p * (3 - 2 * p);           // smoothstep
      var x = ca.from.x + (ca.to.x - ca.from.x) * e;
      var y = ca.from.y + (ca.to.y - ca.from.y) * e;
      var lift = Math.sin(Math.min(1, p * 1.15) * Math.PI) * 7;
      fill(x, 0, 1, y - lift, "#8a8378");    // the cable, from way up high
      bctx.globalAlpha = 0.35;               // shadow stays on the felt
      pixCircle(x, y, 3, "#07070c");
      bctx.globalAlpha = 1;
      drawBall({ x: x, y: y - lift, r: ca.b.r, color: ca.b.color, sunk: false }, t);
      fill(x - 2, y - lift - ca.b.r - 2, 5, 2, "#8a8378"); // the claw
    }
  }

  function drawCat(game, t) {
    var cat = game.cat;
    if (!cat) return;
    var age = t - cat.t0;
    // pads in as softly as it pads out
    var fade = Math.max(0, Math.min(1, age / 0.4, (2.4 - age) / 0.4));
    if (fade <= 0) return;
    bctx.globalAlpha = fade;
    // and it walks the last few pixels in, rather than blinking into place
    var x = Math.round(cat.x - (1 - Math.min(1, age / 0.4)) * cat.dir.x * 9);
    var y = Math.round(cat.y - (1 - Math.min(1, age / 0.4)) * cat.dir.y * 9);

    // tabby: body, head, ears, stripes, tail with a mind of its own
    fill(x - 5, y - 2, 9, 5, "#e8963e");
    fill(x - 4, y - 1, 2, 1, "#b06a24"); fill(x - 1, y - 1, 2, 1, "#b06a24");
    fill(x + 2, y - 5, 5, 5, "#e8963e");
    fill(x + 2, y - 6, 1, 2, "#e8963e"); fill(x + 6, y - 6, 1, 2, "#e8963e");
    fill(x + 3, y - 4, 1, 1, "#1a1a20"); fill(x + 5, y - 4, 1, 1, "#1a1a20");
    var tw = Math.round(Math.sin(t * 5) * 2);
    fill(x - 7, y - 3 + tw, 2, 1, "#e8963e");
    fill(x - 8, y - 4 + tw, 2, 1, "#b06a24");

    // the paw reaches out during the wind-up, swipes at 0.9s
    var reach = age < 0.9 ? age / 0.9 * 6 : Math.max(0, 6 - (age - 0.9) * 20);
    if (reach > 0.5)
      fill(Math.round(x + 6 + cat.dir.x * reach), Math.round(y - 1 + cat.dir.y * reach),
           2, 2, "#f6e3c0");
    bctx.globalAlpha = 1;
  }

  /* ── world drawing ───────────────────────────────────────────────────── */

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
    var C = "#c8d2d8", D = "#6d7a82";
    var x0 = rect.x - rail, y0 = rect.y - rail;
    var w = rect.w + rail * 2, h = rect.h + rail * 2;
    bctx.globalAlpha = 0.5;
    fill(x0, y0, w, 1, D); fill(x0, y0 + h - 1, w, 1, D);
    fill(x0, y0, 1, h, D); fill(x0 + w - 1, y0, 1, h, D);
    bctx.globalAlpha = 0.85;
    fill(rect.x - 1, rect.y - 1, rect.w + 2, 1, C);
    fill(rect.x - 1, rect.y + rect.h, rect.w + 2, 1, C);
    fill(rect.x - 1, rect.y - 1, 1, rect.h + 2, C);
    fill(rect.x + rect.w, rect.y - 1, 1, rect.h + 2, C);
    // corner brackets tying the playfield to the outer chassis
    [[x0, y0, 1, 1], [x0 + w - 1, y0, -1, 1],
     [x0, y0 + h - 1, 1, -1], [x0 + w - 1, y0 + h - 1, -1, -1]]
      .forEach(function (c) {
        for (var i = 0; i < rail; i++)
          bctx.fillRect(c[0] + c[2] * i, c[1] + c[3] * i, 1, 1);
      });
    bctx.globalAlpha = 1;
  }

  function drawTable(game, t) {
    var rect = game.world.rect;
    var rail = 10;

    // rails — in glass mode the wood is gone, leaving a wireframe chassis
    if (game.glass) {
      drawGlassFrame(rect, rail);
    } else {
      fill(rect.x - rail, rect.y - rail, rect.w + rail * 2, rect.h + rail * 2, PAL.rail);
      fill(rect.x - rail, rect.y - rail, rect.w + rail * 2, 2, PAL.railLight);
      fill(rect.x - rail, rect.y + rect.h + rail - 2, rect.w + rail * 2, 2, PAL.railDark);
    }

    // rails-are-a-pocket mode: the whole frame goes hungry and dark
    if (game.world.railMouth > 0) {
      bctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 6);
      fill(rect.x - 3, rect.y - 3, rect.w + 6, 3, PAL.pocket);
      fill(rect.x - 3, rect.y + rect.h, rect.w + 6, 3, PAL.pocket);
      fill(rect.x - 3, rect.y, 3, rect.h, PAL.pocket);
      fill(rect.x + rect.w, rect.y, 3, rect.h, PAL.pocket);
      bctx.globalAlpha = 1;
    }

    // felt — in glass mode there is no felt at all, just the night behind it
    var glassMul = game.glass ? 0.22 : 1;
    if (!game.glass) fill(rect.x, rect.y, rect.w, rect.h, PAL.feltBase);

    // warp contour tint: the "spilled drinks" — hills lighter, wells darker.
    var cell = 4;
    for (var y = rect.y; y < rect.y + rect.h; y += cell) {
      for (var x = rect.x; x < rect.x + rect.w; x += cell) {
        var v = Geo.phi(game.world.field, x + 2, y + 2);
        if (Math.abs(v) < 0.06) continue;
        bctx.globalAlpha = Math.min(0.5, Math.abs(v) * 0.6) * glassMul;
        bctx.fillStyle = v > 0 ? PAL.feltHill : PAL.feltWell;
        bctx.fillRect(x, y, cell, cell);
      }
    }
    bctx.globalAlpha = 1;

    drawZones(game, t);

    // grid lines, displaced by the visual warp (this is what "swims")
    bctx.fillStyle = game.glass ? "#9fd8ff" : PAL.grid;
    bctx.globalAlpha = game.glass ? 0.3 : 0.55;
    var gx, gy, p;
    for (gx = rect.x + 22; gx < rect.x + rect.w; gx += 22) {
      for (gy = rect.y; gy < rect.y + rect.h; gy += 2) {
        p = visualDisp(game, gx, gy, t);
        var px = gx + p.x, py = gy + p.y;
        if (px > rect.x && px < rect.x + rect.w - 1 && py > rect.y && py < rect.y + rect.h - 1
            && !inBridge(game.world, px, py))
          bctx.fillRect(px | 0, py | 0, 1, 1);
      }
    }
    for (gy = rect.y + 22; gy < rect.y + rect.h; gy += 22) {
      for (gx = rect.x; gx < rect.x + rect.w; gx += 2) {
        p = visualDisp(game, gx, gy, t);
        var qx = gx + p.x, qy = gy + p.y;
        if (qx > rect.x && qx < rect.x + rect.w - 1 && qy > rect.y && qy < rect.y + rect.h - 1
            && !inBridge(game.world, qx, qy))
          bctx.fillRect(qx | 0, qy | 0, 1, 1);
      }
    }
    bctx.globalAlpha = 1;

    // pockets — still legible on glass, but they don't block the view
    for (var i = 0; i < game.world.pockets.length; i++) {
      var pk = game.world.pockets[i];
      if (game.glass) {
        bctx.globalAlpha = 0.35;
        pixCircle(pk.x, pk.y, pk.r, PAL.pocket);
        bctx.globalAlpha = 1;
      } else {
        pixCircle(pk.x, pk.y, pk.r, PAL.pocket);
      }
      pixRing(pk.x, pk.y, pk.r, PAL.pocketRim);
    }

    // portals — a cycle of any length; each gets its own color
    var ps = game.world.portals;
    if (ps && ps.length >= 2) {
      var pc = ["#ff8a2a", "#37b6ff", "#c05fd6", "#3fbf5f", "#f2c230", "#ff5f8a"];
      for (i = 0; i < ps.length; i++) {
        var col = pc[i % pc.length];
        pixCircle(ps[i].x, ps[i].y, ps[i].r - 2, "#120a1c");
        pixRing(ps[i].x, ps[i].y, ps[i].r, col, t * 2.4);
        pixRing(ps[i].x, ps[i].y, ps[i].r - 2, col, -t * 3.2);
      }
    }

    drawDockAndCrane(game, t);
  }

  var SPECIAL_TINT = {
    cash: "#ffe89a", extraShot: "#9affb4", midPocket: "#c7a06a",
    railMouth: "#ff8a7a", portalBall: "#37b6ff",
  };

  function drawBall(b, t) {
    if (b.sunk) return;
    var c = BALL_COLORS[b.color] || BALL_COLORS.red;
    var x = Math.round(b.x), y = Math.round(b.y), r = b.r;
    pixCircle(x, y, r, c.dark);            // body w/ dark rim
    pixCircle(x - 1, y - 1, r - 1, c.base); // lit body
    pixCircle(x - 2, y - 2, Math.max(1, r - 4), c.light); // highlight blob
    fill(x - 2, y - 3, 1, 1, "#ffffff");   // specular pixel
    if (b.color === "eight") {
      fill(x - 1, y - 1, 3, 3, "#f2ede4");
      fill(x, y, 1, 1, "#23232c");
    }
    if (b.special) {
      var tint = SPECIAL_TINT[b.special] || "#ffffff";
      bctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 5);
      pixRing(x, y, r + 2, tint, t * 3);
      bctx.globalAlpha = 1;
      // tiny glyphs so each power is readable at a glance
      if (b.special === "cash") {
        fill(x, y - 1, 1, 3, "#1a1a20"); fill(x - 1, y, 3, 1, "#ffe89a");
      } else if (b.special === "extraShot") {
        fill(x, y - 1, 1, 3, "#0d3f1f"); fill(x - 1, y, 3, 1, "#0d3f1f");
      } else if (b.special === "midPocket") {
        fill(x - 1, y - 1, 3, 3, "#07070c"); fill(x, y - 1, 1, 1, "#c7a06a");
      } else if (b.special === "railMouth") {
        fill(x - 1, y - 1, 3, 1, "#07070c"); fill(x - 1, y + 1, 3, 1, "#07070c");
      } else if (b.special === "portalBall") {
        fill(x - 1, y, 1, 1, "#ff8a2a"); fill(x + 1, y, 1, 1, "#37b6ff");
      }
    }
  }

  function drawAim(game, t) {
    var aim = game.aim;
    if (!aim || !aim.active || !aim.trace) return;
    var pts = aim.trace.pts;

    // dashed geodesic: the truth, but only as far as your eyes can afford
    for (var i = 0; i < pts.length; i++) {
      if ((i % 6) > 2) continue;
      var a = 1 - (i / pts.length) * 0.65;
      bctx.globalAlpha = a;
      bctx.fillStyle = i < 4 ? PAL.accent : PAL.text;
      bctx.fillRect(pts[i].x | 0, pts[i].y | 0, 1, 1);
    }
    bctx.globalAlpha = 1;

    var hit = aim.trace.hit;
    if (hit) {
      pixRing(hit.x, hit.y, game.cue().r, PAL.accent, t * 4);
      if (game.run.items.bounceReader) {
        // ghost of where the struck ball departs
        bctx.fillStyle = (BALL_COLORS[hit.ball.color] || BALL_COLORS.red).light;
        for (var s = 4; s < 26; s += 2)
          bctx.fillRect((hit.ball.x + hit.nx * s) | 0, (hit.ball.y + hit.ny * s) | 0, 1, 1);
      }
    }
  }

  function drawHud(game, t) {
    var run = game.run, lv = game.level;

    // toggles along the bottom edge, clear of the power bar
    button("glass", 4, 212, 46, 11, "GLASS", game.glass || game.hover === "glass", 5);
    button("trip", BW - 50, 212, 46, 11, "TRIP", game.trip || game.hover === "trip", 5);
    // helper picking is a dev tool, so it only shows up in dev mode
    if (game.dev) button("setup", BW - 106, 212, 52, 11, "HELPERS", game.hover === "setup", 5);

    text("LVL " + (run.levelIndex + 1) + "/3", 18, 8, 7, PAL.dim);
    text(lv.name, 74, 8, 7, PAL.accent);
    text("$" + run.money, 382, 8, 7, PAL.ok, "right");
    text("SHOTS " + run.shots, 382, 19, 7, run.shots <= 2 ? PAL.danger : PAL.text, "right");

    // remaining balls as dots
    var bx = 18, by = 21;
    for (var i = 0; i < game.world.balls.length; i++) {
      var b = game.world.balls[i];
      if (b.color === "cue" || b.sunk) continue;
      var c = BALL_COLORS[b.color] || BALL_COLORS.red;
      fill(bx, by, 4, 4, c.base);
      fill(bx, by, 4, 1, c.light);
      bx += 7;
    }

    // chasers downed: little mugs, top center
    var mugs = game.chasers || 0;
    var mx = BW / 2 - mugs * 5;
    for (i = 0; i < mugs; i++) {
      fill(mx + i * 10, 8, 5, 7, "#f2c230");
      fill(mx + i * 10, 8, 5, 2, "#fff6d8");
      fill(mx + i * 10 + 5, 10, 2, 3, "#c7a06a");
    }
    if (game.dev) text("DEV PATH", BW / 2, 26, 5, PAL.danger, "center");

    // message strip
    if (game.msg && game.msgUntil > performance.now())
      text(game.msg, BW / 2, 207, 7, game.msgColor || PAL.text, "center");

    // power bar while aiming
    if (game.aim && game.aim.active && game.aim.power > 0.02) {
      var w = 120, x0 = BW / 2 - w / 2, y0 = 216;
      fill(x0 - 1, y0 - 1, w + 2, 7, PAL.card);
      var pw = Math.round(w * game.aim.power);
      fill(x0, y0, pw, 5, game.aim.power > 0.85 ? PAL.danger : PAL.accent);
    }
  }

  /* ── screens ─────────────────────────────────────────────────────────── */

  function dimWorld() { bctx.fillStyle = "rgba(8,6,12,0.82)"; bctx.fillRect(0, 0, BW, BH); }

  function drawTitle(game, t) {
    var bob = Math.sin(t * 1.4) * 3;
    text("LAST CALL", BW / 2, 46 + bob, 16, PAL.accent, "center");
    text("BILLIARDS", BW / 2, 68 + bob, 16, PAL.text, "center");
    text("space is drunk. you're fine.", BW / 2, 100, 6, PAL.dim, "center");
    text("pot the colors, then the 8-ball", BW / 2, 122, 6, PAL.dim, "center");
    text("straight lines not included", BW / 2, 132, 6, PAL.dim, "center");
    button("start", BW / 2 - 60, 156, 120, 20, "RACK UP", game.hover === "start");
    text("drag from the cue ball to shoot", BW / 2, 196, 5, PAL.dim, "center");
  }

  function drawShop(game) {
    dimWorld();
    text("THE BAR", BW / 2, 14, 11, PAL.accent, "center");
    text("level " + game.run.levelIndex + " cleared  ·  $" + game.run.money, BW / 2, 32, 6, PAL.dim, "center");

    var items = game.shopStock;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var x = 22 + (i % 2) * 182, y = 48 + Math.floor(i / 2) * 56;
      var afford = !it.sold && game.run.money >= it.price;
      fill(x, y, 174, 50, game.hover === "item" + i && afford ? PAL.cardHi : PAL.card);
      fill(x, y, 174, 1, PAL.railLight); fill(x, y + 49, 174, 1, PAL.railDark);
      buttons.push({ id: "item" + i, x: x, y: y, w: 174, h: 50 });
      text(it.name, x + 6, y + 6, 6, it.sold ? PAL.dim : PAL.accent);
      text(it.desc1, x + 6, y + 20, 5, PAL.text);
      text(it.desc2 || "", x + 6, y + 29, 5, PAL.text);
      text(it.sold ? "SOLD" : "$" + it.price, x + 168, y + 6, 6,
        it.sold ? PAL.dim : (afford ? PAL.ok : PAL.danger), "right");
    }
    button("next", BW / 2 - 70, 164, 140, 18, "NEXT LEVEL >", game.hover === "next");
    text("stumble on when ready", BW / 2, 190, 5, PAL.dim, "center");
  }

  /** TABLE SETUP: pick which helpers sit on the felt. Applies live. */
  function drawSetup(game, t) {
    bctx.fillStyle = "rgba(8,6,12,0.66)";
    bctx.fillRect(0, 0, BW, BH);

    var api = root.Game ? root.Game._test : null;
    var list = (api && api.HELPERS) || [];
    var max = (api && api.HELPER_MAX) || 2;
    var allow = api ? api.helperAllowance(game.run.levelIndex) : max;
    var chosen = game.run.helpers || [];

    text("TABLE SETUP", BW / 2, 12, 11, PAL.accent, "center");
    text("dev tool", BW / 2, 200, 5, PAL.danger, "center");
    text("what's on the felt  ·  " + chosen.length + "/" + max + " picked",
      BW / 2, 30, 6, chosen.length >= max ? PAL.accent : PAL.dim, "center");
    text("level " + (game.run.levelIndex + 1) + " normally allows " + allow +
         (chosen.length > allow ? "  (OVERRIDDEN)" : ""),
      BW / 2, 191, 5, chosen.length > allow ? PAL.danger : PAL.dim, "center");

    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      var on = chosen.indexOf(h.key) >= 0;
      var x = 24 + (i % 2) * 180, y = 46 + Math.floor(i / 2) * 52;
      var hot = game.hover === "help" + i;
      fill(x, y, 172, 46, on ? PAL.cardHi : PAL.card);
      fill(x, y, 172, 1, on ? PAL.ok : PAL.railLight);
      fill(x, y + 45, 172, 1, PAL.railDark);
      fill(x, y, 1, 46, on ? PAL.ok : PAL.railLight);
      fill(x + 171, y, 1, 46, PAL.railDark);
      buttons.push({ id: "help" + i, x: x, y: y, w: 172, h: 46 });

      // checkbox
      fill(x + 7, y + 7, 9, 9, "#0b0f14");
      pixRing(x + 11, y + 11, 4, on ? PAL.ok : PAL.dim);
      if (on) { fill(x + 10, y + 12, 2, 2, PAL.ok); fill(x + 12, y + 9, 2, 3, PAL.ok); }

      text(h.name, x + 22, y + 7, 6, on ? PAL.ok : (hot ? PAL.accent : PAL.text));
      text(h.blurb, x + 22, y + 21, 5, PAL.dim);
      text(h.blurb2, x + 22, y + 30, 5, PAL.dim);
    }

    button("setupRoll", 24, 154, 100, 16, "REROLL SPOTS", game.hover === "setupRoll", 6);
    button("setupDone", BW - 124, 154, 100, 16, "BACK TO PLAY", game.hover === "setupDone", 6);
    text("changes apply immediately  ·  M or ESC to close", BW / 2, 182, 5, PAL.dim, "center");
  }

  function drawEnd(game, t) {
    dimWorld();
    if (game.state === "win") {
      text("YOU CLOSED", BW / 2, 52, 14, PAL.accent, "center");
      text("THE BAR", BW / 2, 72, 14, PAL.accent, "center");
      text("all three tables, potted clean", BW / 2, 98, 6, PAL.text, "center");
      text("final tab: $" + game.run.money, BW / 2, 110, 6, PAL.ok, "center");
    } else {
      text("BUSTED", BW / 2, 58, 16, PAL.danger, "center");
      text(game.endReason || "", BW / 2, 88, 6, PAL.text, "center");
      text("the room was spinning anyway", BW / 2, 100, 6, PAL.dim, "center");
    }
    button("again", BW / 2 - 60, 140, 120, 20, "ONE MORE", game.hover === "again");
  }

  function drawBanner(game, t) {
    if (t - game.levelStartT > 2.4) return;
    var a = Math.min(1, (2.4 - (t - game.levelStartT)) / 0.5);
    text(game.level.name, BW / 2, 92, 12, PAL.accent, "center", a);
    text(game.level.tag, BW / 2, 112, 6, PAL.dim, "center", a);
  }

  /* ── frame ───────────────────────────────────────────────────────────── */

  function frame(game, t) {
    buttons = [];
    bctx.clearRect(0, 0, BW, BH);
    fill(0, 0, BW, BH, PAL.bg);
    drawBackdrop(t, game.glass ? 2.1 : 1);

    var inWorld = game.state === "play" || game.state === "shop" ||
                  game.state === "setup" ||
                  game.state === "over" || game.state === "win";
    if (inWorld) {
      drawTable(game, t);
      for (var i = 0; i < game.world.balls.length; i++) drawBall(game.world.balls[i], t);
      drawCat(game, t);
      drawGoblin(game, t);
      if (game.state === "play") { drawAim(game, t); drawHud(game, t); drawBanner(game, t); }
    }
    if (game.state === "title") drawTitle(game, t);
    if (game.state === "shop") drawShop(game);
    if (game.state === "setup") drawSetup(game, t);
    if (game.state === "over" || game.state === "win") drawEnd(game, t);

    // blit with drunkenness
    var vis = game.vis || (game.level ? game.level.visuals : { wobble: 0, ghost: 0 });
    var wob = game.state === "play" ? vis.wobble : 0;
    var wx = wob ? Math.sin(t * 1.1) * wob * scale : 0;
    var wy = wob ? Math.cos(t * 0.83) * wob * 0.6 * scale : 0;

    dctx.fillStyle = PAL.bg;
    dctx.fillRect(0, 0, cssW, cssH);
    if (vis.ghost && game.state === "play") {
      dctx.globalAlpha = 0.28 * Math.min(1, vis.ghost);
      dctx.drawImage(buf, offX + wx + Math.sin(t * 0.6) * 5 * scale,
                          offY + wy + Math.cos(t * 0.9) * 3 * scale,
                          BW * scale, BH * scale);
      dctx.globalAlpha = 1;
    }
    // chaser defocus + psychedelic hue drift, applied together on the blit
    var parts = [];
    var blur = defocusPx(game, t);
    if (blur > 0) parts.push("blur(" + blur.toFixed(2) + "px)");
    if (game.trip) parts.push("hue-rotate(" + ((t * 9) % 360).toFixed(1) + "deg)");
    if (parts.length) dctx.filter = parts.join(" ");
    dctx.drawImage(buf, offX + wx, offY + wy, BW * scale, BH * scale);
    dctx.filter = "none";

    flushText(game, t); // sober layer: text never wobbles
  }

  var DEFOCUS_TIME = 1.6;
  /** Blur radius in device px for the chaser defocus, 0 when it's over. */
  function defocusPx(game, t) {
    if (!game.defocusT) return 0;
    var p = (t - game.defocusT) / DEFOCUS_TIME;
    if (p < 0 || p >= 1) return 0;
    // ease out: softest right after the gulp, sharpening back to normal.
    // canvas filters work in backing-store pixels, hence the dpr.
    return (1 - p) * (1 - p) * 3.2 * scale * dpr;
  }

  root.Render = {
    BW: BW, BH: BH,
    init: init,
    frame: frame,
    toBuffer: toBuffer,
    hitButton: hitButton,
    PAL: PAL,
  };
})(typeof window !== "undefined" ? window : globalThis);
