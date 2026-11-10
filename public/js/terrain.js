// A mountain on a hexagonal grid.
//
// Every cell sits in a 200 m elevation band. A side lights up when the cell across it
// is in a different band, so the lit sides trace the contour lines. Six sides, six bits:
// every cell of the mountain is one base64 character.

import { CORNERS } from './hex.js';

const BAND_M = 200;
const R = 1 / 12; // cell radius in km
const COLUMN = R * 1.5;
const ROW = R * Math.sqrt(3);
const MAP_RADIUS = 15.9; // the map is one big hexagon, km
const LOGO = 0b011011;

// Neighbours clockwise from north, for even and odd columns.
const NEIGHBOURS = [
  [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]],
  [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]],
];

function normalize([x, y, z]) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

// The heights are 8-bit, about 18 m per step. A light blur hides the stair steps.
function smoothHeights(bytes, size, min, max) {
  const metres = (i, j) => bytes[Math.min(j, size - 1) * size + Math.min(i, size - 1)];
  const out = new Float32Array(size * size);
  const weights = [1, 2, 1];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let total = 0;
      for (let b = -1; b <= 1; b++) {
        for (let a = -1; a <= 1; a++) {
          total += metres(Math.max(i + a, 0), Math.max(j + b, 0)) * weights[a + 1] * weights[b + 1];
        }
      }
      out[j * size + i] = min + (total / 16 / 255) * (max - min);
    }
  }
  return out;
}

export function buildField(meta, bytes) {
  const size = Math.sqrt(bytes.length);
  const half = meta.km / 2;
  const scale = (size - 1) / meta.km;
  const surface = smoothHeights(bytes, size, meta.min, meta.max);

  const elevation = (x, z) => {
    const u = Math.min(Math.max((x + half) * scale, 0), size - 1.001);
    const v = Math.min(Math.max((z + half) * scale, 0), size - 1.001);
    const [i, j] = [u | 0, v | 0];
    const [fu, fv] = [u - i, v - j];
    const at = (a, b) => surface[b * size + a];
    const top = at(i, j) * (1 - fu) + at(i + 1, j) * fu;
    const bottom = at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu;
    return top * (1 - fv) + bottom * fv;
  };

  const cols = Math.floor(meta.km / COLUMN);
  const rows = Math.floor(meta.km / ROW);
  const count = cols * rows;
  const centreX = (q) => (q - (cols - 1) / 2) * COLUMN;
  const centreZ = (q, r) => (r - (rows - 1) / 2 + (q & 1) / 2) * ROW;
  const index = (q, r) => (q < 0 || r < 0 || q >= cols || r >= rows ? -1 : r * cols + q);
  const inMap = (x, z) =>
    Math.abs(z) <= MAP_RADIUS * (Math.sqrt(3) / 2) && Math.abs(x) + Math.abs(z) / Math.sqrt(3) <= MAP_RADIUS;

  const bands = new Int16Array(count).fill(-1);
  const heights = new Float32Array(count);
  const bits = new Uint8Array(count);

  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const [x, z] = [centreX(q), centreZ(q, r)];
      if (!inMap(x, z)) continue;
      heights[index(q, r)] = elevation(x, z);
      bands[index(q, r)] = Math.floor(heights[index(q, r)] / BAND_M);
    }
  }

  const altitude = (metres) => (metres - meta.min) / (meta.max - meta.min);
  const edges = [];

  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const cell = index(q, r);
      const band = bands[cell];
      if (band < 0) continue;
      const [x, z] = [centreX(q), centreZ(q, r)];

      NEIGHBOURS[q & 1].forEach(([dq, dr], side) => {
        const other = index(q + dq, r + dr);
        if (other < 0 || bands[other] < 0 || bands[other] >= band) return;
        bits[cell] |= 1 << (5 - side);
        bits[other] |= 1 << (5 - ((side + 3) % 6));

        const [ax, az] = [x + CORNERS[side][0] * R, z + CORNERS[side][1] * R];
        const [bx, bz] = [x + CORNERS[(side + 1) % 6][0] * R, z + CORNERS[(side + 1) % 6][1] * R];
        const [ha, hb] = [elevation(ax, az), elevation(bx, bz)];
        const major = Math.floor(band / 5) > Math.floor(bands[other] / 5) ? 1 : 0;
        edges.push(ax, ha / 1000, az, bx, hb / 1000, bz, altitude((ha + hb) / 2), major);
      });
    }
  }

  let summit = -1;
  let logo = -1;
  for (let cell = 0; cell < count; cell++) {
    if (bands[cell] < 0) continue;
    if (summit < 0 || heights[cell] > heights[summit]) summit = cell;
    if (bits[cell] === LOGO && (logo < 0 || heights[cell] > heights[logo])) logo = cell;
  }

  const position = (cell) => {
    const q = cell % cols;
    const r = (cell - q) / cols;
    return [centreX(q), centreZ(q, r)];
  };

  const cellAt = (x, z) => {
    const column = Math.round(x / COLUMN + (cols - 1) / 2);
    let best = -1;
    let bestDistance = Infinity;
    for (let q = column - 1; q <= column + 1; q++) {
      const r = Math.round(z / ROW + (rows - 1) / 2 - (q & 1) / 2);
      const cell = index(q, r);
      if (cell < 0 || bands[cell] < 0) continue;
      const distance = (x - centreX(q)) ** 2 + (z - centreZ(q, r)) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cell;
      }
    }
    return best;
  };

  return {
    meta,
    size,
    surface,
    edges: new Float32Array(edges),
    bits,
    heights,
    summit,
    logo,
    origin: [centreX(0), centreZ(0, 0)],
    elevation,
    position,
    cellAt,
  };
}

