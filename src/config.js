/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — config.js
   Every tunable number and every piece of static data lives here. Nothing in
   this file executes game logic; it is the dial board. If you want to make
   the game easier, harder, longer or a different colour, start here.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};

  LCB.Config = {
    /* ── canvas ──────────────────────────────────────────────────────── */
    BW: 400, BH: 225,                 // low-res buffer the whole game draws into

    /* ── table ───────────────────────────────────────────────────────── */
    BALL_R: 5,
    RECT: { x: 26, y: 44, w: 348, h: 142 },
    RAIL: 10,
    COLOR_POOL: ["red", "yellow", "blue", "purple", "orange", "green"],

    /* ── economy ─────────────────────────────────────────────────────── */
    POT_CASH: 12, EIGHT_CASH: 30, CLEAR_CASH: 20, SCRATCH_COST: 10,
    SPECIAL_CASH: 25,

    /* ── the chaser ramp ─────────────────────────────────────────────────
       Each level starts nearly sober (DRUNK_BASE of its warp) and every
       CHASER_EVERY shots the player downs a chaser: +DRUNK_STEP drunker,
       physics and visuals together, capped at DRUNK_MAX. So the first shots
       teach the table honestly and the geometry closes in as the night goes.
       Chasers land BETWEEN turns and the message always leads the blur.    */
    CHASER_EVERY: 4,
    DRUNK_BASE: 0.1, DRUNK_STEP: 0.35, DRUNK_MAX: 1.3,
    CHASER_LEAD: 0.75,                // message shows this long before the blur
    DEFOCUS_TIME: 1.6,                // and the blur lasts this long

    /* ── shooting ────────────────────────────────────────────────────── */
    SHOT_MIN_V: 90, SHOT_MAX_V: 300,  // speed = MIN + power * MAX
    DRAG_FULL: 130,                   // px of pull-back for full power
    AIM_LEN: 110,                     // starting aim-line length
    AIM_LEN_DEV: 1600,                // dev mode: the whole truth
    RESTART_WINDOW: 2.5,              // seconds to confirm a restart

    /* ── helpers ─────────────────────────────────────────────────────── */
    HELPER_ALLOWANCE: [0, 1, 2],      // by level index; clamps past the end
    HELPER_MAX: 2,                    // hard ceiling, and the dev-menu cap
    BRIDGE_TILT: Math.PI / 6,         // 30° off the rail, so the mouth faces in
    BRIDGE_GAP: 24,                   // exit stops this short of the pocket
    CAT_NUDGE: 26, CAT_NUDGE_VAR: 22, // a tap, not a shot
    CAT_COMMIT: 52,                   // ...unless the ball is this close in

    /* ── ambience ────────────────────────────────────────────────────── */
    GOBLIN_EVERY: 35,                 // mean seconds between goblin visits
    CAT_EVERY: 40,
    YIN_EVERY: 30,

    /* ── palette ─────────────────────────────────────────────────────── */
    PAL: {
      bg: "#0d0a12",
      feltBase: "#1c5c3e", feltHill: "#2e7a52", feltWell: "#123f2b",
      grid: "#2a7a52", gridGlass: "#9fd8ff",
      railDark: "#4a2b17", rail: "#6b3f23", railLight: "#8a5530",
      pocket: "#07070c", pocketRim: "#c7a06a",
      text: "#f2ede4", dim: "#9a917f",
      accent: "#f2c230", danger: "#e23d3d", ok: "#3fbf5f",
      card: "#1a1522", cardHi: "#2a2136",
      chrome: "#c8d2d8", chromeDim: "#6d7a82",
    },

    BALL_COLORS: {
      cue:    { base: "#f2ede4", dark: "#b8ad97", light: "#ffffff" },
      red:    { base: "#e23d3d", dark: "#8f1f26", light: "#ff8a7a" },
      yellow: { base: "#f2c230", dark: "#a3761c", light: "#ffe89a" },
      blue:   { base: "#3d6de2", dark: "#22398f", light: "#8ab2ff" },
      purple: { base: "#a04ad6", dark: "#5c2585", light: "#d69aff" },
      orange: { base: "#f07f2e", dark: "#96431a", light: "#ffc08a" },
      green:  { base: "#3fbf5f", dark: "#1f6f38", light: "#9affb4" },
      eight:  { base: "#23232c", dark: "#0d0d13", light: "#4a4a5c" },
    },

    PORTAL_COLORS: ["#ff8a2a", "#37b6ff", "#c05fd6", "#3fbf5f", "#f2c230", "#ff5f8a"],

    /* ── the run ─────────────────────────────────────────────────────────
       specials: how many powered balls to hand out.
       visuals:  drunk rendering, all scaled by the live chaser factor.      */
    LEVELS: [
      { name: "HAPPY HOUR", tag: "two drinks in — space leans a little",
        colors: 3, bumps: 2, warp: 0.45, shots: 10, portals: false, specials: 1,
        visuals: { gridWarp: 0.35, swim: 0, wobble: 0, ghost: 0 } },
      { name: "DOUBLE SHOT", tag: "the felt has started to breathe",
        colors: 5, bumps: 3, warp: 0.7, shots: 12, portals: false, specials: 2,
        visuals: { gridWarp: 0.7, swim: 1.2, wobble: 0, ghost: 0 } },
      { name: "LAST CALL", tag: "there are two of every table",
        colors: 6, bumps: 4, warp: 0.95, shots: 14, portals: true, specials: 2,
        visuals: { gridWarp: 1.0, swim: 2.0, wobble: 2.4, ghost: 1 } },
    ],
  };

  /** Helpers allowed on the felt at a given level index. */
  LCB.Config.helperAllowance = function (idx) {
    var a = LCB.Config.HELPER_ALLOWANCE;
    return a[Math.min(idx, a.length - 1)];
  };

  LCB.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };

  /** Fisher-Yates, in place. */
  LCB.shuffle = function (a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
})(typeof window !== "undefined" ? window : globalThis);
