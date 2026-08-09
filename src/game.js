/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — game.js
   The roguelike shell: a 3-level run through an increasingly drunk bar.
   Rules are classic-adjacent 8-ball: pot the colors (any order), then the
   8-ball. Sink the 8 early — or scratch on it — and the night is over.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var Geo = root.Geo, Phys = root.Phys, Render = root.Render;

  var BALL_R = 5;
  var RECT = { x: 26, y: 44, w: 348, h: 142 };
  var COLOR_POOL = ["red", "yellow", "blue", "purple", "orange", "green"];
  var POT_CASH = 12, EIGHT_CASH = 30, CLEAR_CASH = 20, SCRATCH_COST = 10;

  // The chaser ramp: each level starts nearly sober (10% of its warp) and
  // every CHASER_EVERY shots the player downs a chaser — +35% drunker,
  // physics and visuals together. So the first shots teach the table
  // honestly and the geometry closes in as the night goes on.
  var CHASER_EVERY = 4, DRUNK_BASE = 0.1, DRUNK_STEP = 0.35, DRUNK_MAX = 1.3;

  // Cat: a nudge, not a shot. Only goes for the pot from inside CAT_COMMIT px.
  var CAT_NUDGE = 26, CAT_NUDGE_VAR = 22, CAT_COMMIT = 52;

  // Bridges sit at an angle to the rail so their mouth faces the middle of
  // the table, and stop short of the pocket so the last stretch still counts.
  var BRIDGE_TILT = Math.PI / 6;   // 30°
  var BRIDGE_GAP = 24;

  // At most two helpers on the table at once (for now).
  var HELPER_MAX = 2;
  var HELPERS = [
    { key: "euclid", name: "FLAT PATCH", blurb: "a calm island where", blurb2: "geometry behaves" },
    { key: "bridge", name: "BRIDGE",     blurb: "railed corridor aimed", blurb2: "at a pocket" },
    { key: "crane",  name: "CRANE",      blurb: "dock a ball, the claw", blurb2: "drops it in. once" },
    { key: "cat",    name: "BAR CAT",    blurb: "nudges one ball into", blurb2: "a better spot. once" },
  ];

  var SPECIALS = {
    cash:       { msg: "tip jar ball! +$25" },
    extraShot:  { msg: "one on the house! +1 shot" },
    midPocket:  { msg: "the floor opens. new pocket!" },
    railMouth:  { msg: "THE RAILS ARE THIRSTY (2 shots)" },
    portalBall: { msg: "portals uncorked. wait. what." },
  };
  // which powers can appear per level index (simple → weird)
  var SPECIAL_TIERS = [
    ["cash", "extraShot"],
    ["cash", "extraShot", "midPocket", "portalBall"],
    ["cash", "extraShot", "midPocket", "portalBall", "railMouth"],
  ];

  var LEVELS = [
    { name: "HAPPY HOUR", tag: "two drinks in — space leans a little",
      colors: 3, bumps: 2, warp: 0.45, shots: 10, portals: false, specials: 1,
      visuals: { gridWarp: 0.35, swim: 0, wobble: 0, ghost: 0 } },
    { name: "DOUBLE SHOT", tag: "the felt has started to breathe",
      colors: 5, bumps: 3, warp: 0.7, shots: 12, portals: false, specials: 2,
      visuals: { gridWarp: 0.7, swim: 1.2, wobble: 0, ghost: 0 } },
    { name: "LAST CALL", tag: "there are two of every table",
      colors: 6, bumps: 4, warp: 0.95, shots: 14, portals: true, specials: 2,
      visuals: { gridWarp: 1.0, swim: 2.0, wobble: 2.4, ghost: 1 } },
  ];

  var SHOP_POOL = [
    { key: "longerLook", name: "LONGER LOOK", price: 30, repeat: true,
      desc1: "aim line sees 70px", desc2: "further down the curve" },
    { key: "bounceReader", name: "BOUNCE READER", price: 40,
      desc1: "shows where the struck", desc2: "ball will head" },
    { key: "soberSip", name: "SOBER SIP", price: 25, repeat: true,
      desc1: "next level: space is", desc2: "30% less drunk" },
    { key: "wideMouth", name: "WIDE MOUTH", price: 45,
      desc1: "pockets +2px wide", desc2: "for the whole run" },
    { key: "oneMoreRound", name: "ONE MORE ROUND", price: 35,
      desc1: "+3 shots on every", desc2: "level from now on" },
    { key: "tipJar", name: "TIP JAR", price: 30,
      desc1: "+$6 for every color", desc2: "you pot" },
  ];

  /* ── audio: tiny square-wave bar ─────────────────────────────────────── */

  var AC = null;
  function audio() {
    if (!AC) { try { AC = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === "suspended") AC.resume();
    return AC;
  }
  function beep(freq, dur, vol, type, slide) {
    var ac = AC;
    if (!ac) return;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  }
  var SFX = {
    clack:   function (v) { beep(180 + Math.min(220, v), 0.06, 0.16, "square"); },
    cushion: function () { beep(95, 0.07, 0.12, "triangle"); },
    pocket:  function () { beep(300, 0.16, 0.18, "square", 260); },
    portal:  function () { beep(500, 0.25, 0.14, "sawtooth", -320); },
    shoot:   function () { beep(140, 0.08, 0.14, "triangle", 120); },
    chaser:  function () {
      // three gulps, the glass hits the bar, the room starts to lean
      [520, 430, 340].forEach(function (f, i) {
        setTimeout(function () { beep(f, 0.08, 0.18, "triangle", -80); }, i * 120);
      });
      setTimeout(function () { beep(85, 0.28, 0.22, "sawtooth", -25); }, 400);
      setTimeout(function () { beep(260, 0.55, 0.13, "sawtooth", -170); }, 470);
    },
    special: function () { [660, 880, 1100].forEach(function (f, i) { setTimeout(function () { beep(f, 0.09, 0.14, "square"); }, i * 70); }); },
    giggle:  function () { beep(900, 0.06, 0.08, "square", 300); setTimeout(function () { beep(1100, 0.06, 0.08, "square", 300); }, 90); },
    mercy:   function () { beep(360, 0.12, 0.14, "triangle", 160); setTimeout(function () { beep(560, 0.18, 0.14, "triangle", 120); }, 130); },
    crane:   function () { beep(70, 0.3, 0.16, "square", 40); setTimeout(function () { beep(110, 0.5, 0.1, "sawtooth", 90); }, 250); },
    meow:    function () { beep(760, 0.16, 0.12, "triangle", -260); setTimeout(function () { beep(680, 0.2, 0.1, "triangle", -300); }, 200); },
    buy:     function () { beep(520, 0.09, 0.14, "square"); setTimeout(function () { beep(780, 0.12, 0.14, "square"); }, 80); },
    nope:    function () { beep(120, 0.15, 0.14, "sawtooth", -40); },
    lose:    function () { beep(220, 0.4, 0.16, "sawtooth", -160); },
    win:     function () { [440, 550, 660, 880].forEach(function (f, i) { setTimeout(function () { beep(f, 0.14, 0.15, "square"); }, i * 110); }); },
  };

  /* ── game state ──────────────────────────────────────────────────────── */

  var game = {
    state: "title",
    world: null, level: LEVELS[0], run: null,
    aim: { active: false, power: 0, dir: null, trace: null },
    shopStock: [], hover: null,
    msg: "", msgUntil: 0, msgColor: null,
    levelStartT: 0, endReason: "",
    chasers: 0, vis: null, dev: false, goblin: null, defocusT: 0,
    craneAnim: null, cat: null, glass: false, trip: false,
    cue: function () {
      for (var i = 0; i < game.world.balls.length; i++)
        if (game.world.balls[i].color === "cue") return game.world.balls[i];
      return null;
    },
  };
  var shot = null; // {scratched, eightSunk, potted:[]} while a shot resolves
  var tNow = 0;

  function say(m, color, ms) {
    game.msg = m; game.msgColor = color || null;
    game.msgUntil = performance.now() + (ms || 2600);
  }

  function newRun() {
    game.run = {
      money: 0, levelIndex: 0, shots: 0, shotsFired: 0,
      items: {}, aimLen: 110, pocketBonus: 0, soberSips: 0,
      shotBonus: 0, potBonus: 0, mercyUsed: false,
      helpers: randomHelperSet(), helpersLocked: false,
    };
    buildLevel(0);
    game.state = "play";
  }

  /** 0.1 → 1.3: how much of the level's warp is currently active. */
  function drunkF() {
    return Math.min(DRUNK_MAX, DRUNK_BASE + DRUNK_STEP * game.chasers);
  }

  /* ── level construction ──────────────────────────────────────────────── */

  function pocketSet(bonus) {
    var r = RECT, cr = 10 + bonus, sr = 8 + bonus;
    return [
      { x: r.x, y: r.y, r: cr }, { x: r.x + r.w, y: r.y, r: cr },
      { x: r.x, y: r.y + r.h, r: cr }, { x: r.x + r.w, y: r.y + r.h, r: cr },
      { x: r.x + r.w / 2, y: r.y - 2, r: sr }, { x: r.x + r.w / 2, y: r.y + r.h + 2, r: sr },
    ];
  }

  function buildLevel(idx) {
    var def = LEVELS[idx];
    game.level = def;
    game.run.levelIndex = idx;
    game.run.shots = def.shots + game.run.shotBonus;

    game.baseWarp = def.warp * Math.pow(0.7, game.run.soberSips);
    game.run.soberSips = 0; // sip is spent on the level it precedes
    game.chasers = 0;
    game.run.shotsFired = 0;

    var world = {
      field: Geo.randomField(def.bumps, RECT, game.baseWarp * DRUNK_BASE),
      rect: RECT,
      balls: [],
      pockets: pocketSet(game.run.pocketBonus),
      portals: [],
      railMouth: 0,
      zones: [],
      crane: null,
      catAllowed: false,
      catDone: false,
      craneUsed: false,
    };
    game.craneAnim = null;
    game.cat = null;

    // rack: triangle on the right, 8-ball tucked in the middle of it
    var colors = COLOR_POOL.slice(0, def.colors);
    var cx = RECT.x + RECT.w * 0.7, cy = RECT.y + RECT.h / 2;
    var spots = [];
    var row = 0, placed = 0, need = def.colors + 1;
    while (placed < need) {
      for (var k = 0; k <= row && placed < need; k++, placed++)
        spots.push({ x: cx + row * 11, y: cy + (k - row / 2) * 12 });
      row++;
    }
    var eightAt = Math.min(spots.length - 1, Math.floor(spots.length / 2));
    var ci = 0;
    for (var i = 0; i < spots.length; i++) {
      var color = i === eightAt ? "eight" : colors[ci++];
      world.balls.push(Phys.makeBall(color, spots[i].x, spots[i].y, BALL_R, color));
    }
    world.balls.push(Phys.makeBall("cue", RECT.x + RECT.w * 0.2, cy, BALL_R, "cue"));

    // hand out special powers to random color balls
    var tier = SPECIAL_TIERS[Math.min(idx, SPECIAL_TIERS.length - 1)].slice();
    var candidates = world.balls.filter(function (b) {
      return b.color !== "cue" && b.color !== "eight";
    });
    for (i = 0; i < (def.specials || 0) && candidates.length && tier.length; i++) {
      var bi = Math.floor(Math.random() * candidates.length);
      var si = Math.floor(Math.random() * tier.length);
      candidates.splice(bi, 1)[0].special = tier.splice(si, 1)[0];
    }

    // Helpers last: they need the final ball positions to route around.
    // The set is rolled randomly per level until the player edits it in the
    // TABLE SETUP menu, after which their choice sticks for the rest of the run.
    if (!game.run.helpersLocked) game.run.helpers = randomHelperSet();
    applyHelpers(world, game.run.helpers);

    if (def.portals) spawnPortals(world);

    game.world = world;
    game.levelStartT = tNow;
    shot = null;
    say(def.tag, null, 3200);
  }

  /**
   * Random relief for a warped table: patches and bridges where the
   * geometry is honest-to-goodness euclidean. A stranded cue ball can be
   * threaded through one of these to cross drunk space in a straight line.
   */
  function randomHelperSet() {
    var pool = HELPERS.map(function (h) { return h.key; });
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return pool.slice(0, HELPER_MAX);
  }

  /**
   * Put exactly the chosen helpers on the table. Safe to call mid-level —
   * the setup menu calls it live on every toggle. Per-level "already spent"
   * flags survive, so toggling the crane or cat off and on is not a refill.
   */
  function applyHelpers(world, keys) {
    world.zones = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k !== "euclid" && k !== "bridge") continue;
      var z = null;
      for (var t = 0; t < 24 && !z; t++) {
        var cand = k === "bridge" ? bridgeToPocket(world) : euclidPatch();
        if (!zoneBlocked(cand, world, world.zones)) z = cand;
      }
      if (z) world.zones.push(z);
    }
    world.crane = keys.indexOf("crane") >= 0 ? {
      x: RECT.x + RECT.w * (0.28 + Math.random() * 0.3),
      y: RECT.y + RECT.h * (0.25 + Math.random() * 0.5),
      r: 7, used: world.craneUsed,
    } : null;
    world.catAllowed = keys.indexOf("cat") >= 0;
  }

  /**
   * A bridge is only worth crossing if it goes somewhere: its axis passes
   * exactly through a pocket, and the far end stops BRIDGE_GAP short, so a
   * ball that rides the corridor exits pointed at the hole with one last
   * stretch of drunk space to survive.
   *
   * The axis is tilted BRIDGE_TILT off the rail-parallel direction, in
   * whichever of the two directions swings the entrance toward the middle of
   * the table. A corridor lying flat along a rail can only be entered from
   * along that rail; angling it opens the mouth to the centre, where the cue
   * ball actually lives.
   */
  function bridgeToPocket(world) {
    var pk = world.pockets[Math.floor(Math.random() * world.pockets.length)];
    var mx = RECT.x + RECT.w / 2, my = RECT.y + RECT.h / 2;
    var dx = pk.x - mx, dy = pk.y - my;
    var len = 74 + Math.random() * 26, hw = 8;

    // the rail-parallel heading that points at this pocket
    var base = Math.abs(dx) > Math.abs(dy)
      ? (dx < 0 ? Math.PI : 0)
      : (dy < 0 ? -Math.PI / 2 : Math.PI / 2);

    var best = null;
    for (var s = -1; s <= 1; s += 2) {
      var ang = base + s * BRIDGE_TILT;
      var ux = Math.cos(ang), uy = Math.sin(ang);
      // exit end sits BRIDGE_GAP back from the pocket, along the axis
      var ex = pk.x - ux * BRIDGE_GAP, ey = pk.y - uy * BRIDGE_GAP;
      var entX = ex - ux * len, entY = ey - uy * len;
      var reach = Math.hypot(entX - mx, entY - my);   // mouth nearest the middle wins
      if (!best || reach < best.reach)
        best = { reach: reach, ang: ang, cos: ux, sin: uy,
                 cx: ex - ux * (len / 2), cy: ey - uy * (len / 2) };
    }
    return { type: "bridge", aimAt: pk, cx: best.cx, cy: best.cy,
             ang: best.ang, cos: best.cos, sin: best.sin, len: len, hw: hw };
  }

  /** The four corners of an oriented bridge, in world coordinates. */
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

  function euclidPatch() {
    var pw = 58 + Math.random() * 32, ph = 40 + Math.random() * 20;
    return {
      type: "euclid", w: pw, h: ph,
      x: RECT.x + 20 + Math.random() * (RECT.w * 0.65 - pw),
      y: RECT.y + 14 + Math.random() * (RECT.h - 28 - ph),
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /** Reject a zone that runs off the felt, traps a ball on a railing, or
      overlaps one already placed. */
  function zoneBlocked(z, world, placed) {
    var i, bb = zoneBBox(z);

    if (z.type === "bridge") {
      var c = bridgeCorners(z);
      for (i = 0; i < c.length; i++)
        if (c[i].x < RECT.x + 2 || c[i].x > RECT.x + RECT.w - 2 ||
            c[i].y < RECT.y + 2 || c[i].y > RECT.y + RECT.h - 2) return true;

      for (i = 0; i < world.balls.length; i++) {
        var b = world.balls[i];
        // a ball resting on the deck is fine; resting ON a railing is not
        var u = (b.x - z.cx) * z.cos + (b.y - z.cy) * z.sin;
        if (Math.abs(u) > z.len / 2 + BALL_R * 2) continue;
        var v = -(b.x - z.cx) * z.sin + (b.y - z.cy) * z.cos;
        if (Math.abs(Math.abs(v) - z.hw) < BALL_R + 2) return true;
      }
    }

    for (i = 0; i < placed.length; i++) {
      var o = zoneBBox(placed[i]);
      if (bb.x < o.x + o.w && bb.x + bb.w > o.x &&
          bb.y < o.y + o.h && bb.y + bb.h > o.y) return true;
    }
    return false;
  }

  function spawnPortals(world) {
    if (world.portals.length) return;
    var jx = function () { return (Math.random() - 0.5) * 26; };
    world.portals = [
      { x: RECT.x + RECT.w * 0.38 + jx(), y: RECT.y + RECT.h * 0.26, r: 8 },
      { x: RECT.x + RECT.w * 0.55 + jx(), y: RECT.y + RECT.h * 0.76, r: 8 },
    ];
    // keep portals off the balls
    for (var i = 0; i < world.portals.length; i++) {
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

  function colorsLeft() {
    var n = 0;
    for (var i = 0; i < game.world.balls.length; i++) {
      var b = game.world.balls[i];
      if (!b.sunk && b.color !== "cue" && b.color !== "eight") n++;
    }
    return n;
  }

  /* ── shot resolution ─────────────────────────────────────────────────── */

  function onEvents(evts) {
    for (var i = 0; i < evts.length; i++) {
      var e = evts[i];
      if (e.t === "clack") SFX.clack(e.speed);
      else if (e.t === "cushion") SFX.cushion();
      else if (e.t === "portal") { SFX.portal(); say("wait. what.", null, 1400); }
      else if (e.t === "pocket") { SFX.pocket(); potBall(e.b); }
    }
  }

  /** Shared bookkeeping for any ball that goes down — pocket, rail, crane. */
  function potBall(b) {
    if (b.color === "cue") { if (shot) shot.scratched = true; return; }
    if (b.color === "eight") { if (shot) shot.eightSunk = true; return; }
    if (shot) shot.potted.push(b.color);
    var cash = POT_CASH + game.run.potBonus;
    game.run.money += cash;
    if (b.special) applySpecial(b.special);
    else say("down the hatch! +$" + cash, Render.PAL.ok);
  }

  /** Potted-special powers kick in the moment the ball drops. */
  function applySpecial(key) {
    SFX.special();
    if (key === "portalBall" && game.world.portals.length)
      say("ANOTHER portal. the cycle rewires.", Render.PAL.accent, 3000);
    else say(SPECIALS[key].msg, Render.PAL.accent, 3000);
    if (key === "cash") game.run.money += 25;
    else if (key === "extraShot") game.run.shots += 1;
    else if (key === "midPocket") {
      game.world.pockets.push({
        x: RECT.x + RECT.w * (0.35 + Math.random() * 0.3),
        y: RECT.y + RECT.h * (0.3 + Math.random() * 0.4),
        r: 9,
      });
    }
    // 3 because the activating shot's own settle decrements it → 2 full shots
    else if (key === "railMouth") game.world.railMouth = 3;
    else if (key === "portalBall") {
      if (game.world.portals.length) addPortal(game.world);
      else spawnPortals(game.world);
    }
  }

  function settleShot() {
    var s = shot; shot = null;
    if (!s) return;

    if (game.world.railMouth > 0 && --game.world.railMouth === 0)
      say("the rails sober up", null, 2200);

    if (s.eightSunk && colorsLeft() === 0) {
      if (s.scratched) return bust("scratched on the 8-ball. brutal.");
      return clearLevel();
    }
    if (s.eightSunk) {
      // 8-ball down too early. The bartender covers for you — once per night.
      if (game.run.mercyUsed)
        return bust("the 8-ball again? no more favors.");
      game.run.mercyUsed = true;
      reviveEight();
      SFX.mercy();
      say("the bartender fishes out the 8-ball. ONE time.", Render.PAL.accent, 4200);
    }
    if (s.scratched) {
      game.run.money = Math.max(0, game.run.money - SCRATCH_COST);
      respawnCue();
      say("SCRATCH. -$" + SCRATCH_COST + " (hic)", Render.PAL.danger);
    }
    if (game.run.shots <= 0) return bust("tab ran dry — out of shots");
    maybeChaser();
  }

  function clearLevel() {
    game.run.money += EIGHT_CASH + CLEAR_CASH;
    SFX.win();
    if (game.run.levelIndex >= LEVELS.length - 1) game.state = "win";
    else openShop();
  }

  function bust(reason) {
    game.endReason = reason;
    game.state = "over";
    SFX.lose();
  }

  /** Put the 8-ball back on the table at a free spot near the rack. */
  function reviveEight() {
    for (var i = 0; i < game.world.balls.length; i++) {
      var b = game.world.balls[i];
      if (b.color !== "eight") continue;
      b.sunk = false; b.vx = 0; b.vy = 0; b.portalCd = -1;
      var spot = findFreeSpot(RECT.x + RECT.w * 0.7, RECT.y + RECT.h / 2, b);
      b.x = spot.x; b.y = spot.y;
      return;
    }
  }

  function findFreeSpot(cx, cy, self) {
    for (var t = 0; t < 60; t++) {
      var x = cx + (t % 2 ? -1 : 1) * Math.floor(t / 2) * 10;
      var y = cy + ((t * 7) % 5 - 2) * 11;
      if (x < RECT.x + 12 || x > RECT.x + RECT.w - 12 ||
          y < RECT.y + 12 || y > RECT.y + RECT.h - 12) continue;
      var ok = true, i;
      for (i = 0; i < game.world.balls.length; i++) {
        var b = game.world.balls[i];
        if (b !== self && !b.sunk && Math.hypot(b.x - x, b.y - y) < BALL_R * 2.4) { ok = false; break; }
      }
      for (i = 0; ok && i < game.world.pockets.length; i++)
        if (Math.hypot(game.world.pockets[i].x - x, game.world.pockets[i].y - y) <
            game.world.pockets[i].r + BALL_R + 4) ok = false;
      for (i = 0; ok && i < game.world.portals.length; i++)
        if (Math.hypot(game.world.portals[i].x - x, game.world.portals[i].y - y) <
            game.world.portals[i].r + BALL_R + 4) ok = false;
      if (ok) return { x: x, y: y };
    }
    return { x: cx, y: cy };
  }

  function respawnCue() {
    var c = game.cue();
    c.sunk = false; c.vx = 0; c.vy = 0; c.portalCd = -1;
    var y0 = RECT.y + RECT.h / 2;
    for (var t = 0; t < 40; t++) {
      var x = RECT.x + RECT.w * 0.2 + (t % 2 ? -1 : 1) * Math.floor(t / 2) * 9;
      var y = y0 + ((t * 7) % 3 - 1) * 14;
      var ok = true;
      for (var i = 0; i < game.world.balls.length; i++) {
        var b = game.world.balls[i];
        if (b !== c && !b.sunk && Math.hypot(b.x - x, b.y - y) < BALL_R * 2.4) { ok = false; break; }
      }
      if (ok) { c.x = x; c.y = y; return; }
    }
    c.x = RECT.x + RECT.w * 0.2; c.y = y0;
  }

  /* ── shop ────────────────────────────────────────────────────────────── */

  function openShop() {
    var pool = SHOP_POOL.filter(function (it) {
      return it.repeat || !game.run.items[it.key];
    });
    // shuffle, take 4
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    game.shopStock = pool.slice(0, 4).map(function (it) {
      return { key: it.key, name: it.name, price: it.price,
               desc1: it.desc1, desc2: it.desc2, sold: false };
    });
    game.state = "shop";
  }

  function buyItem(idx) {
    var it = game.shopStock[idx];
    if (!it || it.sold || game.run.money < it.price) { SFX.nope(); return; }
    game.run.money -= it.price;
    it.sold = true;
    game.run.items[it.key] = (game.run.items[it.key] || 0) + 1;
    if (it.key === "longerLook") game.run.aimLen += 70;
    if (it.key === "soberSip") game.run.soberSips++;
    if (it.key === "wideMouth") game.run.pocketBonus += 2;
    if (it.key === "oneMoreRound") game.run.shotBonus += 3;
    if (it.key === "tipJar") game.run.potBonus += 6;
    SFX.buy();
  }

  /* ── input ───────────────────────────────────────────────────────────── */

  var pointer = { down: false };

  function canAim() {
    return game.state === "play" && !Phys.anyMoving(game.world) &&
           !game.cue().sunk && !game.craneAnim && !game.cat;
  }

  function updateAim(p) {
    var c = game.cue();
    var dx = p.x - c.x, dy = p.y - c.y;
    var d = Math.hypot(dx, dy);
    if (d < 6) { game.aim.dir = null; game.aim.trace = null; game.aim.power = 0; return; }
    game.aim.dir = { x: dx / d, y: dy / d };
    game.aim.power = Math.min(1, Math.max(0, (d - 12) / 130));
    var reach = game.dev ? 1600 : game.run.aimLen; // dev mode: the whole truth
    game.aim.trace = Phys.tracePath(game.world, c.x, c.y,
      game.aim.dir.x, game.aim.dir.y, reach, BALL_R);
  }

  function shoot() {
    var a = game.aim;
    if (!a.dir || a.power < 0.05) return;
    var c = game.cue();
    var v = 90 + a.power * 300;
    c.vx = a.dir.x * v; c.vy = a.dir.y * v;
    game.run.shots--;
    game.run.shotsFired++;
    shot = { scratched: false, eightSunk: false, potted: [] };
    SFX.shoot();
  }

  /**
   * Chasers land BETWEEN turns, never mid-shot: the shot you aimed is played
   * out at the drunkenness you aimed it at, and the next drink hits while the
   * table is still, so you can see the new geometry before committing.
   */
  function maybeChaser() {
    var c = Math.floor(game.run.shotsFired / CHASER_EVERY);
    if (c <= game.chasers || drunkF() >= DRUNK_MAX) return;
    game.chasers = c;
    game.defocusT = tNow;   // the room goes soft for a second or two
    SFX.chaser();
    say("CHASER DOWNED (hic) — space tilts", Render.PAL.accent, 3200);
  }

  function onDown(e) {
    audio();
    var p = Render.toBuffer(e.clientX, e.clientY);
    pointer.down = true;

    var btn = Render.hitButton(p);
    if (btn) { pointer.btn = btn; return; }
    pointer.btn = null;

    if (canAim()) { game.aim.active = true; updateAim(p); }
  }

  function onMove(e) {
    var p = Render.toBuffer(e.clientX, e.clientY);
    game.hover = Render.hitButton(p);
    if (game.aim.active && pointer.down) {
      if (canAim()) updateAim(p);
      else game.aim.active = false;
    }
  }

  function onUp(e) {
    var p = Render.toBuffer(e.clientX, e.clientY);
    if (pointer.btn) {
      var btn = Render.hitButton(p);
      if (btn === pointer.btn) click(btn);
      pointer.btn = null;
    } else if (game.aim.active) {
      if (canAim()) shoot();
      game.aim.active = false;
      game.aim.trace = null;
    }
    pointer.down = false;
  }

  function click(id) {
    if (id === "start" && game.state === "title") newRun();
    else if (id === "next" && game.state === "shop") { buildLevel(game.run.levelIndex + 1); game.state = "play"; }
    else if (id === "again" && (game.state === "over" || game.state === "win")) newRun();
    else if (id && id.indexOf("item") === 0 && game.state === "shop") buyItem(+id.slice(4));
    else if (id === "glass") toggleGlass();
    else if (id === "trip") toggleTrip();
    else if (id === "setup") openSetup();
    else if (id === "setupDone") closeSetup();
    else if (id === "setupRoll") {
      game.run.helpers = randomHelperSet();
      game.run.helpersLocked = true;
      applyHelpers(game.world, game.run.helpers);
      SFX.buy();
    }
    else if (id && id.indexOf("help") === 0) toggleHelper(HELPERS[+id.slice(4)].key);
  }

  function openSetup() {
    if (game.state !== "play" || !game.dev) return;   // dev tool only
    game.prevState = game.state;
    game.state = "setup";
    game.aim.active = false;
    game.aim.trace = null;
  }
  function closeSetup() { if (game.state === "setup") game.state = "play"; }

  /** Live toggle: the table behind the menu updates on every click. */
  function toggleHelper(key) {
    var set = game.run.helpers.slice();
    var at = set.indexOf(key);
    if (at >= 0) set.splice(at, 1);
    else if (set.length >= HELPER_MAX) { SFX.nope(); return; }
    else set.push(key);
    game.run.helpers = set;
    game.run.helpersLocked = true;
    applyHelpers(game.world, set);
    SFX.buy();
  }

  function toggleGlass() {
    game.glass = !game.glass;
    say(game.glass ? "the felt goes glass" : "the felt comes back", null, 1600);
  }
  function toggleTrip() {
    game.trip = !game.trip;
    say(game.trip ? "colors start to wander..." : "colors settle down", null, 1600);
  }

  /* ── the helpers: crane and cat ──────────────────────────────────────── */

  function nearestPocket(x, y) {
    var best = game.world.pockets[0], bd = Infinity;
    for (var i = 0; i < game.world.pockets.length; i++) {
      var p = game.world.pockets[i];
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /**
   * The crane dock: roll any ball onto it and a claw carries the ball
   * straight to the nearest pocket. One lift per level. It won't take the
   * cue ball, and it won't touch the 8-ball while colors remain.
   */
  function updateCrane() {
    var cr = game.world.crane;
    var ca = game.craneAnim;

    if (ca) {  // animate the lift; deliver at the end
      if (tNow - ca.t0 >= ca.dur) {
        SFX.pocket();
        potBall(ca.b);
        game.craneAnim = null;
      }
      return;
    }
    if (!cr || cr.used) return;
    for (var i = 0; i < game.world.balls.length; i++) {
      var b = game.world.balls[i];
      if (b.sunk || b.color === "cue") continue;
      if (b.color === "eight" && colorsLeft() > 0) continue;
      if (Math.hypot(b.x - cr.x, b.y - cr.y) > cr.r + b.r) continue;
      cr.used = true;
      game.world.craneUsed = true;   // survives helper-menu toggling
      if (!shot) shot = { scratched: false, eightSunk: false, potted: [] };
      b.sunk = true; b.vx = 0; b.vy = 0;   // off the table while airborne
      var pk = nearestPocket(b.x, b.y);
      game.craneAnim = { b: b, from: { x: b.x, y: b.y },
                         to: { x: pk.x, y: pk.y }, t0: tNow, dur: 1.4 };
      SFX.crane();
      say("the crane obliges", Render.PAL.accent, 2400);
      return;
    }
  }

  /**
   * The bar cat. Now and then (once per level, table at rest) it strolls up
   * to a color ball — or the 8-ball if it's the only one left — and paws it
   * toward the nearest pocket. It aims straight; drunk space may disagree.
   */
  function updateCat(dt) {
    var cat = game.cat;
    if (cat) {
      if (cat.armed && tNow - cat.t0 >= 0.9) {   // the swipe
        cat.armed = false;
        var b = cat.ball;
        if (!b.sunk) {
          if (!shot) shot = { scratched: false, eightSunk: false, potted: [] };
          b.vx = cat.dir.x * cat.speed;
          b.vy = cat.dir.y * cat.speed;
          SFX.meow();
          say(cat.commit ? "the cat sinks it. smug."
                         : "the cat improves your position", Render.PAL.ok, 2400);
        }
      }
      if (tNow - cat.t0 > 2.4) game.cat = null;
      return;
    }
    // strictly once per level: catDone latches the moment it is summoned
    if (game.world.catDone || !game.world.catAllowed) return;
    if (shot !== null || game.craneAnim) return;
    if (Phys.anyMoving(game.world)) return;
    if (Math.random() > dt / 40) return;

    // pick a target: any color ball, else the lone 8-ball
    var pool = game.world.balls.filter(function (b) {
      return !b.sunk && b.color !== "cue" && b.color !== "eight";
    });
    if (!pool.length) pool = game.world.balls.filter(function (b) {
      return !b.sunk && b.color === "eight";
    });
    if (!pool.length) return;
    var ball = pool[Math.floor(Math.random() * pool.length)];
    var pk = nearestPocket(ball.x, ball.y);
    var dx = pk.x - ball.x, dy = pk.y - ball.y;
    var dd = Math.hypot(dx, dy) || 1;

    // A cat is not a cue. It taps the ball a short way toward the hole to
    // leave you a better position — unless the ball is already sitting on
    // the lip, in which case it might as well finish the job.
    var commit = dd < CAT_COMMIT;
    var travel = commit ? dd + 14 : CAT_NUDGE + Math.random() * CAT_NUDGE_VAR;
    var speed = Math.sqrt(2 * Phys.FRICTION * travel);
    var jitter = (Math.random() - 0.5) * (commit ? 0.10 : 0.34);
    var cs = Math.cos(jitter), sn = Math.sin(jitter);
    var dir = { x: (dx * cs - dy * sn) / dd, y: (dx * sn + dy * cs) / dd };

    game.world.catDone = true;
    game.cat = {
      ball: ball, dir: dir, speed: speed, commit: commit, t0: tNow, armed: true,
      x: ball.x - dir.x * 14, y: ball.y - dir.y * 14,
    };
  }

  /* ── main loop ───────────────────────────────────────────────────────── */

  var lastMs = performance.now();
  var wasMoving = false;

  function frame(ms) {
    var dt = Math.min((ms - lastMs) / 1000, 0.1);
    lastMs = ms;
    tNow = ms / 1000;

    if (game.state === "play") {
      // the chaser ramp drives both the physics and the rendering
      var f = drunkF();
      game.world.field.scale = game.baseWarp * f;
      var v = game.level.visuals;
      game.vis = { gridWarp: v.gridWarp * f, swim: v.swim * f,
                   wobble: v.wobble * f, ghost: v.ghost * f };

      var evts = Phys.step(game.world, dt);
      if (evts.length) onEvents(evts);
      updateCrane();
      updateCat(dt);
      // the crane and the cat both count as "the table is busy":
      // a shot doesn't settle until every helper has finished meddling
      var moving = Phys.anyMoving(game.world) || !!game.craneAnim ||
                   !!(game.cat && game.cat.armed);
      if (wasMoving && !moving) settleShot();
      wasMoving = moving;

      // the goblin checks on you once in a while (avg ~35s)
      if (!game.goblin && Math.random() < dt / 35) {
        game.goblin = {
          x: RECT.x + 24 + Math.random() * (RECT.w - 48),
          y: RECT.y + RECT.h + 9,
          t0: tNow, until: tNow + 2.2 + Math.random() * 1.2,
        };
        SFX.giggle();
      }
      if (game.goblin && tNow > game.goblin.until + 0.5) game.goblin = null;
    }

    Render.frame(game, tNow);
    requestAnimationFrame(frame);
  }

  // test hook: lets the headless harness exercise level generation
  root.Game = { _test: { applyHelpers: applyHelpers, pocketSet: pocketSet,
                         RECT: RECT, BALL_R: BALL_R, HELPERS: HELPERS,
                         HELPER_MAX: HELPER_MAX,
                         state: function () { return game; } } };

  /* ── boot ────────────────────────────────────────────────────────────── */

  root.addEventListener("DOMContentLoaded", function () {
    var cv = document.getElementById("stage");
    Render.init(cv);
    cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); onDown(e); });
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", function () { pointer.down = false; game.aim.active = false; });
    // dev helpers (temporary): D = full-trajectory aim line, N = skip level
    root.addEventListener("keydown", function (e) {
      var k = e.key.toLowerCase();
      if (k === "d") {
        game.dev = !game.dev;
        if (!game.dev && game.state === "setup") closeSetup();
        say(game.dev ? "dev mode: ON (D path, N skip, M helpers)"
                     : "dev mode: off", Render.PAL.danger, 1900);
      } else if (k === "n" && game.state === "play") {
        audio();
        shot = null;
        say("dev skip", Render.PAL.danger, 1200);
        clearLevel();       // same path as a real clear: pays out, opens the shop
      } else if (k === "t") toggleGlass();
      else if (k === "c") toggleTrip();
      else if (k === "m" || k === "escape") {
        if (game.state === "setup") closeSetup(); else openSetup();
      }
    });
    game.run = { money: 0, levelIndex: 0, shots: 0, shotsFired: 0, items: {},
                 aimLen: 110, pocketBonus: 0, soberSips: 0, shotBonus: 0,
                 potBonus: 0, mercyUsed: false,
                 helpers: randomHelperSet(), helpersLocked: false };
    game.baseWarp = LEVELS[0].warp;
    requestAnimationFrame(frame);
  });
})(typeof window !== "undefined" ? window : globalThis);