const prelude = (meta, origin) => `#version 300 es
precision highp float;
uniform mat4 uVP;
uniform vec3 uEye;
uniform vec2 uRes, uProbe, uCell;
uniform float uPx, uLift, uTime, uReveal, uFocus, uDim, uProbeOn, uMinor, uFog, uGlow;
uniform sampler2D uHeight, uDetail;

const float KM = ${meta.km.toFixed(1)};
const float MIN_H = ${(meta.min / 1000).toFixed(4)};
const float MAX_H = ${(meta.max / 1000).toFixed(4)};
const float R = ${R.toFixed(6)};
const float MAP_RADIUS = ${MAP_RADIUS.toFixed(2)};
const vec2 ORIGIN = vec2(${origin[0].toFixed(6)}, ${origin[1].toFixed(6)});
const vec3 SUN = normalize(vec3(-.8, .3, -.52));

// Night, with a band of dusk behind the ridgeline. uGlow is that band's height in the view.
vec3 skyAt(float h) {
  float d = h - uGlow;
  return mix(vec3(.008, .011, .021), vec3(.128, .088, .138), d > 0. ? exp(-d * 34.) : exp(d * 9.));
}

float fogAt(float d) { float f = d * uFog; return 1. - exp(-f * f); }

// Blue valleys, pale rock, and alpenglow on the summits.
vec3 ramp(float t) {
  vec3 c = mix(vec3(.13, .23, .37), vec3(.34, .52, .69), smoothstep(0., .3, t));
  c = mix(c, vec3(.66, .76, .84), smoothstep(.28, .55, t));
  c = mix(c, vec3(1., .70, .50), smoothstep(.53, .72, t));
  return mix(c, vec3(1., .31, .13), smoothstep(.7, .95, t));
}

float revealAt(float t) { float s = t * .72; return smoothstep(s, s + .2, uReveal); }
float probeAt(vec2 p) { float d = distance(p, uProbe) / .75; return exp(-d * d) * uProbeOn; }
`;

// Hides banding in the dark gradients. Fragment stage only.
const DITHER = `float dither() { return (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) - .5) / 255.; }`;

const SKY_VS = (head) => `${head}
out vec2 vNdc;
void main() {
  vec2 p = vec2((gl_VertexID & 1) * 4 - 1, (gl_VertexID & 2) * 2 - 1);
  vNdc = p;
  gl_Position = vec4(p, .9999, 1.);
}`;

