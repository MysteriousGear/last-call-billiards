/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — game.js
   The orchestrator, and nothing else. Run state, level assembly, the rules
   of a shot, input, and the main loop. Anything with its own subject matter
   lives in its own file:

     config.js    every tunable number and all static data
     geometry.js  the warp field
     physics.js   the simulation and the honest aim tracer
     table.js     pockets, rack, portals, respawns
     specials.js  powered balls
     helpers.js   flat patches, bridges, crane, cat, yin-yang
     shop.js      THE BAR
     render-*.js  drawing

   Rules are classic-adjacent 8-ball: pot the colors, then the 8-ball. Sink
   the 8 early and the bartender covers for you once a night; twice is a bust.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};
  var Cfg = LCB.Config, Geo = LCB.Geo, Phys = LCB.Phys, Render = LCB.Render;
  var Table = LCB.Table, Specials = LCB.Specials, Helpers = LCB.Helpers;
  var Shop = LCB.Shop, SFX = LCB.Audio;
  var RECT = Cfg.RECT, PAL = Cfg.PAL;

  /* ── state ───────────────────────────────────────────────────────────── */
  var game = {
    state: "title",                  // title | play | shop | setup | over | win
    world: null, level: Cfg.LEVELS[0], run: null,
    aim: { active: false, power: 0, dir: null, pull: null, trace: null },
    shopStock: [], hover: null,
    msg: "", msgUntil: 0, msgColor: null,
    levelStartT: 0, endReason: "", baseWarp: Cfg.LEVELS[0].warp,
    chasers: 0, vis: null, dev: false,
    defocusT: 0, defocusDur: Cfg.DEFOCUS_TIME, pendingChaser: false, busyUntil: 0,
    goblin: null, craneAnim: null, cat: null, yin: null,
    glass: false, trip: false, restartArm: 0,
    cue: function () { return Table.cueBall(game.world); },
  };

  var shot = null;   // { scratched, eightSunk, potted[] } while a shot resolves
  var tNow = 0;

  function say(m, color, ms) {
    game.msg = m;
    game.msgColor = color || null;
    game.msgUntil = performance.now() + (ms || 2600);
  }

  function freshRun() {
    return {
      money: 0, levelIndex: 0, shots: 0, shotsFired: 0,
      items: { bounceReader: 1 }, aimLen: Cfg.AIM_LEN, pocketBonus: 0, soberSips: 0,
      shotBonus: 0, potBonus: 0, mercyUsed: false,
      helpers: Helpers.randomSet(Cfg.helperAllowance(0)), helpersLocked: false,
    };
  }

  function newRun() {
    game.run = freshRun();
    buildLevel(0);
    game.state = "play";
  }

  /** DRUNK_BASE → DRUNK_MAX: how much of the level's warp is live right now. */
  function drunkF() {
    return Math.min(Cfg.DRUNK_MAX, Cfg.DRUNK_BASE + Cfg.DRUNK_STEP * game.chasers);
  }

  /* ── level assembly ──────────────────────────────────────────────────── */

  function buildLevel(idx) {
    var def = Cfg.LEVELS[idx];
    game.level = def;
    game.run.levelIndex = idx;
    game.run.shots = def.shots + game.run.shotBonus;
    game.baseWarp = def.warp * Math.pow(0.7, game.run.soberSips);
    game.run.soberSips = 0;          // a sip is spent on the level it precedes
    game.chasers = 0;
    game.run.shotsFired = 0;
    game.pendingChaser = false;
    game.busyUntil = 0;
    game.defocusT = 0;
    game.craneAnim = null;
    game.cat = null;
    game.yin = null;

    var world = {
      field: Geo.randomField(def.bumps, RECT, game.baseWarp * Cfg.DRUNK_BASE),
      rect: RECT,
      balls: [],
      pockets: Table.pocketSet(game.run.pocketBonus),
      portals: [],
      zones: [],
      railMouth: 0,
      crane: null, craneUsed: false,
      catAllowed: false, catDone: false,
      yinAllowed: false, yinDone: false,
    };

    Table.rack(world, def.colors);
    Specials.assign(world, idx, def.specials || 0);

    // Helpers last: they need the final ball positions to route around. The
    // set is rolled to this level's allowance until the player overrides it
    // in the dev TABLE SETUP menu, after which their choice sticks.
    if (!game.run.helpersLocked)
      game.run.helpers = Helpers.randomSet(Cfg.helperAllowance(idx));
    Helpers.apply(world, game.run.helpers);

    if (def.portals) Table.spawnPortals(world);

    game.world = world;
    game.levelStartT = tNow;
    shot = null;
    say(def.tag, null, 3200);
  }

  /* ── the bridge handed to helpers and specials ───────────────────────── */

  var ctx = {
    game: game, PAL: PAL, sfx: SFX,
    get world() { return game.world; },
    get run() { return game.run; },
    get table() { return Table; },
    now: function () { return tNow; },
    say: say,
    pot: function (b) { potBall(b); },
    shotOpen: function () { return shot !== null; },
    beginShot: function () {
      if (!shot) shot = { scratched: false, eightSunk: false, potted: [] };
    },
  };

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

  /** Bookkeeping for any ball that goes down — pocket, rail, or crane. */
  function potBall(b) {
    if (b.color === "cue") { if (shot) shot.scratched = true; return; }
    if (b.color === "eight") { if (shot) shot.eightSunk = true; return; }
    if (shot) shot.potted.push(b.color);
    var cash = Cfg.POT_CASH + game.run.potBonus;
    game.run.money += cash;
    if (b.special) {
      SFX.special();
      say(Specials.apply(b.special, ctx), PAL.accent, 3000);
    } else {
      say("down the hatch! +$" + cash, PAL.ok);
    }
  }

  function settleShot() {
    var s = shot; shot = null;
    if (!s) return;

    if (game.world.railMouth > 0 && --game.world.railMouth === 0)
      say("the rails sober up", null, 2200);

    if (s.eightSunk && Table.colorsLeft(game.world) === 0) {
      if (s.scratched) return bust("scratched on the 8-ball. brutal.");
      return clearLevel();
    }
    if (s.eightSunk) {
      // 8-ball down too early. The bartender covers for you — once per night.
      if (game.run.mercyUsed) return bust("the 8-ball again? no more favors.");
      game.run.mercyUsed = true;
      Table.reviveEight(game.world);
      SFX.mercy();
      say("the bartender fishes out the 8-ball. ONE time.", PAL.accent, 4200);
    }
    if (s.scratched) {
      game.run.money = Math.max(0, game.run.money - Cfg.SCRATCH_COST);
      Table.respawnCue(game.world);
      say("SCRATCH. -$" + Cfg.SCRATCH_COST + " (hic)", PAL.danger);
    }
    if (game.run.shots <= 0) return bust("tab ran dry — out of shots");
    maybeChaser();
  }

  function clearLevel() {
    game.run.money += Cfg.EIGHT_CASH + Cfg.CLEAR_CASH;
    SFX.win();
    if (game.run.levelIndex >= Cfg.LEVELS.length - 1) game.state = "win";
    else { game.shopStock = Shop.stock(game.run); game.state = "shop"; }
  }

  function bust(reason) {
    game.endReason = reason;
    game.state = "over";
    SFX.lose();
  }

  /* ── the chaser ──────────────────────────────────────────────────────── */

  /** Chasers land BETWEEN turns: the shot you aimed always plays out at the
      drunkenness you aimed it at. */
  function maybeChaser() {
    var c = Math.floor(game.run.shotsFired / Cfg.CHASER_EVERY);
    if (c <= game.chasers || drunkF() >= Cfg.DRUNK_MAX) return;
    game.chasers = c;
    game.pendingChaser = true;
  }

  /** Hold it until whatever the table was telling the player has had its say —
      blurring over an unread message just reads as a glitch. Then the message
      leads and the blur follows CHASER_LEAD later. */
  function maybeFireChaser() {
    if (!game.pendingChaser) return;
    if (Phys.anyMoving(game.world) || Helpers.busy(game)) return;
    if (performance.now() < game.msgUntil) return;

    game.pendingChaser = false;
    SFX.chaser();
    say("CHASER DOWNED (hic) — space tilts", PAL.accent, 3400);
    game.defocusT = tNow + Cfg.CHASER_LEAD;
    game.busyUntil = tNow + Cfg.CHASER_LEAD + Cfg.DEFOCUS_TIME;
  }

  function chaserBusy() { return game.pendingChaser || tNow < game.busyUntil; }

  /* ── input ───────────────────────────────────────────────────────────── */

  var pointer = { down: false, btn: null };

  function canAim() {
    return game.state === "play" && !Phys.anyMoving(game.world) &&
           !game.cue().sunk && !Helpers.busy(game) && !chaserBusy();
  }

  function updateAim(p) {
    var c = game.cue();
    var dx = p.x - c.x, dy = p.y - c.y;
    var d = Math.hypot(dx, dy);
    if (d < 6) { game.aim.dir = null; game.aim.trace = null; game.aim.power = 0; return; }
    // Pull back to shoot forward, like a real cue: dragging away from the
    // target keeps the finger and the stick off the line you're reading.
    game.aim.dir = { x: -dx / d, y: -dy / d };
    game.aim.pull = { x: dx / d, y: dy / d };
    game.aim.power = LCB.clamp((d - 12) / Cfg.DRAG_FULL, 0, 1);
    var reach = game.dev ? Cfg.AIM_LEN_DEV : game.run.aimLen;
    game.aim.trace = Phys.tracePath(game.world, c.x, c.y,
      game.aim.dir.x, game.aim.dir.y, reach, Cfg.BALL_R);
  }

  function shoot() {
    var a = game.aim;
    if (!a.dir || a.power < 0.05) return;
    var c = game.cue();
    var v = Cfg.SHOT_MIN_V + a.power * Cfg.SHOT_MAX_V;
    c.vx = a.dir.x * v; c.vy = a.dir.y * v;
    game.run.shots--;
    game.run.shotsFired++;
    shot = { scratched: false, eightSunk: false, potted: [] };
    SFX.shoot();
  }

  function onDown(e) {
    SFX.unlock();
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
      if (canAim()) updateAim(p); else game.aim.active = false;
    }
  }

  function onUp(e) {
    var p = Render.toBuffer(e.clientX, e.clientY);
    if (pointer.btn) {
      if (Render.hitButton(p) === pointer.btn) click(pointer.btn);
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
    else if (id === "next" && game.state === "shop") {
      buildLevel(game.run.levelIndex + 1);
      game.state = "play";
    }
    else if (id === "again" && (game.state === "over" || game.state === "win")) newRun();
    else if (id.indexOf("item") === 0 && game.state === "shop") {
      if (Shop.buy(game.run, game.shopStock[+id.slice(4)])) SFX.buy();
      else SFX.nope();
    }
    else if (id === "glass") toggleGlass();
    else if (id === "trip") toggleTrip();
    else if (id === "restart") armRestart();
    else if (id === "devtap") devTap();
    else if (id === "setup") openSetup();
    else if (id === "setupDone") closeSetup();
    else if (id === "setupRoll") {     // same helpers, new places on the felt
      Helpers.apply(game.world, game.run.helpers);
      SFX.buy();
    }
    else if (id.indexOf("help") === 0) toggleHelper(Helpers.list[+id.slice(4)].key);
  }

  /* ── toggles, dev tools, restart ─────────────────────────────────────── */

  function openSetup() {
    if (game.state !== "play" || !game.dev) return;   // dev tool only
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
    else if (set.length >= Cfg.HELPER_MAX) { SFX.nope(); return; }
    else set.push(key);
    game.run.helpers = set;
    game.run.helpersLocked = true;
    Helpers.apply(game.world, set);
    SFX.buy();
  }

  /** Restart takes two taps — losing a run to a stray thumb would be rotten. */
  function armRestart() {
    if (tNow < game.restartArm + Cfg.RESTART_WINDOW) {
      game.restartArm = 0;
      SFX.buy();
      newRun();
      return;
    }
    game.restartArm = tNow;
    SFX.nope();
    say("tap again to restart the night", PAL.danger, Cfg.RESTART_WINDOW * 1000);
  }

  function toggleDev() {
    game.dev = !game.dev;
    if (!game.dev && game.state === "setup") closeSetup();
    say(game.dev ? "dev mode: ON (D path, N skip, M helpers)" : "dev mode: off",
      PAL.danger, 1900);
  }

  /** Phones have no keyboard, so five taps on the level label do it. */
  var devTaps = 0, devTapT = 0;
  function devTap() {
    if (tNow - devTapT > 3) devTaps = 0;
    devTapT = tNow;
    devTaps++;
    if (devTaps >= 5) { devTaps = 0; toggleDev(); }
    else if (devTaps >= 3) say((5 - devTaps) + " more...", PAL.dim, 1400);
  }

  function toggleGlass() {
    game.glass = !game.glass;
    say(game.glass ? "the felt goes glass" : "the felt comes back", null, 1600);
  }
  function toggleTrip() {
    game.trip = !game.trip;
    say(game.trip ? "colors start to wander..." : "colors settle down", null, 1600);
  }

  function onKey(e) {
    var k = e.key.toLowerCase();
    if (k === "d") { SFX.unlock(); toggleDev(); }
    // level skip and the helper menu are dev tools: dead keys without it
    else if (k === "n" && game.dev && game.state === "play") {
      SFX.unlock();
      shot = null;
      say("dev skip", PAL.danger, 1200);
      clearLevel();          // the normal clear path: pays out, opens the shop
    }
    else if ((k === "m" || k === "escape") && game.dev) {
      if (game.state === "setup") closeSetup(); else openSetup();
    }
    else if (k === "t") toggleGlass();
    else if (k === "c") toggleTrip();
  }

  /* ── main loop ───────────────────────────────────────────────────────── */

  var lastMs = performance.now();
  var wasBusy = false;

  function frame(ms) {
    var dt = Math.min((ms - lastMs) / 1000, 0.1);
    lastMs = ms;
    tNow = ms / 1000;

    if (game.state === "play") {
      // the chaser ramp drives the physics and the rendering from one number
      var f = drunkF();
      game.world.field.scale = game.baseWarp * f;
      var v = game.level.visuals;
      game.vis = { gridWarp: v.gridWarp * f, swim: v.swim * f,
                   wobble: v.wobble * f, ghost: v.ghost * f };

      var evts = Phys.step(game.world, dt);
      if (evts.length) onEvents(evts);

      Helpers.update(ctx, dt);
      maybeFireChaser();

      // a shot isn't over until the balls AND every helper have settled
      var busy = Phys.anyMoving(game.world) || Helpers.busy(game);
      if (wasBusy && !busy) settleShot();
      wasBusy = busy;

      updateGoblin(dt);
    }

    Render.frame(game, tNow);
    root.requestAnimationFrame(frame);
  }

  function updateGoblin(dt) {
    if (!game.goblin && Math.random() < dt / Cfg.GOBLIN_EVERY) {
      game.goblin = {
        x: RECT.x + 24 + Math.random() * (RECT.w - 48),
        y: RECT.y + RECT.h + 9,
        t0: tNow, until: tNow + 2.2 + Math.random() * 1.2,
      };
      SFX.giggle();
    }
    if (game.goblin && tNow > game.goblin.until + 0.5) game.goblin = null;
  }

  /* ── boot ────────────────────────────────────────────────────────────── */

  function boot() {
    var cv = document.getElementById("stage");
    Render.init(cv);
    cv.addEventListener("pointerdown", function (e) {
      cv.setPointerCapture(e.pointerId); onDown(e);
    });
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", function () {
      pointer.down = false; game.aim.active = false;
    });
    root.addEventListener("keydown", onKey);

    game.run = freshRun();          // a table to look at behind the title card
    buildLevel(0);
    game.state = "title";
    root.requestAnimationFrame(frame);
  }

  // test hook: lets the headless harness drive and inspect a real game
  LCB.Game = { boot: boot, state: function () { return game; } };

  root.addEventListener("DOMContentLoaded", boot);
})(typeof window !== "undefined" ? window : globalThis);
