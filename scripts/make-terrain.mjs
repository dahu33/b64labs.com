#!/usr/bin/env node
// Builds public/terrain.txt: a mountain that doesn't exist, as 256 × 256 elevation bytes in base64.
//
//   node scripts/make-terrain.mjs
//
// It is stitched from real elevation data: nine pieces of different ranges laid out in a 3 × 3
// grid, with two more massifs pressed into the middle so that no summit is a real place. Each
// piece is turned or mirrored, eased into its neighbours' broad heights, and cut along the line
// where the two agree best.
//
// Source: Mapzen Terrain Tiles on AWS Open Data (no key needed). Every piece below comes from
// USGS 3DEP or SRTM data, which is why the site's only data credit is to the USGS.

import { inflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildField } from '../public/js/terrain.js';

const SIZE = 256; // samples across the map
const KM = 32;
const SAMPLE_M = 125;
const SOURCE = 400; // samples across each source square
const PATCH = 128; // samples across each piece
const OVERLAP = 40;
const STEP = PATCH - OVERLAP;
const SPAN = PATCH + STEP * 2;
const SEAM_INSET = 8; // seams stay this far from the edge of an overlap
const FEATHER = 4;
const MATCH_RADIUS = 12;
const ZOOM = 11;
const TILE = 256;
const EQUATOR_M = 40075016.686;
const CACHE = fileURLToPath(new URL('../node_modules/.cache/b64labs-terrain', import.meta.url));

// Placed in this order. `at` is the grid position; `from` is the centre of the 50 km source
// square; u, v is the corner of the piece inside it; turn is one of the eight turns and mirrors.
const PIECES = [
  { at: [1, 1], from: [-9.1, -77.6], u: 120, v: 168, turn: 6, scale: 1.05, offset: -2586.175 },
  { at: [0, 1], from: [28.55, 83.95], u: 272, v: 240, turn: 5, scale: 0.65, offset: -881.715 },
  { at: [2, 1], from: [36.75, -118.45], u: 264, v: 160, turn: 7, scale: 0.936748, offset: -909.051 },
  { at: [1, 0], from: [36.5, 74.95], u: 136, v: 64, turn: 6, scale: 0.862167, offset: -2175.382 },
  { at: [1, 2], from: [-10.3, -76.9], u: 8, v: 240, turn: 7, scale: 0.962708, offset: -1229.228 },
  { at: [0, 0], from: [29.6, 101.9], u: 208, v: 272, turn: 6, scale: 0.789084, offset: -1597.212 },
  { at: [2, 0], from: [42.2, 80.2], u: 248, v: 96, turn: 4, scale: 0.866155, offset: -3169.008 },
  { at: [0, 2], from: [-32.65, -70], u: 232, v: 248, turn: 5, scale: 0.843239, offset: -1616.894 },
  { at: [2, 2], from: [35.75, 76.4], u: 72, v: 208, turn: 5, scale: 0.65, offset: -1139.899 },
];

// Pressed into the first piece after it is placed. east and south are in samples.
const MASSIFS = [
  { from: [-49.3, -73], u: 104, v: 0, turn: 1, scale: 1.05, offset: 1181.656, east: 22, south: 38 },
  { from: [27.95, 86.85], u: 200, v: 104, turn: 4, scale: 1.05, offset: -5196.966, east: -33, south: -40 },
];

function decodePng(buf) {
  let p = 8;
  let width, height, channels;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = { 2: 3, 6: 4 }[data[9]];
      if (data[8] !== 8 || data[12] !== 0 || !channels) throw new Error('Unsupported PNG');
    }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v + predicted;
    }
  }
  return { width, height, channels, px };
}

async function tile(x, y) {
  const file = `${CACHE}/${ZOOM}/${x}/${y}.png`;
  let buf;
  try {
    buf = await readFile(file);
  } catch {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, buf);
  }
  return decodePng(buf);
}