const SKY_FS = (head) => `${head}
${DITHER}
uniform vec3 uForward, uRight, uUp;
uniform vec2 uTan, uShift;
in vec2 vNdc;
out vec4 outColor;

float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

void main() {
  vec2 ndc = vNdc - uShift;
  vec3 dir = normalize(uForward + uRight * ndc.x * uTan.x + uUp * ndc.y * uTan.y);
  vec3 c = skyAt(dir.y);

  vec3 grid = dir * 430.;
  vec3 cell = floor(grid);
  float star = step(.9988, hash(cell)) * smoothstep(.05, .2, dir.y - uGlow);
  star *= smoothstep(.36, .06, length(fract(grid) - .5));
  c += vec3(.8, .86, 1.) * star * (.42 + .3 * sin(uTime * (.6 + hash(cell + 3.) * 1.6) + hash(cell + 7.) * 40.));
  outColor = vec4(c * uDim + dither(), 1.);
}`;

const SURFACE_VS = (head) => `${head}
layout(location = 0) in vec3 aPosition;
out vec3 vWorld;
void main() {
  vWorld = vec3(aPosition.x, aPosition.y * uLift, aPosition.z);
  gl_Position = uVP * vec4(vWorld, 1.);
}`;

const SURFACE_FS = (head) => `${head}
${DITHER}
in vec3 vWorld;
out vec4 outColor;

float heightAt(vec2 p) { return texture(uHeight, ((p + KM * .5) / KM * 255. + .5) / 256.).r; }

// Distance to the nearest cell boundary, where the boundary is at .866 R.
float hexagon(vec2 p, out vec2 centre) {
  vec2 s = vec2(3., 1.7320508) * R;
  vec2 h = s * .5;
  vec2 q = p - ORIGIN;
  vec2 a = mod(q + h, s) - h;
  vec2 b = mod(q, s) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  centre = p - g;
  vec2 m = abs(g);
  return max(m.y, m.x * .8660254 + m.y * .5);
}

void main() {
  vec2 p = vWorld.xz;
  vec2 m = abs(p);
  float rim = max(m.y / .8660254, m.x + m.y * .5773503);
  if (rim > MAP_RADIUS) discard;

  const float E = .1;
  float h0 = heightAt(p);
  float he = heightAt(p + vec2(E, 0.));
  float hw = heightAt(p - vec2(E, 0.));
  float hs = heightAt(p + vec2(0., E));
  float hn = heightAt(p - vec2(0., E));
  vec2 slope = vec2(hw - he, hn - hs) * 1.25;
  vec2 rock = texture(uDetail, p * .91).rg - .5 + (texture(uDetail, p.yx * 2.7 + .3).rg - .5) * .6;
  float steep = smoothstep(.05, .55, length(slope) / (2. * E));
  vec3 n = normalize(vec3(slope + rock * (.025 + steep * .16), 2. * E).xzy);
  float light = max(dot(n, SUN), 0.);
  float ridge = clamp((h0 * 4. - he - hw - hs - hn) * 11., -1., 1.);
  float t = clamp((h0 - MIN_H) / (MAX_H - MIN_H), 0., 1.);

  vec3 c = mix(vec3(.007, .010, .016), vec3(.048, .078, .13), light * (.35 + t * .85));
  c *= 1. + ridge * .6;
  float dusk = smoothstep(.46, .94, t);
  c += vec3(.60, .23, .17) * dusk * pow(light, 2.4) * (.5 + ridge * .55);
  c *= revealAt(t) * .92 + .08;

  vec2 centre;
  float edge = hexagon(p, centre);
  float fw = fwidth(edge);
  float hair = smoothstep(.866 * R - 1.6 * fw, .866 * R - .2 * fw, edge) * smoothstep(.022, .004, fw);
  float near = probeAt(p);
  vec3 line = ramp(t);
  float hovered = 1. - step(R * .5, distance(centre, uProbe));
  c *= 1. - smoothstep(0., .45, uFocus) * .92;
  c += line * hair * (.014 + near * .55) * (1. - uFocus);
  c += line * hovered * uProbeOn * .22;

  // The logo: four sides of the cell, cut square where the top and bottom sides would be.
  vec2 q = abs(p - uCell);
  float side = q.x * .8660254 + q.y * .5;
  float a = .8660254 * R;
  float thick = .2944 * R;
  float mark = max(max(side - a, a - thick - side), q.y - a);
  float aa = fwidth(mark);
  vec3 hot = vec3(1., .36, .18);
  float ghost = abs(q.y - a);
  float ghostLine = (1. - smoothstep(0., fwidth(ghost) * 1.4, ghost)) * step(q.x, (a * .5 - thick) / .8660254);
  c += hot * ghostLine * uFocus * .3;
  c += hot * exp(-max(mark, 0.) / (R * .15)) * uFocus * .3;
  c = mix(c, hot, (1. - smoothstep(-aa, aa, mark)) * uFocus);

  float rimWidth = fwidth(rim);
  float rimLine = smoothstep(MAP_RADIUS - 1.6 * rimWidth, MAP_RADIUS - .3 * rimWidth, rim);

  vec3 background = skyAt(normalize(vWorld - uEye).y);
  c = mix(c, background, smoothstep(MAP_RADIUS - .8, MAP_RADIUS - .02, rim));
  c += vec3(.42, .50, .58) * rimLine * (1. - uFocus) * smoothstep(.5, 0., uLift);
  c = mix(c, background, fogAt(distance(uEye, vWorld)));
  outColor = vec4(c * uDim + dither(), 1.);
}`;

