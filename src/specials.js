/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — specials.js
   Powered balls. Each entry owns everything about one power: what it is
   called, how it is drawn on the ball, what it says when it drops, and what
   it does. To add a power, add an entry here and list its key in a tier —
   nothing else in the codebase needs to change.

   `apply(ctx)` receives { game, world, run, table } and fires the moment the
   ball is potted.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};
  var Cfg = LCB.Config;
  var RECT = Cfg.RECT;

  var LIST = [
    {
      key: "cash",
      msg: "tip jar ball! +$" + Cfg.SPECIAL_CASH,
      tint: "#ffe89a",
      glyph: function (d, x, y) { d.fill(x, y - 1, 1, 3, "#1a1a20"); d.fill(x - 1, y, 3, 1, "#ffe89a"); },
      apply: function (ctx) { ctx.run.money += Cfg.SPECIAL_CASH; },
    },
    {
      key: "extraShot",
      msg: "one on the house! +1 shot",
      tint: "#9affb4",
      glyph: function (d, x, y) { d.fill(x, y - 1, 1, 3, "#0d3f1f"); d.fill(x - 1, y, 3, 1, "#0d3f1f"); },
      apply: function (ctx) { ctx.run.shots += 1; },
    },
    {
      key: "midPocket",
      msg: "the floor opens. new pocket!",
      tint: "#c7a06a",
      glyph: function (d, x, y) { d.fill(x - 1, y - 1, 3, 3, "#07070c"); d.fill(x, y - 1, 1, 1, "#c7a06a"); },
      apply: function (ctx) {
        ctx.world.pockets.push({
          x: RECT.x + RECT.w * (0.35 + Math.random() * 0.3),
          y: RECT.y + RECT.h * (0.3 + Math.random() * 0.4),
          r: 9,
        });
      },
    },
    {
      key: "railMouth",
      msg: "THE RAILS ARE THIRSTY (2 shots)",
      tint: "#ff8a7a",
      glyph: function (d, x, y) { d.fill(x - 1, y - 1, 3, 1, "#07070c"); d.fill(x - 1, y + 1, 3, 1, "#07070c"); },
      // 3 because the activating shot's own settle decrements it → 2 full shots
      apply: function (ctx) { ctx.world.railMouth = 3; },
    },
    {
      key: "portalBall",
      msg: "portals uncorked. wait. what.",
      altMsg: "ANOTHER portal. the cycle rewires.",
      tint: "#37b6ff",
      glyph: function (d, x, y) { d.fill(x - 1, y, 1, 1, "#ff8a2a"); d.fill(x + 1, y, 1, 1, "#37b6ff"); },
      // potting a second one stacks: portals form an i → i+1 cycle
      altWhen: function (ctx) { return ctx.world.portals.length > 0; },
      apply: function (ctx) {
        if (ctx.world.portals.length) LCB.Table.addPortal(ctx.world);
        else LCB.Table.spawnPortals(ctx.world);
      },
    },
  ];

  var BY_KEY = {};
  LIST.forEach(function (s) { BY_KEY[s.key] = s; });

  // which powers can appear per level index (simple → weird)
  var TIERS = [
    ["cash", "extraShot"],
    ["cash", "extraShot", "midPocket", "portalBall"],
    ["cash", "extraShot", "midPocket", "portalBall", "railMouth"],
  ];

  LCB.Specials = {
    list: LIST,
    byKey: BY_KEY,
    tiers: TIERS,

    /** Keys available on a given level, as a fresh mutable array. */
    tierFor: function (idx) {
      return TIERS[Math.min(idx, TIERS.length - 1)].slice();
    },

    /** Hand powers out to random color balls. */
    assign: function (world, idx, count) {
      var tier = LCB.Specials.tierFor(idx);
      var pool = world.balls.filter(function (b) {
        return b.color !== "cue" && b.color !== "eight";
      });
      for (var i = 0; i < count && pool.length && tier.length; i++) {
        var bi = Math.floor(Math.random() * pool.length);
        var si = Math.floor(Math.random() * tier.length);
        pool.splice(bi, 1)[0].special = tier.splice(si, 1)[0];
      }
    },

    /** Fire a power. Returns the message to show, or null.
        The message is chosen BEFORE the effect runs — a portal ball that
        creates the first pair would otherwise report itself as a second. */
    apply: function (key, ctx) {
      var s = BY_KEY[key];
      if (!s) return null;
      var msg = (s.altWhen && s.altMsg && s.altWhen(ctx)) ? s.altMsg : s.msg;
      s.apply(ctx);
      return msg;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