// A 50 km square of terrain around a point, one sample every 125 m.
async function loadSquare([lat, lon]) {
  const world = TILE * 2 ** ZOOM;
  const step = SAMPLE_M / ((EQUATOR_M * Math.cos((lat * Math.PI) / 180)) / world);
  const half = (SOURCE * step) / 2;
  const φ = (lat * Math.PI) / 180;
  const centreX = ((lon + 180) / 360) * world;
  const centreY = ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * world;
  const [left, top] = [centreX - half, centreY - half];
  const [tx0, ty0] = [Math.floor(left / TILE), Math.floor(top / TILE)];
  const [tx1, ty1] = [Math.floor((centreX + half) / TILE), Math.floor((centreY + half) / TILE)];
  const mosaicWidth = (tx1 - tx0 + 1) * TILE;
  const mosaic = new Float32Array(mosaicWidth * (ty1 - ty0 + 1) * TILE);

  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
  for (let i = 0; i < jobs.length; i += 6) {
    await Promise.all(
      jobs.slice(i, i + 6).map(async ([tx, ty]) => {
        const { width, height, channels, px } = await tile(tx, ty);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const k = (y * width + x) * channels;
            const metres = px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768;
            mosaic[((ty - ty0) * TILE + y) * mosaicWidth + (tx - tx0) * TILE + x] = metres;
          }
        }
      }),
    );
  }

  const square = new Float32Array(SOURCE * SOURCE);
  for (let j = 0; j < SOURCE; j++) {
    for (let i = 0; i < SOURCE; i++) {
      const x0 = Math.floor(left + i * step) - tx0 * TILE;
      const x1 = Math.max(x0 + 1, Math.ceil(left + (i + 1) * step) - tx0 * TILE);
      const y0 = Math.floor(top + j * step) - ty0 * TILE;
      const y1 = Math.max(y0 + 1, Math.ceil(top + (j + 1) * step) - ty0 * TILE);
      let [sum, count] = [0, 0];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const h = mosaic[y * mosaicWidth + x];
          if (h > -500 && h < 9000) {
            sum += h;
            count++;
          }
        }
      }
      square[j * SOURCE + i] = count ? sum / count : NaN;
    }
  }
  for (let k = 0; k < square.length; k++) if (Number.isNaN(square[k])) square[k] = square[k - 1] || 0;
  return square;
}

function blur(source, size, radius) {
  const a = Float32Array.from(source);
  const b = new Float32Array(source.length);
  const clamp = (v) => Math.min(size - 1, Math.max(0, v));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < size; y++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += a[y * size + clamp(x)];
      for (let x = 0; x < size; x++) {
        b[y * size + x] = sum / (2 * radius + 1);
        sum += a[y * size + clamp(x + radius + 1)] - a[y * size + clamp(x - radius)];
      }
    }
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += b[clamp(y) * size + x];
      for (let y = 0; y < size; y++) {
        a[y * size + x] = sum / (2 * radius + 1);
        sum += b[clamp(y + radius + 1) * size + x] - b[clamp(y - radius) * size + x];
      }
    }
  }
  return a;
}

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Reads a piece out of its square: index i is row * PATCH + column.
function turned(turn) {
  const map = new Int32Array(PATCH * PATCH);
  for (let b = 0; b < PATCH; b++) {
    for (let a = 0; a < PATCH; a++) {
      let [x, y] = [a, b];
      if (turn & 1) [x, y] = [y, x];
      if (turn & 2) x = PATCH - 1 - x;
      if (turn & 4) y = PATCH - 1 - y;
      map[b * PATCH + a] = y * SOURCE + x;
    }
  }
  return map;
}

const canvas = new Float32Array(SPAN * SPAN);
const filled = new Uint8Array(SPAN * SPAN);
const placed = new Set();

// The cheapest line through one overlap. Runs top to bottom when `down` is true.
function seam(start, down, errorAt) {
  const O = OVERLAP;
  const cost = new Float64Array(O * PATCH);
  const from = new Int8Array(O * PATCH);
  for (let m = 0; m < PATCH; m++) {
    for (let c = 0; c < O; c++) {
      let best = 0;
      if (m > 0) {
        best = cost[(m - 1) * O + c];
        if (c > 0 && cost[(m - 1) * O + c - 1] < best) {
          best = cost[(m - 1) * O + c - 1];
          from[m * O + c] = -1;
        }
        if (c < O - 1 && cost[(m - 1) * O + c + 1] < best) {
          best = cost[(m - 1) * O + c + 1];
          from[m * O + c] = 1;
        }
      }
      const edge = c < SEAM_INSET || c >= O - SEAM_INSET ? 1e9 : 0;
      cost[m * O + c] = best + edge + (down ? errorAt(start + c, m) : errorAt(m, start + c));
    }
  }
  let c = SEAM_INSET;
  for (let t = SEAM_INSET; t < O - SEAM_INSET; t++) if (cost[(PATCH - 1) * O + t] < cost[(PATCH - 1) * O + c]) c = t;
  const line = new Int32Array(PATCH);
  for (let m = PATCH - 1; m >= 0; m--) {
    line[m] = start + c;
    c += from[m * O + c];
  }
  return line;
}