const LINE_VS = (head) => `${head}
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aA;
layout(location = 2) in vec3 aB;
layout(location = 3) in vec2 aMeta;
out float vAcross, vHalf, vCore;
out vec3 vColor;
void main() {
  float raise = .03 * uLift;
  vec3 pa = vec3(aA.x, aA.y * uLift + raise, aA.z);
  vec3 pb = vec3(aB.x, aB.y * uLift + raise, aB.z);
  vec4 a = uVP * vec4(pa, 1.);
  vec4 b = uVP * vec4(pb, 1.);
  const float NEAR = .02;
  if (a.w < NEAR && b.w < NEAR) { gl_Position = vec4(2., 2., 2., 1.); return; }
  if (a.w < NEAR) a = mix(a, b, (NEAR - a.w) / (b.w - a.w));
  if (b.w < NEAR) b = mix(b, a, (NEAR - b.w) / (a.w - b.w));

  vec2 along = (b.xy / b.w - a.xy / a.w) * uRes;
  along = length(along) > .001 ? normalize(along) : vec2(1., 0.);
  vec2 across = vec2(-along.y, along.x);

  vec2 mid = (aA.xz + aB.xz) * .5;
  float t = aMeta.x;
  bool major = aMeta.y > .5;

  float core = (major ? .68 : .5) * uPx;
  float glow = core * 3. + 1.1 * uPx;
  float halfWidth = core + glow * 2.;

  float d = distance(uEye, mix(pa, pb, .5));
  float reveal = revealAt(t);
  float flash = reveal * (1. - smoothstep(t * .72 + .1, t * .72 + .42, uReveal));

  vec2 m = abs(mid);
  float rim = max(m.y / .8660254, m.x + m.y * .5773503);

  vec3 c = ramp(t) * (major ? 1.08 : uMinor);
  c *= 1. / (1. + d * .012);
  float scan = fract(uTime * .05) * 1.5 - .25;
  c *= 1. + exp(-pow((t - scan) / .04, 2.)) * .85;
  c *= 1. + probeAt(mid) * 2.;
  c += vec3(1., .78, .62) * flash * 1.1;
  c *= reveal * (1. - uFocus) * (1. - smoothstep(MAP_RADIUS - .8, MAP_RADIUS - .05, rim)) * (1. - fogAt(d)) * uDim;

  vAcross = aCorner.y;
  vHalf = halfWidth;
  vCore = core;
  vColor = c;

  vec4 p = mix(a, b, aCorner.x);
  vec2 extend = along * (aCorner.x * 2. - 1.) * core;
  p.xy += (across * aCorner.y * halfWidth + extend) * 2. / uRes * p.w;
  gl_Position = p;
}`;

const LINE_FS = (head) => `${head}
in float vAcross, vHalf, vCore;
in vec3 vColor;
out vec4 outColor;
void main() {
  float d = abs(vAcross) * vHalf;
  float core = 1. - smoothstep(vCore - .75, vCore + .75, d);
  float glow = exp(-d * d / (vHalf * vHalf * .14)) * .26;
  outColor = vec4(vColor * max(core, glow), 1.);
}`;

