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
    chaser:  function () { beep(320, 0.35, 0.16, "sawtooth", -180); setTimeout(function () { beep(180, 0.25, 0.12, "triangle", -60); }, 180); },
    special: function () { [660, 880, 1100].forEach(function (f, i) { setTimeout(function () { beep(f, 0.09, 0.14, "square"); }, i * 70); }); },
    giggle:  function () { beep(900, 0.06, 0.08, "square", 300); setTimeout(function () { beep(1100, 0.06, 0.08, "square", 300); }, 90); },
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
    chasers: 0, vis: null, dev: false, goblin: null,
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
      shotBonus: 0, potBonus: 0,
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
    };

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

    if (def.portals) spawnPortals(world);

    game.world = world;
    game.levelStartT = tNow;
    shot = null;
    say(def.tag, null, 3200);
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
      else if (e.t === "pocket") {
        SFX.pocket();
        if (!shot) continue;
        if (e.b.color === "cue") shot.scratched = true;
        else if (e.b.color === "eight") shot.eightSunk = true;
        else {
          shot.potted.push(e.b.color);
          var cash = POT_CASH + game.run.potBonus;
          game.run.money += cash;
          if (e.b.special) applySpecial(e.b.special);
          else say("down the hatch! +$" + cash, Render.PAL.ok);
        }
      }
    }
  }

  /** Potted-special powers kick in the moment the ball drops. */
  function applySpecial(key) {
    SFX.special();
    say(SPECIALS[key].msg, Render.PAL.accent, 3000);
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
    else if (key === "portalBall") spawnPortals(game.world);
  }

  function settleShot() {
    var s = shot; shot = null;
    if (!s) return;

    if (game.world.railMouth > 0 && --game.world.railMouth === 0)
      say("the rails sober up", null, 2200);

    if (s.eightSunk) {
      if (colorsLeft() > 0) return bust("you sank the 8-ball too soon");
      if (s.scratched)      return bust("scratched on the 8-ball. brutal.");
      // level cleared
      game.run.money += EIGHT_CASH + CLEAR_CASH;
      if (game.run.levelIndex >= LEVELS.length - 1) {
        game.state = "win"; SFX.win();
      } else {
        openShop(); SFX.win();
      }
      return;
    }
    if (s.scratched) {
      game.run.money = Math.max(0, game.run.money - SCRATCH_COST);
      respawnCue();
      say("SCRATCH. -$" + SCRATCH_COST + " (hic)", Render.PAL.danger);
    }
    if (game.run.shots <= 0) {
      bust("tab ran dry — out of shots");
    }
  }

  function bust(reason) {
    game.endReason = reason;
    game.state = "over";
    SFX.lose();
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
    return game.state === "play" && !Phys.anyMoving(game.world) && !game.cue().sunk;
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

    // every few shots: chaser time. the world tilts a step further.
    var c2 = Math.floor(game.run.shotsFired / CHASER_EVERY);
    if (c2 > game.chasers) {
      game.chasers = c2;
      SFX.chaser();
      say("CHASER DOWNED (hic) — space tilts", Render.PAL.accent, 3200);
    }
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
      var moving = Phys.anyMoving(game.world);
      if (wasMoving && !moving) settleShot();
      wasMoving = moving;

      // the goblin checks on you now and then
      if (!game.goblin && Math.random() < dt / 13) {
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

  /* ── boot ────────────────────────────────────────────────────────────── */

  root.addEventListener("DOMContentLoaded", function () {
    var cv = document.getElementById("stage");
    Render.init(cv);
    cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); onDown(e); });
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", function () { pointer.down = false; game.aim.active = false; });
    // dev helper (temporary): D toggles the full-trajectory aim line
    root.addEventListener("keydown", function (e) {
      if (e.key === "d" || e.key === "D") {
        game.dev = !game.dev;
        say(game.dev ? "dev path: ON" : "dev path: off", Render.PAL.danger, 1600);
      }
    });
    game.run = { money: 0, levelIndex: 0, shots: 0, shotsFired: 0, items: {},
                 aimLen: 110, pocketBonus: 0, soberSips: 0, shotBonus: 0, potBonus: 0 };
    game.baseWarp = LEVELS[0].warp;
    requestAnimationFrame(frame);
  });
})(typeof window !== "undefined" ? window : globalThis);
