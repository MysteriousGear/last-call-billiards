/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — table.js
   Building and re-arranging the table itself: pockets, the rack, portals,
   and finding somewhere legal to put a ball back down. Pure table geometry —
   nothing here knows about runs, money or drunkenness.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};
  var Cfg = LCB.Config, Phys = LCB.Phys;
  var RECT = Cfg.RECT, R = Cfg.BALL_R;

  /** Four corners plus two side pockets. `bonus` widens every mouth. */
  function pocketSet(bonus) {
    var cr = 10 + bonus, sr = 8 + bonus;
    return [
      { x: RECT.x, y: RECT.y, r: cr },
      { x: RECT.x + RECT.w, y: RECT.y, r: cr },
      { x: RECT.x, y: RECT.y + RECT.h, r: cr },
      { x: RECT.x + RECT.w, y: RECT.y + RECT.h, r: cr },
      { x: RECT.x + RECT.w / 2, y: RECT.y - 2, r: sr },
      { x: RECT.x + RECT.w / 2, y: RECT.y + RECT.h + 2, r: sr },
    ];
  }

  /** Triangle rack on the right, 8-ball tucked into the middle of it. */
  function rack(world, colorCount) {
    var colors = Cfg.COLOR_POOL.slice(0, colorCount);
    var cx = RECT.x + RECT.w * 0.7, cy = RECT.y + RECT.h / 2;
    var spots = [], row = 0, placed = 0, need = colorCount + 1;
    while (placed < need) {
      for (var k = 0; k <= row && placed < need; k++, placed++)
        spots.push({ x: cx + row * 11, y: cy + (k - row / 2) * 12 });
      row++;
    }
    var eightAt = Math.min(spots.length - 1, Math.floor(spots.length / 2));
    var ci = 0;
    for (var i = 0; i < spots.length; i++) {
      var color = i === eightAt ? "eight" : colors[ci++];
      world.balls.push(Phys.makeBall(color, spots[i].x, spots[i].y, R, color));
    }
    world.balls.push(Phys.makeBall("cue", RECT.x + RECT.w * 0.2, cy, R, "cue"));
  }

  function spawnPortals(world) {
    if (world.portals.length) return;
    var jx = function () { return (Math.random() - 0.5) * 26; };
    world.portals = [
      { x: RECT.x + RECT.w * 0.38 + jx(), y: RECT.y + RECT.h * 0.26, r: 8 },
      { x: RECT.x + RECT.w * 0.55 + jx(), y: RECT.y + RECT.h * 0.76, r: 8 },
    ];
    for (var i = 0; i < world.portals.length; i++) {   // keep them off the balls
      var p = world.portals[i];
      for (var b = 0; b < world.balls.length; b++) {
        var bb = world.balls[b];
        if (!bb.sunk && Math.hypot(bb.x - p.x, bb.y - p.y) < p.r + bb.r + 6) p.y -= 24;
      }
    }
  }

  /** One more hole in the night — rewires the whole cycle (i → i+1). */
  function addPortal(world) {
    for (var t = 0; t < 30; t++) {
      var p = {
        x: RECT.x + 30 + Math.random() * (RECT.w - 60),
        y: RECT.y + 22 + Math.random() * (RECT.h - 44),
        r: 8,
      };
      var ok = true, i;
      for (i = 0; i < world.balls.length; i++) {
        var b = world.balls[i];
        if (!b.sunk && Math.hypot(b.x - p.x, b.y - p.y) < p.r + b.r + 8) { ok = false; break; }
      }
      for (i = 0; ok && i < world.portals.length; i++)
        if (Math.hypot(world.portals[i].x - p.x, world.portals[i].y - p.y) < 30) ok = false;
      for (i = 0; ok && i < world.pockets.length; i++)
        if (Math.hypot(world.pockets[i].x - p.x, world.pockets[i].y - p.y) < 26) ok = false;
      if (ok) { world.portals.push(p); return; }
    }
  }

  /** A spot near (cx,cy) clear of balls, pockets and portals. */
  function freeSpot(world, cx, cy, self) {
    for (var t = 0; t < 60; t++) {
      var x = cx + (t % 2 ? -1 : 1) * Math.floor(t / 2) * 10;
      var y = cy + ((t * 7) % 5 - 2) * 11;
      if (x < RECT.x + 12 || x > RECT.x + RECT.w - 12 ||
          y < RECT.y + 12 || y > RECT.y + RECT.h - 12) continue;
      var ok = true, i;
      for (i = 0; i < world.balls.length; i++) {
        var b = world.balls[i];
        if (b !== self && !b.sunk && Math.hypot(b.x - x, b.y - y) < R * 2.4) { ok = false; break; }
      }
      for (i = 0; ok && i < world.pockets.length; i++)
        if (Math.hypot(world.pockets[i].x - x, world.pockets[i].y - y) < world.pockets[i].r + R + 4) ok = false;
      for (i = 0; ok && i < world.portals.length; i++)
        if (Math.hypot(world.portals[i].x - x, world.portals[i].y - y) < world.portals[i].r + R + 4) ok = false;
      if (ok) return { x: x, y: y };
    }
    return { x: cx, y: cy };
  }

  function ballOfColor(world, color) {
    for (var i = 0; i < world.balls.length; i++)
      if (world.balls[i].color === color) return world.balls[i];
    return null;
  }

  function cueBall(world) { return ballOfColor(world, "cue"); }

  function colorsLeft(world) {
    var n = 0;
    for (var i = 0; i < world.balls.length; i++) {
      var b = world.balls[i];
      if (!b.sunk && b.color !== "cue" && b.color !== "eight") n++;
    }
    return n;
  }

  function nearestPocket(world, x, y) {
    var best = world.pockets[0], bd = Infinity;
    for (var i = 0; i < world.pockets.length; i++) {
      var p = world.pockets[i];
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** Back to the kitchen after a scratch. */
  function respawnCue(world) {
    var c = cueBall(world);
    c.sunk = false; c.vx = 0; c.vy = 0; c.portalCd = -1;
    var spot = freeSpot(world, RECT.x + RECT.w * 0.2, RECT.y + RECT.h / 2, c);
    c.x = spot.x; c.y = spot.y;
  }

  /** The bartender's mercy: the 8-ball comes back out near the rack. */
  function reviveEight(world) {
    var b = ballOfColor(world, "eight");
    if (!b) return;
    b.sunk = false; b.vx = 0; b.vy = 0; b.portalCd = -1;
    var spot = freeSpot(world, RECT.x + RECT.w * 0.7, RECT.y + RECT.h / 2, b);
    b.x = spot.x; b.y = spot.y;
  }

  LCB.Table = {
    pocketSet: pocketSet,
    rack: rack,
    spawnPortals: spawnPortals,
    addPortal: addPortal,
    freeSpot: freeSpot,
    ballOfColor: ballOfColor,
    cueBall: cueBall,
    colorsLeft: colorsLeft,
    nearestPocket: nearestPocket,
    respawnCue: respawnCue,
    reviveEight: reviveEight,
  };
})(typeof window !== "undefined" ? window : globalThis);