// A tiling field of fine slopes that gives the smooth elevation data some rock.
function rockTexture(gl) {
  const size = 256;
  let seed = 64;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const height = new Float32Array(size * size);
  [6, 12, 24, 48].forEach((cells, octave) => {
    const lattice = Float32Array.from({ length: cells * cells }, random);
    const smooth = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [u, v] = [(x / size) * cells, (y / size) * cells];
        const [i, j] = [u | 0, v | 0];
        const [fx, fy] = [smooth(u - i), smooth(v - j)];
        const at = (a, b) => lattice[((b + cells) % cells) * cells + ((a + cells) % cells)];
        const top = at(i, j) * (1 - fx) + at(i + 1, j) * fx;
        const bottom = at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx;
        height[y * size + x] += (top * (1 - fy) + bottom * fy) * 0.5 ** octave;
      }
    }
  });

  const data = new Uint8Array(size * size * 2);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 2;
      data[i] = Math.min(255, Math.max(0, 127.5 + (at(x + 1, y) - at(x - 1, y)) * 640));
      data[i + 1] = Math.min(255, Math.max(0, 127.5 + (at(x, y + 1) - at(x, y - 1)) * 640));
    }
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, size, size, 0, gl.RG, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  return texture;
}

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] + a[row + 4] * b[col * 4 + 1] + a[row + 8] * b[col * 4 + 2] + a[row + 12] * b[col * 4 + 3];
    }
  }
  return out;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function compile(gl, vertex, fragment) {
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

  const uniforms = {};
  const total = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < total; i++) {
    const { name } = gl.getActiveUniform(program, i);
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}

