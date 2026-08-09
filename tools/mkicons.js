/* Generate Last Call Billiards PWA icons: a pixel 8-ball on a warped-felt
   backdrop, drawn at 32x32 and upscaled by integer factors. Pure Node —
   minimal PNG encoder (zlib is built in). */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "icons");

/* ── minimal PNG writer ──────────────────────────────────────────────── */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── the 32x32 artwork ───────────────────────────────────────────────── */
const S = 32;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16),
                  parseInt(h.slice(5, 7), 16), 255];
const C = {
  bg: hex("#1a1030"), bg2: hex("#2a1a48"),
  felt: hex("#1c5c3e"), feltHi: hex("#2e7a52"),
  ball: hex("#23232c"), ballDark: hex("#0d0d13"), ballHi: hex("#4a4a5c"),
  white: hex("#f2ede4"), star: hex("#cfd8ff"), gold: hex("#f2c230"),
};

// 3x5 "8"
const EIGHT = ["111", "101", "111", "101", "111"];

function art() {
  const px = [];
  for (let y = 0; y < S; y++) {
    px[y] = [];
    for (let x = 0; x < S; x++) {
      // backdrop: dark purple with a soft diagonal nebula
      const n = Math.sin(x * 0.25 + y * 0.18) * 0.5 + 0.5;
      px[y][x] = n > 0.72 ? C.bg2 : C.bg;
    }
  }
  // a few stars
  [[3, 4], [27, 6], [6, 26], [29, 22], [14, 3], [24, 29]].forEach(([x, y]) => {
    px[y][x] = C.star;
  });
  // curved felt band under the ball — the warped table
  for (let x = 0; x < S; x++) {
    const yb = Math.round(25 + Math.sin(x * 0.2) * 2.2);
    for (let y = yb; y < S; y++) px[y][x] = y === yb ? C.feltHi : C.felt;
  }
  // the 8-ball
  const cx = 15.5, cy = 14.5, R = 11;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > R) continue;
      px[y][x] = d > R - 1.6 ? C.ballDark : C.ball;
      if (Math.hypot(x - (cx - 4), y - (cy - 4)) < 2.6) px[y][x] = C.ballHi;
    }
  }
  px[Math.round(cy - 5)][Math.round(cx - 4)] = C.white; // specular
  // white disc + "8"
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (Math.hypot(x - cx, y - cy) < 5.2) px[y][x] = C.white;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 3; c++)
      if (EIGHT[r][c] === "1") px[Math.round(cy) - 2 + r][Math.round(cx) - 1 + c] = C.ballDark;
  // gold rim glint bottom-right
  px[Math.round(cy + 8)][Math.round(cx + 6)] = C.gold;
  return px;
}

function render(px, size) {
  const f = size / S;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = px[Math.floor(y / f)][Math.floor(x / f)];
      const i = (y * size + x) * 4;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
    }
  return png(size, size, buf);
}

fs.mkdirSync(OUT, { recursive: true });
const px = art();
for (const size of [32, 192, 512]) {
  const file = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, render(px, size));
  console.log("wrote", file, fs.statSync(file).size, "bytes");
}
