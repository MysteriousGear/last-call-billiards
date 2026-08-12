/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — backdrop.js
   The bar is having its own night behind the table: stars, nebula fog, slow
   gears, drifting jellyfish and floating physics equations. Several actors
   are deliberately placed to cross the table's own band, so that turning the
   felt to glass reveals something worth looking at.

   Also home to the goblin, who lives under the table and checks on you.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};
  var Cfg = LCB.Config, R = LCB.Render;
  var BW = Cfg.BW, BH = Cfg.BH;

  var stars = [], blobs = [], jellies = [];

  var GEARS = [
    { x: 9, y: 208, r: 8, sp: 0.5 }, { x: 391, y: 14, r: 10, sp: -0.35 },
    { x: 6, y: 16, r: 6, sp: 0.7 },
  ];

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

  R.layers.initBackdrop = function () {
    var i;
    for (i = 0; i < 70; i++)
      stars.push({ x: Math.random() * BW, y: Math.random() * BH,
                   tw: Math.random() * 6.28, big: Math.random() < 0.12 });
    for (i = 0; i < 6; i++)
      blobs.push({ x: Math.random() * BW, y: Math.random() * BH,
                   r: 8 + Math.random() * 16, ph: Math.random() * 6.28,
                   sp: 0.06 + Math.random() * 0.1, warm: i % 2 === 0 });
    // spread across the width so they swim behind the table, not just the margins
    [12, 96, 188, 286, 388].forEach(function (x) {
      jellies.push({ x: x, y: Math.random() * BH, ph: Math.random() * 6 });
    });
  };

  /** `k` brightens the whole backdrop — glass mode turns the night up. */
  R.layers.backdrop = function (t, k) {
    var c = R.bctx, i;

    for (i = 0; i < blobs.length; i++) {                     // nebula fog
      var bl = blobs[i];
      var bx = bl.x + Math.sin(t * bl.sp + bl.ph) * 14;
      var by = bl.y + Math.cos(t * bl.sp * 0.7 + bl.ph) * 9;
      R.alpha(0.07 * k);
      R.pixCircle(bx, by, bl.r, bl.warm ? "#7a3fa0" : "#2f4aa0");
      R.alpha(0.05 * k);
      R.pixCircle(bx + 3, by - 2, bl.r * 0.6, bl.warm ? "#c05fd6" : "#3fa0c0");
    }

    for (i = 0; i < stars.length; i++) {                     // stars
      var s = stars[i];
      R.alpha(Math.min(1, (0.18 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.8 + s.tw))) * k));
      c.fillStyle = "#cfd8ff";
      c.fillRect(s.x | 0, s.y | 0, s.big ? 2 : 1, s.big ? 2 : 1);
    }

    for (i = 0; i < GEARS.length; i++) {                     // slow gears
      var g = GEARS[i];
      R.alpha(Math.min(1, 0.22 * k));
      R.pixRing(g.x, g.y, g.r, "#8a7aa0");
      c.fillStyle = "#8a7aa0";
      for (var n = 0; n < 6; n++) {
        var a = t * g.sp + (n / 6) * Math.PI * 2;
        c.fillRect(Math.round(g.x + Math.cos(a) * (g.r + 2)),
                   Math.round(g.y + Math.sin(a) * (g.r + 2)), 2, 2);
      }
      c.fillRect(g.x, g.y, 1, 1);
    }

    for (i = 0; i < jellies.length; i++) {                   // jellyfish
      var j = jellies[i];
      var jy = ((j.y - t * 4 + j.ph * 20) % (BH + 30) + BH + 30) % (BH + 30) - 15;
      var jx = j.x + Math.sin(t * 0.8 + j.ph) * 4;
      R.alpha(Math.min(1, 0.3 * k));
      // dome drawn as rows, so it never paints over the stars behind it
      c.fillStyle = "#c05fd6";
      for (var dy = -4; dy <= 0; dy++) {
        var hw = Math.floor(Math.sqrt(16 - dy * dy));
        c.fillRect((jx - hw) | 0, (jy + dy) | 0, hw * 2 + 1, 1);
      }
      c.fillStyle = "#d69aff";
      for (var q = 0; q < 3; q++)
        c.fillRect(Math.round(jx - 2 + q * 2 + Math.sin(t * 3 + q + j.ph) * 1.5),
                   (jy + 1 + ((q + t * 6) | 0) % 3) | 0, 1, 3);
    }

    c.font = "7px monospace";                                // drifting equations
    R.alpha(Math.min(1, 0.28 * k));
    c.fillStyle = "#9a8fc0";
    for (i = 0; i < EQNS.length; i++) {
      var eq = EQNS[i];
      var ex = ((eq.x + t * eq.sp) % (BW + 120) + BW + 120) % (BW + 120) - 60;
      c.fillText(eq.s, ex, eq.y);
    }
    R.alpha(1);
  };

  /** The goblin lives under the table. Sometimes he checks on you. */
  R.layers.goblin = function (game, t) {
    var gb = game.goblin;
    if (!gb || !game.world) return;
    var c = R.bctx;
    var pop = Math.min(1, (t - gb.t0) / 0.45, Math.max(0, (gb.until - t) / 0.45));
    if (pop <= 0) return;
    var x = Math.round(gb.x), yBase = gb.y, rise = Math.round(pop * 9);
    var y = yBase - rise;

    c.fillStyle = "#3f7a2f";                                  // ears
    c.fillRect(x - 5, y - 2, 2, 3); c.fillRect(x + 4, y - 2, 2, 3);
    c.fillStyle = "#5fae3f";                                  // head
    c.fillRect(x - 4, y, 9, rise > 6 ? 6 : Math.max(1, rise - 2));
    c.fillRect(x - 3, y - 1, 7, 2);
    if (rise > 4) {
      var cue = LCB.Table.cueBall(game.world);
      var lx = cue && cue.x > gb.x ? 1 : 0;                   // eyes track the cue
      c.fillStyle = "#f2ede4";
      c.fillRect(x - 3, y + 1, 2, 2); c.fillRect(x + 2, y + 1, 2, 2);
      c.fillStyle = "#1a1a20";
      c.fillRect(x - 3 + lx, y + 2, 1, 1); c.fillRect(x + 2 + lx, y + 2, 1, 1);
      c.fillStyle = "#7fce5f";                                // fingers on the rail
      c.fillRect(x - 6, yBase - 1, 1, 2); c.fillRect(x - 8, yBase - 1, 1, 2);
      c.fillRect(x + 6, yBase - 1, 1, 2); c.fillRect(x + 8, yBase - 1, 1, 2);
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