export async function createScene(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
  if (!gl) return null;

  const text = await (await fetch('/terrain.txt')).text();
  const [header, body] = text.split('\n');
  const field = buildField(JSON.parse(header), Uint8Array.from(atob(body), (c) => c.charCodeAt(0)));

  const head = prelude(field.meta, field.origin);
  const sky = compile(gl, SKY_VS(head), SKY_FS(head));
  const surface = compile(gl, SURFACE_VS(head), SURFACE_FS(head));
  const line = compile(gl, LINE_VS(head), LINE_FS(head));

  const buffer = (data, target = gl.ARRAY_BUFFER) => {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  };
  const attribute = (source, location, size, stride, offset, divisor) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, source);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(location, divisor);
  };

  const { size, surface: metres, meta } = field;
  const kilometres = metres.map((h) => h / 1000);

  const heightTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, heightTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, size, size, 0, gl.RED, gl.FLOAT, kilometres);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.activeTexture(gl.TEXTURE1);
  rockTexture(gl);
  gl.activeTexture(gl.TEXTURE0);

  const vertices = new Float32Array(size * size * 3);
  const indices = new Uint32Array((size - 1) * (size - 1) * 6);
  for (let j = 0, v = 0, n = 0; j < size; j++) {
    for (let i = 0; i < size; i++, v += 3) {
      vertices[v] = (i / (size - 1) - 0.5) * meta.km;
      vertices[v + 1] = kilometres[j * size + i];
      vertices[v + 2] = (j / (size - 1) - 0.5) * meta.km;
      if (i === size - 1 || j === size - 1) continue;
      const a = j * size + i;
      const b = a + size;
      indices.set([a, b, a + 1, a + 1, b, b + 1], n);
      n += 6;
    }
  }

  const surfaceVao = gl.createVertexArray();
  gl.bindVertexArray(surfaceVao);
  attribute(buffer(vertices), 0, 3, 12, 0, 0);
  buffer(indices, gl.ELEMENT_ARRAY_BUFFER);

  const quad = buffer(new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]));
  const edgeBuffer = buffer(field.edges);
  const lineVao = gl.createVertexArray();
  gl.bindVertexArray(lineVao);
  attribute(quad, 0, 2, 8, 0, 0);
  attribute(edgeBuffer, 1, 3, 32, 0, 1);
  attribute(edgeBuffer, 2, 3, 32, 12, 1);
  attribute(edgeBuffer, 3, 2, 32, 24, 1);
  gl.bindVertexArray(null);

  const emptyVao = gl.createVertexArray();
  const edgeCount = field.edges.length / 8;

  gl.polygonOffset(1, 1);

  let view = null;
  let width = 1;
  let height = 1;

  function resize(cssWidth, cssHeight, pixelRatio) {
    width = cssWidth;
    height = cssHeight;
    const [w, h] = [Math.round(cssWidth * pixelRatio), Math.round(cssHeight * pixelRatio)];
    // Assigning canvas.width clears it, and mobile browsers fire resize while scrolling.
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  function camera({ x, y, z, distance, azimuth, elevation, fov, shiftX, shiftY }) {
    const [sa, ca] = [Math.sin(azimuth), Math.cos(azimuth)];
    const [se, ce] = [Math.sin(elevation), Math.cos(elevation)];
    const back = [ce * sa, se, ce * ca];
    const eye = [x + back[0] * distance, y + back[1] * distance, z + back[2] * distance];
    const up = normalize([-se * sa, ce, -se * ca]);
    const forward = [-back[0], -back[1], -back[2]];
    const right = normalize(cross(forward, up));
    const aspect = width / height;
    const tanHalf = Math.tan(fov / 2);

    const near = Math.max(0.05, distance * 0.02);
    const far = distance + 90;
    const projection = perspective(fov, aspect, near, far);
    projection[8] = -shiftX;
    projection[9] = -shiftY;
    const lookAt = [
      right[0], up[0], back[0], 0,
      right[1], up[1], back[1], 0,
      right[2], up[2], back[2], 0,
      -dot(right, eye), -dot(up, eye), -dot(back, eye), 1,
    ];
    view = { eye, forward, right, up, tan: [tanHalf * aspect, tanHalf], shift: [shiftX, shiftY], matrix: multiply(projection, lookAt) };
  }

  function use(p, state) {
    gl.useProgram(p.program);
    const u = p.uniforms;
    gl.uniformMatrix4fv(u.uVP, false, view.matrix);
    gl.uniform3fv(u.uEye, view.eye);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform2fv(u.uProbe, state.probe);
    gl.uniform2fv(u.uCell, state.cell);
    gl.uniform1f(u.uPx, state.pixelRatio);
    gl.uniform1f(u.uLift, state.lift);
    gl.uniform1f(u.uTime, state.time);
    gl.uniform1f(u.uReveal, state.reveal);
    gl.uniform1f(u.uFocus, state.focus);
    gl.uniform1f(u.uDim, state.dim);
    gl.uniform1f(u.uProbeOn, state.probeOn);
    gl.uniform1f(u.uMinor, state.minor);
    gl.uniform1f(u.uFog, state.fog);
    gl.uniform1f(u.uGlow, state.glow);
    gl.uniform1i(u.uHeight, 0);
    gl.uniform1i(u.uDetail, 1);
  }

  function render(state) {
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    use(sky, state);
    gl.uniform3fv(sky.uniforms.uForward, view.forward);
    gl.uniform3fv(sky.uniforms.uRight, view.right);
    gl.uniform3fv(sky.uniforms.uUp, view.up);
    gl.uniform2fv(sky.uniforms.uTan, view.tan);
    gl.uniform2fv(sky.uniforms.uShift, view.shift);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    use(surface, state);
    gl.bindVertexArray(surfaceVao);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);

    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    use(line, state);
    gl.bindVertexArray(lineVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, edgeCount);
    gl.bindVertexArray(null);
  }

  // World position to CSS pixels. Returns null behind the camera.
  function project([x, y, z]) {
    const m = view.matrix;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) return null;
    return [
      (((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) / 2) * width,
      ((1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) / 2) * height,
    ];
  }

  // The cell under a CSS pixel, found by marching a ray over the surface.
  function pick(px, py, lift) {
    const nx = (px / width) * 2 - 1 - view.shift[0];
    const ny = 1 - (py / height) * 2 - view.shift[1];
    const dir = normalize([0, 1, 2].map(
      (i) => view.forward[i] + view.right[i] * nx * view.tan[0] + view.up[i] * ny * view.tan[1],
    ));
    for (let t = 0.3, i = 0; i < 800; i++, t += 0.06) {
      const [x, y, z] = [view.eye[0] + dir[0] * t, view.eye[1] + dir[1] * t, view.eye[2] + dir[2] * t];
      const cell = field.cellAt(x, z);
      if (cell >= 0 && y <= (field.elevation(x, z) / 1000) * lift) return cell;
    }
    return -1;
  }

  return { field, resize, camera, render, project, pick, radius: R };
}