function place({ at: [col, row], square, u, v, turn, scale, offset }) {
  const [px, py] = [col * STEP, row * STEP];
  const map = turned(turn);
  const base = v * SOURCE + u;
  const fresh = new Float32Array(PATCH * PATCH);
  for (let k = 0; k < fresh.length; k++) fresh[k] = scale * square[base + map[k]] + offset;

  // Ease the piece into what is already there, so only fine detail differs at the seam.
  const known = new Float32Array(PATCH * PATCH);
  const difference = new Float32Array(PATCH * PATCH);
  for (let b = 0; b < PATCH; b++) {
    for (let a = 0; a < PATCH; a++) {
      const c = (py + b) * SPAN + px + a;
      if (!filled[c]) continue;
      known[b * PATCH + a] = 1;
      difference[b * PATCH + a] = fresh[b * PATCH + a] - canvas[c];
    }
  }
  if (known.some(Boolean)) {
    const weight = blur(known, PATCH, MATCH_RADIUS);
    const amount = blur(difference, PATCH, MATCH_RADIUS);
    for (let k = 0; k < fresh.length; k++) {
      if (weight[k] > 1e-4) fresh[k] -= (amount[k] / weight[k]) * Math.min(1, weight[k] * 2);
    }
  }

  const errorAt = (a, b) => {
    const c = (py + b) * SPAN + px + a;
    return filled[c] ? (fresh[b * PATCH + a] - canvas[c]) ** 2 : 0;
  };
  const beside = (c, r) => placed.has(`${c},${r}`);
  const left = beside(col - 1, row) ? seam(0, true, errorAt) : null;
  const right = beside(col + 1, row) ? seam(PATCH - OVERLAP, true, errorAt) : null;
  const up = beside(col, row - 1) ? seam(0, false, errorAt) : null;
  const down = beside(col, row + 1) ? seam(PATCH - OVERLAP, false, errorAt) : null;

  const mask = new Float32Array(PATCH * PATCH);
  for (let b = 0; b < PATCH; b++) {
    for (let a = 0; a < PATCH; a++) {
      const out = (left && a < left[b]) || (right && a >= right[b]) || (up && b < up[a]) || (down && b >= down[a]);
      mask[b * PATCH + a] = out ? 0 : 1;
    }
  }
  const alpha = blur(mask, PATCH, FEATHER);
  for (let b = 0; b < PATCH; b++) {
    for (let a = 0; a < PATCH; a++) {
      const c = (py + b) * SPAN + px + a;
      const h = fresh[b * PATCH + a];
      if (!filled[c]) {
        canvas[c] = h;
        filled[c] = 1;
      } else {
        canvas[c] = canvas[c] * (1 - alpha[b * PATCH + a]) + h * alpha[b * PATCH + a];
      }
    }
  }
  placed.add(`${col},${row}`);
}

// Raises another massif through the middle piece. A smooth maximum keeps whichever surface is
// higher, so the two meet in a natural crease.
function press({ square, u, v, turn, scale, offset, east, south }) {
  const map = turned(turn);
  const base = v * SOURCE + u;
  const [inner, outer, sink, blend] = [3.5, 7.5, 2500, 150];
  for (let b = 0; b < PATCH; b++) {
    for (let a = 0; a < PATCH; a++) {
      const [cx, cy] = [STEP + east + a, STEP + south + b];
      if (cx < STEP || cy < STEP || cx >= STEP + PATCH || cy >= STEP + PATCH) continue;
      const border = Math.min(cx - STEP, cy - STEP, STEP + PATCH - 1 - cx, STEP + PATCH - 1 - cy);
      const distance = (Math.hypot(a - PATCH / 2, b - PATCH / 2) * SAMPLE_M) / 1000;
      const window = (1 - smooth(inner, outer, distance)) * smooth(0, 16, border);
      const raised = scale * square[base + map[b * PATCH + a]] + offset - (1 - window) * sink;
      const c = cy * SPAN + cx;
      const mix = Math.min(1, Math.max(0, 0.5 + (0.5 * (raised - canvas[c])) / blend));
      canvas[c] += (raised - canvas[c]) * mix + blend * mix * (1 - mix);
    }
  }
}

const squares = new Map();
for (const { from } of [...PIECES, ...MASSIFS]) {
  squares.set(from.join(), await loadSquare(from));
}

const [heart, ...others] = PIECES;
place({ ...heart, square: squares.get(heart.from.join()) });
for (const massif of MASSIFS) press({ ...massif, square: squares.get(massif.from.join()) });
for (const piece of others) place({ ...piece, square: squares.get(piece.from.join()) });

const margin = Math.floor((SPAN - SIZE) / 2);
const heights = new Float32Array(SIZE * SIZE);
for (let j = 0; j < SIZE; j++) {
  for (let i = 0; i < SIZE; i++) heights[j * SIZE + i] = canvas[(j + margin) * SPAN + i + margin];
}
let [low, high] = [Infinity, -Infinity];
for (const h of heights) {
  low = Math.min(low, h);
  high = Math.max(high, h);
}
const bytes = Uint8Array.from(heights, (h) => Math.round(((h - low) / (high - low)) * 255));
const meta = { km: KM, min: 300, max: Math.round(300 + high - low) };

const field = buildField(meta, bytes);
if (field.logo < 0) throw new Error('No cell on this mountain reads 011011.');

const out = fileURLToPath(new URL('../public/terrain.txt', import.meta.url));
await writeFile(out, `${JSON.stringify(meta)}\n${Buffer.from(bytes).toString('base64')}\n`);
console.log(meta, `${PIECES.length + MASSIFS.length} pieces, logo cell found`);
