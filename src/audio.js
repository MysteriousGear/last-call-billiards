/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — audio.js
   A whole bar's worth of noise from one oscillator at a time. No samples, no
   files: every sound is a short square/triangle/saw blip, sometimes a few in
   a row. Call Audio.unlock() from a user gesture before anything will sound.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};

  var AC = null;

  function unlock() {
    if (!AC) {
      try { AC = new (root.AudioContext || root.webkitAudioContext)(); }
      catch (e) { AC = null; }
    }
    if (AC && AC.state === "suspended") AC.resume();
    return AC;
  }

  /** One blip. `slide` bends the pitch by that many Hz over its lifetime. */
  function beep(freq, dur, vol, type, slide) {
    if (!AC) return;
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, AC.currentTime);
    if (slide)
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), AC.currentTime + dur);
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  }

  /** Play a list of [freq, dur, vol, type, slide] steps, `gap` ms apart. */
  function seq(steps, gap) {
    steps.forEach(function (s, i) {
      setTimeout(function () { beep(s[0], s[1], s[2], s[3], s[4]); }, i * gap);
    });
  }

  LCB.Audio = {
    unlock: unlock,
    beep: beep,

    clack:   function (v) { beep(180 + Math.min(220, v), 0.06, 0.16, "square"); },
    cushion: function () { beep(95, 0.07, 0.12, "triangle"); },
    pocket:  function () { beep(300, 0.16, 0.18, "square", 260); },
    portal:  function () { beep(500, 0.25, 0.14, "sawtooth", -320); },
    shoot:   function () { beep(140, 0.08, 0.14, "triangle", 120); },
    nope:    function () { beep(120, 0.15, 0.14, "sawtooth", -40); },
    lose:    function () { beep(220, 0.4, 0.16, "sawtooth", -160); },

    // three gulps, the glass hits the bar, the room starts to lean
    chaser: function () {
      seq([[520, 0.08, 0.18, "triangle", -80],
           [430, 0.08, 0.18, "triangle", -80],
           [340, 0.08, 0.18, "triangle", -80]], 120);
      setTimeout(function () { beep(85, 0.28, 0.22, "sawtooth", -25); }, 400);
      setTimeout(function () { beep(260, 0.55, 0.13, "sawtooth", -170); }, 470);
    },
    special: function () { seq([[660, .09, .14, "square"], [880, .09, .14, "square"], [1100, .09, .14, "square"]], 70); },
    giggle:  function () { seq([[900, .06, .08, "square", 300], [1100, .06, .08, "square", 300]], 90); },
    mercy:   function () { seq([[360, .12, .14, "triangle", 160], [560, .18, .14, "triangle", 120]], 130); },
    crane:   function () { seq([[70, .3, .16, "square", 40], [110, .5, .1, "sawtooth", 90]], 250); },
    meow:    function () { seq([[760, .16, .12, "triangle", -260], [680, .2, .1, "triangle", -300]], 200); },
    yin:     function () { seq([[392, .22, .1, "sine"], [523, .22, .1, "sine"], [659, .22, .1, "sine"], [523, .22, .1, "sine"], [392, .22, .1, "sine"]], 170); },
    buy:     function () { seq([[520, .09, .14, "square"], [780, .12, .14, "square"]], 80); },
    win:     function () { seq([[440, .14, .15, "square"], [550, .14, .15, "square"], [660, .14, .15, "square"], [880, .14, .15, "square"]], 110); },
  };
})(typeof window !== "undefined" ? window : globalThis);
