/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — render-ui.js
   The HUD and every full-screen panel: title, THE BAR, TABLE SETUP, and the
   end cards. All of it draws through Render's primitives, and all of its text
   lands on the sober layer, so the interface stays readable however drunk the
   table below it gets.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};
  var Cfg = LCB.Config, R = LCB.Render;
  var PAL = Cfg.PAL, BALLS = Cfg.BALL_COLORS, BW = Cfg.BW, BH = Cfg.BH;

  /* ── HUD ─────────────────────────────────────────────────────────────── */

  R.layers.hud = function (game, t) {
    var run = game.run, lv = game.level, c = R.bctx;

    // toggles along the bottom edge, clear of the power bar
    var armed = t < game.restartArm + Cfg.RESTART_WINDOW;
    R.button("glass", 4, 212, 46, 11, "GLASS", game.glass || game.hover === "glass", 5);
    R.button("restart", 54, 212, 52, 11, armed ? "SURE?" : "RESTART",
      armed || game.hover === "restart", 5);
    R.button("trip", BW - 50, 212, 46, 11, "TRIP", game.trip || game.hover === "trip", 5);
    // helper picking is a dev tool, so it only shows up in dev mode
    if (game.dev)
      R.button("setup", BW - 106, 212, 52, 11, "HELPERS", game.hover === "setup", 5);
    // hidden five-tap on the level label: the only way into dev mode on a phone
    R.hotspot("devtap", 14, 4, 58, 17);

    R.text("LVL " + (run.levelIndex + 1) + "/" + Cfg.LEVELS.length, 18, 8, 7, PAL.dim);
    R.text(lv.name, 74, 8, 7, PAL.accent);
    R.text("$" + run.money, 382, 8, 7, PAL.ok, "right");
    R.text("SHOTS " + run.shots, 382, 19, 7, run.shots <= 2 ? PAL.danger : PAL.text, "right");

    var bx = 18, i;                                          // balls still up
    for (i = 0; i < game.world.balls.length; i++) {
      var b = game.world.balls[i];
      if (b.color === "cue" || b.sunk) continue;
      var col = BALLS[b.color] || BALLS.red;
      R.fill(bx, 21, 4, 4, col.base);
      R.fill(bx, 21, 4, 1, col.light);
      bx += 7;
    }

    var mugs = game.chasers || 0;                            // chasers downed
    var mx = BW / 2 - mugs * 5;
    for (i = 0; i < mugs; i++) {
      R.fill(mx + i * 10, 8, 5, 7, "#f2c230");
      R.fill(mx + i * 10, 8, 5, 2, "#fff6d8");
      R.fill(mx + i * 10 + 5, 10, 2, 3, "#c7a06a");
    }
    if (game.dev) R.text("DEV PATH", BW / 2, 26, 5, PAL.danger, "center");

    if (game.msg && game.msgUntil > performance.now())
      R.text(game.msg, BW / 2, 207, 7, game.msgColor || PAL.text, "center");

    if (game.aim && game.aim.active && game.aim.power > 0.02) {
      var w = 120, x0 = BW / 2 - w / 2, y0 = 216;
      R.fill(x0 - 1, y0 - 1, w + 2, 7, PAL.card);
      R.fill(x0, y0, Math.round(w * game.aim.power), 5,
        game.aim.power > 0.85 ? PAL.danger : PAL.accent);
    }

    // level banner, fading out over the first couple of seconds
    var age = t - game.levelStartT;
    if (age < 2.4) {
      var a = Math.min(1, (2.4 - age) / 0.5);
      R.text(lv.name, BW / 2, 92, 12, PAL.accent, "center", a);
      R.text(lv.tag, BW / 2, 112, 6, PAL.dim, "center", a);
    }
  };

  /* ── screens ─────────────────────────────────────────────────────────── */

  function drawTitle(game, t) {
    var bob = Math.sin(t * 1.4) * 3;
    R.text("LAST CALL", BW / 2, 46 + bob, 16, PAL.accent, "center");
    R.text("BILLIARDS", BW / 2, 68 + bob, 16, PAL.text, "center");
    R.text("space is drunk. you're fine.", BW / 2, 100, 6, PAL.dim, "center");
    R.text("pot the colors, then the 8-ball", BW / 2, 122, 6, PAL.dim, "center");
    R.text("straight lines not included", BW / 2, 132, 6, PAL.dim, "center");
    R.button("start", BW / 2 - 60, 156, 120, 20, "RACK UP", game.hover === "start");
    R.text("pull back from the cue ball and let go", BW / 2, 196, 5, PAL.dim, "center");
  }

  function drawShop(game) {
    R.dim(0.82);
    R.text("THE BAR", BW / 2, 14, 11, PAL.accent, "center");
    R.text("level " + game.run.levelIndex + " cleared  ·  $" + game.run.money,
      BW / 2, 32, 6, PAL.dim, "center");

    var items = game.shopStock;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var x = 22 + (i % 2) * 182, y = 48 + Math.floor(i / 2) * 56;
      var afford = !it.sold && game.run.money >= it.price;
      R.fill(x, y, 174, 50, game.hover === "item" + i && afford ? PAL.cardHi : PAL.card);
      R.fill(x, y, 174, 1, PAL.railLight);
      R.fill(x, y + 49, 174, 1, PAL.railDark);
      R.hotspot("item" + i, x, y, 174, 50);
      R.text(it.name, x + 6, y + 6, 6, it.sold ? PAL.dim : PAL.accent);
      R.text(it.desc1, x + 6, y + 20, 5, PAL.text);
      R.text(it.desc2 || "", x + 6, y + 29, 5, PAL.text);
      R.text(it.sold ? "SOLD" : "$" + it.price, x + 168, y + 6, 6,
        it.sold ? PAL.dim : (afford ? PAL.ok : PAL.danger), "right");
    }
    R.button("next", BW / 2 - 70, 164, 140, 18, "NEXT LEVEL >", game.hover === "next");
    R.text("stumble on when ready", BW / 2, 190, 5, PAL.dim, "center");
  }

  /** TABLE SETUP (dev only): pick which helpers sit on the felt, live. */
  function drawSetup(game) {
    R.dim(0.66);
    var list = LCB.Helpers.list;
    var max = Cfg.HELPER_MAX;
    var allow = Cfg.helperAllowance(game.run.levelIndex);
    var chosen = game.run.helpers || [];

    R.text("TABLE SETUP", BW / 2, 10, 10, PAL.accent, "center");
    R.text("dev tool  ·  " + chosen.length + "/" + max + " picked  ·  level " +
           (game.run.levelIndex + 1) + " normally allows " + allow +
           (chosen.length > allow ? "  (OVERRIDDEN)" : ""),
      BW / 2, 28, 5, chosen.length > allow ? PAL.danger : PAL.dim, "center");

    // one full-width row per helper — the list grows, so keep it a column
    var X = 24, W = BW - 48, ROW = 24, PITCH = 27, TOP = 42;
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      var on = chosen.indexOf(h.key) >= 0;
      var y = TOP + i * PITCH;
      var hot = game.hover === "help" + i;
      R.fill(X, y, W, ROW, on ? PAL.cardHi : PAL.card);
      R.fill(X, y, W, 1, on ? PAL.ok : PAL.railLight);
      R.fill(X, y + ROW - 1, W, 1, PAL.railDark);
      R.fill(X, y, 1, ROW, on ? PAL.ok : PAL.railLight);
      R.fill(X + W - 1, y, 1, ROW, PAL.railDark);
      R.hotspot("help" + i, X, y, W, ROW);

      R.fill(X + 7, y + 7, 10, 10, "#0b0f14");               // checkbox
      R.pixRing(X + 12, y + 12, 4, on ? PAL.ok : PAL.dim);
      if (on) { R.fill(X + 11, y + 13, 2, 2, PAL.ok); R.fill(X + 13, y + 10, 2, 3, PAL.ok); }

      R.text(h.name, X + 24, y + 9, 6, on ? PAL.ok : (hot ? PAL.accent : PAL.text));
      R.text(h.desc, X + 122, y + 10, 5, PAL.dim);
    }

    R.button("setupRoll", 24, 188, 100, 15, "REROLL SPOTS", game.hover === "setupRoll", 5);
    R.button("setupDone", BW - 124, 188, 100, 15, "BACK TO PLAY", game.hover === "setupDone", 5);
    R.text("changes apply immediately  ·  M or ESC to close", BW / 2, 209, 5, PAL.dim, "center");
  }

  function drawEnd(game) {
    R.dim(0.82);
    if (game.state === "win") {
      R.text("YOU CLOSED", BW / 2, 52, 14, PAL.accent, "center");
      R.text("THE BAR", BW / 2, 72, 14, PAL.accent, "center");
      R.text("all three tables, potted clean", BW / 2, 98, 6, PAL.text, "center");
      R.text("final tab: $" + game.run.money, BW / 2, 110, 6, PAL.ok, "center");
    } else {
      R.text("BUSTED", BW / 2, 58, 16, PAL.danger, "center");
      R.text(game.endReason || "", BW / 2, 88, 6, PAL.text, "center");
      R.text("the room was spinning anyway", BW / 2, 100, 6, PAL.dim, "center");
    }
    R.button("again", BW / 2 - 60, 140, 120, 20, "ONE MORE", game.hover === "again");
  }

  R.layers.screen = function (game, t) {
    if (game.state === "title") drawTitle(game, t);
    else if (game.state === "shop") drawShop(game);
    else if (game.state === "setup") drawSetup(game);
    else if (game.state === "over" || game.state === "win") drawEnd(game);
  };
})(typeof window !== "undefined" ? window : globalThis);
