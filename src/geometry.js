/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — geometry.js
   The table is flat. The metric is not.

   Space over the felt carries a conformal metric  ds² = e^{2φ(x,y)} (dx²+dy²)
   where φ is a sum of Gaussian bumps ("the drinks"). A spin-free shot follows
   a geodesic of that metric. Seen in ordinary table coordinates, a geodesic
   is a curve whose signed curvature at each point is the derivative of φ in
   the direction normal to travel:   k = ∇φ · n̂.
   So per step we rotate the velocity direction by k·ds. Speed itself is
   handled separately (friction), which keeps tuning simple and stable.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  /** One Gaussian bump of the warp potential. amp may be ±. */
  function bump(x, y, amp, sigma) {
    return { x: x, y: y, amp: amp, sigma: sigma };
  }

  /** field.scale is the level-wide "how drunk is space" multiplier. */
  function makeField(bumps, scale) {
    return { bumps: bumps, scale: scale };
  }

  /** φ(x,y) — used by the renderer for contour shading. */
  function phi(field, x, y) {
    var v = 0;
    for (var i = 0; i < field.bumps.length; i++) {
      var b = field.bumps[i];
      var dx = x - b.x, dy = y - b.y;
      v += b.amp * Math.exp(-(dx * dx + dy * dy) / (2 * b.sigma * b.sigma));
    }
    return v * field.scale;
  }

  /** ∇φ(x,y). Analytic, no sampling. */
  function grad(field, x, y) {
    var gx = 0, gy = 0;
    for (var i = 0; i < field.bumps.length; i++) {
      var b = field.bumps[i];
      var dx = x - b.x, dy = y - b.y;
      var s2 = b.sigma * b.sigma;
      var e = b.amp * Math.exp(-(dx * dx + dy * dy) / (2 * s2)) / s2;
      gx -= dx * e;
      gy -= dy * e;
    }
    return { x: gx * field.scale, y: gy * field.scale };
  }

  /** Signed geodesic curvature for a unit direction (ux,uy) at (x,y). */
  function curvature(field, x, y, ux, uy) {
    var g = grad(field, x, y);
    return g.x * -uy + g.y * ux; // ∇φ · left-normal
  }

  /** Rotate a unit direction by the geodesic bend accumulated over ds. */
  function bendDir(field, x, y, ux, uy, ds) {
    var a = curvature(field, x, y, ux, uy) * ds;
    var c = Math.cos(a), s = Math.sin(a);
    return { x: ux * c - uy * s, y: ux * s + uy * c };
  }

  /** Random warp field for a level. Bumps live in the middle of the rect,
      away from the rails, so cushion play stays readable. */
  function randomField(n, rect, scale, rng) {
    rng = rng || Math.random;
    var bumps = [];
    var mx = rect.x + rect.w * 0.16, Mx = rect.x + rect.w * 0.84;
    var my = rect.y + rect.h * 0.18, My = rect.y + rect.h * 0.82;
    for (var i = 0; i < n; i++) {
      var amp = (0.9 + rng() * 0.9) * (rng() < 0.5 ? -1 : 1);
      var sigma = 28 + rng() * 34;
      bumps.push(bump(mx + rng() * (Mx - mx), my + rng() * (My - my), amp, sigma));
    }
    return makeField(bumps, scale);
  }

  root.Geo = {
    bump: bump,
    makeField: makeField,
    randomField: randomField,
    phi: phi,
    grad: grad,
    curvature: curvature,
    bendDir: bendDir,
  };
})(typeof window !== "undefined" ? window : globalThis);
