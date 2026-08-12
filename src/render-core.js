/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — render-core.js
   The canvas plumbing: a 400×225 offscreen buffer everything draws into with
   hard pixels, blitted to the display canvas with smoothing off (and, at
   higher drunk levels, with wobble, double vision and a chaser defocus).

   Text is queued and flushed AFTER the blit so it is never painted over and
   never wobbles — the HUD stays sober however drunk the room gets.

   The drawing layers live in render-table.js, render-ui.js and backdrop.js;
   they attach themselves to Render.layers and frame() drives them.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};
  var Cfg = LCB.Config;
  var BW = Cfg.BW, BH = Cfg.BH, PAL = Cfg.PAL;

  var canvas, dctx, buf, bctx;
  var scale = 2, offX = 0, offY = 0, dpr = 1, cssW = BW, cssH = BH;
  var buttons = [];
  var textQueue = [];

  /* ── setup & scaling ─────────────────────────────────────────────────── */

  function init(cv) {
    canvas = cv;
    dctx = cv.getContext("2d");
    buf = document.createElement("canvas");
    buf.width = BW; buf.height = BH;
    bctx = buf.getContext("2d");
    R.bctx = bctx;
    if (R.layers.initBackdrop) R.layers.initBackdrop();
    resize();
    root.addEventListener("resize", resize);
  }

  /**
   * Fit the buffer to the screen. Scaling is chosen in *device* pixels so
   * phone displays stay crisp: take the integer factor when it wastes little
   * (<20%), otherwise fall back to fractional so a landscape phone fills its
   * screen instead of showing a postage stamp. The context carries the DPR
   * transform, so every drawing call elsewhere works in CSS pixels.
   */
  function resize() {
    cssW = root.innerWidth; cssH = root.innerHeight;
    dpr = Math.min(root.devicePixelRatio || 1, 3);

    var sd = Math.min(cssW * dpr / BW, cssH * dpr / BH);
    var id = Math.floor(sd);
    var dev = (id >= 1 && id / sd > 0.8) ? id : sd;
    scale = dev / dpr;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.imageSmoothingEnabled = false;

    offX = Math.round((cssW - BW * scale) / 2 * dpr) / dpr;
    offY = Math.round((cssH - BH * scale) / 2 * dpr) / dpr;
    R.scale = scale;
  }

  /** client-space pointer → buffer coordinates. */
  function toBuffer(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - offX) / scale, y: (cy - r.top - offY) / scale };
  }

  /* ── pixel primitives (buffer space) ─────────────────────────────────── */

  function fill(x, y, w, h, c) { bctx.fillStyle = c; bctx.fillRect(x | 0, y | 0, w, h); }

  function pixCircle(cx, cy, r, c) {
    bctx.fillStyle = c;
    cx |= 0; cy |= 0;
    for (var dy = -r; dy <= r; dy++) {
      var w = Math.floor(Math.sqrt(r * r - dy * dy));
      bctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    }
  }

  function pixRing(cx, cy, r, c, dashT) {
    bctx.fillStyle = c;
    var n = Math.max(12, r * 6);
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + (dashT || 0);
      if (dashT !== undefined && (i % 6) > 3) continue;
      bctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }

  function alpha(a) { bctx.globalAlpha = a; }
  function dim(a) { bctx.fillStyle = "rgba(8,6,12," + a + ")"; bctx.fillRect(0, 0, BW, BH); }

  /* ── text & buttons (coords in buffer units, drawn on the sober layer) ── */

  function text(str, x, y, size, color, align, a) {
    textQueue.push({ s: str, x: x, y: y, sz: size, c: color || PAL.text,
                     a: align || "left", al: a === undefined ? 1 : a });
  }

  function flushText(game, t) {
    dctx.textBaseline = "top";
    var blur = game ? defocusPx(game, t) * 0.55 : 0;   // goes soft with the room
    dctx.filter = blur > 0.05 ? "blur(" + blur.toFixed(2) + "px)" : "none";
    for (var i = 0; i < textQueue.length; i++) {
      var q = textQueue[i];
      dctx.globalAlpha = q.al;
      dctx.fillStyle = q.c;
      dctx.font = Math.round(q.sz * scale) + 'px "Press Start 2P", monospace';
      dctx.textAlign = q.a;
      dctx.fillText(q.s, offX + q.x * scale, offY + q.y * scale);
    }
    dctx.globalAlpha = 1;
    dctx.filter = "none";
    textQueue = [];
  }

  function button(id, x, y, w, h, label, hot, size) {
    fill(x, y, w, h, hot ? PAL.cardHi : PAL.card);
    fill(x, y, w, 1, PAL.railLight); fill(x, y + h - 1, w, 1, PAL.railDark);
    fill(x, y, 1, h, PAL.railLight); fill(x + w - 1, y, 1, h, PAL.railDark);
    buttons.push({ id: id, x: x, y: y, w: w, h: h });
    text(label, x + w / 2, y + (h - (size || 7)) / 2 + 1, size || 7,
      hot ? PAL.accent : PAL.text, "center");
  }

  /** A tap target with no chrome of its own (panels, hidden gestures). */
  function hotspot(id, x, y, w, h) { buttons.push({ id: id, x: x, y: y, w: w, h: h }); }

  function hitButton(p) {
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b.id;
    }
    return null;
  }

  /* ── the chaser defocus ──────────────────────────────────────────────── */

  /** Blur radius in backing-store px, 0 when it is over. defocusT may sit in
      the future — the chaser message is given a head start before the blur. */
  function defocusPx(game, t) {
    if (!game.defocusT) return 0;
    var p = (t - game.defocusT) / (game.defocusDur || Cfg.DEFOCUS_TIME);
    if (p < 0 || p >= 1) return 0;
    return (1 - p) * (1 - p) * 3.2 * scale * dpr;
  }

  /* ── frame ───────────────────────────────────────────────────────────── */

  var WORLD_STATES = { play: 1, shop: 1, setup: 1, over: 1, win: 1 };

  function frame(game, t) {
    var L = R.layers;
    buttons = [];
    bctx.clearRect(0, 0, BW, BH);
    fill(0, 0, BW, BH, PAL.bg);
    if (L.backdrop) L.backdrop(t, game.glass ? 2.1 : 1);

    if (WORLD_STATES[game.state] && L.world) L.world(game, t);
    if (L.goblin) L.goblin(game, t);
    if (game.state === "play" && L.hud) L.hud(game, t);
    if (L.screen) L.screen(game, t);

    // blit, with whatever the night is doing to your eyes
    var vis = game.vis || (game.level ? game.level.visuals : { wobble: 0, ghost: 0 });
    var wob = game.state === "play" ? vis.wobble : 0;
    var wx = wob ? Math.sin(t * 1.1) * wob * scale : 0;
    var wy = wob ? Math.cos(t * 0.83) * wob * 0.6 * scale : 0;

    dctx.fillStyle = PAL.bg;
    dctx.fillRect(0, 0, cssW, cssH);
    if (vis.ghost && game.state === "play") {
      dctx.globalAlpha = 0.28 * Math.min(1, vis.ghost);
      dctx.drawImage(buf, offX + wx + Math.sin(t * 0.6) * 5 * scale,
                          offY + wy + Math.cos(t * 0.9) * 3 * scale,
                          BW * scale, BH * scale);
      dctx.globalAlpha = 1;
    }

    var parts = [];
    var blur = defocusPx(game, t);
    if (blur > 0) parts.push("blur(" + blur.toFixed(2) + "px)");
    if (game.trip) parts.push("hue-rotate(" + ((t * 9) % 360).toFixed(1) + "deg)");
    if (parts.length) dctx.filter = parts.join(" ");
    dctx.drawImage(buf, offX + wx, offY + wy, BW * scale, BH * scale);
    dctx.filter = "none";

    flushText(game, t);
  }

  var R = LCB.Render = {
    BW: BW, BH: BH, PAL: PAL, scale: scale, bctx: null,
    layers: {},              // filled in by backdrop.js / render-table.js / render-ui.js
    init: init,
    resize: resize,
    frame: frame,
    toBuffer: toBuffer,
    hitButton: hitButton,
    // primitives shared with the other render modules
    fill: fill, pixCircle: pixCircle, pixRing: pixRing,
    alpha: alpha, dim: dim,
    text: text, button: button, hotspot: hotspot,
    defocusPx: defocusPx,
  };
})(typeof window !== "undefined" ? window : globalThis);
