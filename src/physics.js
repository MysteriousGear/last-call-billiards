/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — physics.js
   Balls, cushions, pockets, portals, and the honest aim-line tracer.

   Everything runs in low-res buffer pixels. All units: px, px/s, seconds.
   The warp (Geo) bends the *direction* of travel each substep; friction
   drains speed; collisions are standard equal-mass elastic resolved in
   ordinary table coordinates (the local-flat approximation).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var Geo = root.Geo;

  var FRICTION = 42;        // px/s² constant deceleration
  var STOP = 4;             // below this speed a ball stops
  var CUSHION_E = 0.86;     // cushion restitution
  var BALL_E = 0.985;       // ball-ball restitution
  var SUB = 1 / 240;        // fixed physics substep

  function makeBall(id, x, y, r, color) {
    return {
      id: id, x: x, y: y, vx: 0, vy: 0, r: r, color: color,
      sunk: false, portalCd: -1,
    };
  }

  /**
   * world = {
   *   field, rect: playfield {x,y,w,h}, balls: [],
   *   pockets: [{x,y,r}], portals: [] | [{x,y,r},{x,y,r}],
   * }
   */
  function speed(b) { return Math.hypot(b.vx, b.vy); }

  function anyMoving(world) {
    for (var i = 0; i < world.balls.length; i++) {
      var b = world.balls[i];
      if (!b.sunk && (b.vx !== 0 || b.vy !== 0)) return true;
    }
    return false;
  }

  /** Reflect a moving point off the playfield walls. Returns true if it hit. */
  function cushion(rect, o, r, e) {
    var hit = false;
    if (o.x < rect.x + r) { o.x = rect.x + r; if (o.vx < 0) { o.vx = -o.vx * e; hit = true; } }
    if (o.x > rect.x + rect.w - r) { o.x = rect.x + rect.w - r; if (o.vx > 0) { o.vx = -o.vx * e; hit = true; } }
    if (o.y < rect.y + r) { o.y = rect.y + r; if (o.vy < 0) { o.vy = -o.vy * e; hit = true; } }
    if (o.y > rect.y + rect.h - r) { o.y = rect.y + rect.h - r; if (o.vy > 0) { o.vy = -o.vy * e; hit = true; } }
    return hit;
  }

  /** Portal transit for a ball-like object. Returns index entered, or -1. */
  function portals(world, o, r) {
    var ps = world.portals;
    if (!ps || ps.length !== 2) return -1;
    for (var i = 0; i < 2; i++) {
      var p = ps[i];
      var d = Math.hypot(o.x - p.x, o.y - p.y);
      if (o.portalCd === i) {           // must fully leave the exit first
        if (d > p.r + r + 3) o.portalCd = -1;
        continue;
      }
      if (d < p.r) {
        var q = ps[1 - i];
        var sp = Math.hypot(o.vx, o.vy) || 1;
        var ux = o.vx / sp, uy = o.vy / sp;
        o.x = q.x + ux * (q.r + r + 2);  // pop out the far side, same heading
        o.y = q.y + uy * (q.r + r + 2);
        o.portalCd = 1 - i;
        return i;
      }
    }
    return -1;
  }

  function stepOne(world, b, dt, events) {
    var sp = speed(b);
    if (sp === 0) return;

    // geodesic bend, then advance
    var d = Geo.bendDir(world.field, b.x, b.y, b.vx / sp, b.vy / sp, sp * dt);
    b.vx = d.x * sp;
    b.vy = d.y * sp;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // "rails are one big pocket" mode: touching a cushion pots the ball
    if (world.railMouth > 0) {
      var rc = world.rect;
      if (b.x < rc.x + b.r || b.x > rc.x + rc.w - b.r ||
          b.y < rc.y + b.r || b.y > rc.y + rc.h - b.r) {
        b.sunk = true; b.vx = 0; b.vy = 0;
        events.push({ t: "pocket", b: b, rail: true });
        return;
      }
    } else if (cushion(world.rect, b, b.r, CUSHION_E)) {
      events.push({ t: "cushion", b: b });
    }
    if (portals(world, b, b.r) >= 0) events.push({ t: "portal", b: b });

    // friction
    sp = speed(b);
    var ns = sp - FRICTION * dt;
    if (ns <= STOP * 0.5) { b.vx = 0; b.vy = 0; }
    else { b.vx *= ns / sp; b.vy *= ns / sp; }
  }

  function collidePair(a, b, events) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.hypot(dx, dy);
    var min = a.r + b.r;
    if (d >= min || d === 0) return;
    var nx = dx / d, ny = dy / d;

    // positional de-overlap, split evenly
    var push = (min - d) / 2 + 0.01;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;

    // equal-mass elastic: swap normal velocity components
    var van = a.vx * nx + a.vy * ny;
    var vbn = b.vx * nx + b.vy * ny;
    var rel = van - vbn;
    if (rel <= 0) return;
    var j = rel * (1 + BALL_E) / 2;
    a.vx -= j * nx; a.vy -= j * ny;
    b.vx += j * nx; b.vy += j * ny;
    events.push({ t: "clack", speed: rel });
  }

  function checkPockets(world, events) {
    for (var i = 0; i < world.balls.length; i++) {
      var b = world.balls[i];
      if (b.sunk) continue;
      for (var k = 0; k < world.pockets.length; k++) {
        var p = world.pockets[k];
        if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) {
          b.sunk = true; b.vx = 0; b.vy = 0;
          events.push({ t: "pocket", b: b, pocket: p });
          break;
        }
      }
    }
  }

  /** Advance the world by dt (wall-clock). Returns an array of events. */
  function step(world, dt) {
    var events = [];
    world.acc = (world.acc || 0) + Math.min(dt, 0.1);
    while (world.acc >= SUB) {
      world.acc -= SUB;
      var i, j;
      for (i = 0; i < world.balls.length; i++)
        if (!world.balls[i].sunk) stepOne(world, world.balls[i], SUB, events);
      for (i = 0; i < world.balls.length; i++)
        for (j = i + 1; j < world.balls.length; j++)
          if (!world.balls[i].sunk && !world.balls[j].sunk)
            collidePair(world.balls[i], world.balls[j], events);
      checkPockets(world, events);
    }
    return events;
  }

  /**
   * The honest aim line: trace the exact geodesic the cue ball would follow
   * from (x,y) along unit dir (ux,uy), reflecting off cushions and passing
   * through portals, stopping at the first ball contact or after maxLen px.
   * Returns { pts: [{x,y}...], hit: null | { ball, x, y, nx, ny } }.
   * (nx,ny) is the direction the struck ball would depart — used by the
   * "Bounce Reader" shop item to draw the object-ball ghost.
   */
  function tracePath(world, x, y, ux, uy, maxLen, ballR) {
    var ds = 2;
    var pts = [{ x: x, y: y }];
    var o = { x: x, y: y, vx: ux, vy: uy, portalCd: -1 };
    var hit = null;

    for (var s = 0; s < maxLen; s += ds) {
      var d = Geo.bendDir(world.field, o.x, o.y, o.vx, o.vy, ds);
      o.vx = d.x; o.vy = d.y;
      o.x += o.vx * ds;
      o.y += o.vy * ds;
      if (world.railMouth > 0) {
        var rc = world.rect;
        if (o.x < rc.x + ballR || o.x > rc.x + rc.w - ballR ||
            o.y < rc.y + ballR || o.y > rc.y + rc.h - ballR) {
          pts.push({ x: o.x, y: o.y });   // honest: the path ends in the rails
          break;
        }
      } else {
        cushion(world.rect, o, ballR, 1);
      }
      portals(world, o, ballR);

      // first ball contact ends the trace
      for (var i = 0; i < world.balls.length; i++) {
        var b = world.balls[i];
        if (b.sunk || (b.x === x && b.y === y)) continue;
        var ddx = b.x - o.x, ddy = b.y - o.y;
        var dist = Math.hypot(ddx, ddy);
        if (dist < b.r + ballR) {
          hit = { ball: b, x: o.x, y: o.y, nx: ddx / dist, ny: ddy / dist };
          break;
        }
      }
      pts.push({ x: o.x, y: o.y });
      if (hit) break;

      // stop early if we fell into a pocket
      var potted = false;
      for (var k = 0; k < world.pockets.length; k++) {
        var p = world.pockets[k];
        if (Math.hypot(o.x - p.x, o.y - p.y) < p.r) { potted = true; break; }
      }
      if (potted) break;
    }
    return { pts: pts, hit: hit };
  }

  root.Phys = {
    makeBall: makeBall,
    step: step,
    speed: speed,
    anyMoving: anyMoving,
    tracePath: tracePath,
    FRICTION: FRICTION,
  };
})(typeof window !== "undefined" ? window : globalThis);
