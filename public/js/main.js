import { createScene } from './terrain.js';
import { ALPHABET, CORNERS, encode, hexPath, toBits } from './hex.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * t * (t * (6 * t - 15) + 10);
const radians = (deg) => (deg * Math.PI) / 180;
// 0 before a, 1 between b and c, 0 after d.
const bump = (v, a, b, c, d) => clamp01((v - a) / (b - a)) * (1 - clamp01((v - c) / (d - c)));
const noiseChar = () => ALPHABET[(Math.random() * 64) | 0];

// Walks an element from one string to another, one column at a time.
function morph(el, from, to, duration = 900, delay = 0) {
  cancelAnimationFrame(el.morphFrame);
  if (calm) {
    el.textContent = to;
    return Promise.resolve();
  }
  const columns = Math.max(from.length, to.length);
  const jitter = Array.from({ length: columns }, () => Math.random() * 5);
  const noise = Array.from({ length: columns }, noiseChar);
  const start = performance.now() + delay;
  let shuffled = 0;

  return new Promise((resolve) => {
    const tick = (now) => {
      const t = (now - start) / duration;
      if (t >= 1) {
        el.textContent = to;
        resolve();
        return;
      }
      if (now - shuffled > 50) {
        shuffled = now;
        for (let i = 0; i < columns; i++) noise[i] = noiseChar();
      }
      const front = Math.max(t, 0) * (columns + 8);
      let text = '';
      for (let i = 0; i < columns; i++) {
        const progress = front - jitter[i] - i;
        if (progress >= 1) text += to[i] ?? '';
        else if (progress > -3) text += to[i] === ' ' || from[i] === ' ' ? ' ' : noise[i];
        else text += from[i] ?? '';
      }
      el.textContent = text;
      el.morphFrame = requestAnimationFrame(tick);
    };
    el.morphFrame = requestAnimationFrame(tick);
  });
}

const scrambled = (text) => text.replace(/\S/g, noiseChar);

function introduceText() {
  const headline = $('headline');
  const text = headline.textContent;
  headline.setAttribute('aria-label', text);
  if (calm) return;
  // Scrambled before first paint, so the real text never flashes.
  const noise = scrambled(text);
  headline.textContent = noise;
  document.fonts.ready.then(() => morph(headline, noise, text, 1500, 150));
}

function prepareBeliefs() {
  const rows = [...document.querySelectorAll('.beliefs li')];
  for (const row of rows) {
    const word = row.querySelector('.word');
    const plain = word.textContent;
    const encoded = encode(plain);
    word.setAttribute('aria-label', plain);
    if (calm) continue;

    word.textContent = encoded;
    word.classList.add('encoded');

    let decoded = false;
    const decode = (delay = 0) => {
      word.classList.remove('encoded');
      return morph(word, word.textContent, plain, 800, delay);
    };
    new IntersectionObserver(
      ([entry], observer) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        decoded = true;
        decode(rows.indexOf(row) * 90);
      },
      { rootMargin: '0px 0px -18% 0px' },
    ).observe(row);

    row.addEventListener('pointerenter', (event) => {
      if (!decoded || event.pointerType !== 'mouse') return;
      word.classList.add('encoded');
      morph(word, word.textContent, encoded, 420);
    });
    row.addEventListener('pointerleave', (event) => {
      if (!decoded || event.pointerType !== 'mouse') return;
      decode();
    });
  }
}

function prepareStream() {
  const stream = $('stream');
  const [ghost, lit] = stream.querySelectorAll('path');
  const message = $('message');
  const r = 7;
  const rows = 3;
  const halfHeight = (Math.sqrt(3) / 2) * r;

  const draw = () => {
    const columns = Math.max(1, Math.floor((stream.clientWidth - 2 * r) / (1.5 * r)) + 1);
    const capacity = columns * rows;
    const glyphs = encode(message.value).replace(/=/g, '').slice(-capacity);
    let ghostPath = '';
    let litPath = '';
    for (let c = 0; c < columns; c++) {
      for (let row = 0; row < rows; row++) {
        const x = r + c * 1.5 * r;
        const y = halfHeight + row * 2 * halfHeight + (c & 1) * halfHeight;
        ghostPath += hexPath(63, x, y, r);
        const glyph = glyphs[c * rows + row];
        if (glyph) litPath += hexPath(ALPHABET.indexOf(glyph), x, y, r);
      }
    }
    ghost.setAttribute('d', ghostPath);
    lit.setAttribute('d', litPath);
  };

  message.addEventListener('input', draw);
  addEventListener('resize', draw);
  draw();
  return draw;
}

function prepareForm(redrawStream) {
  const form = $('form');
  const status = $('status');
  const send = $('send');
  const title = $('contact-title');
  const greeting = title.textContent;
  const fields = [...form.querySelectorAll('input, textarea')];
  const lock = (locked) => fields.forEach((field) => { field.readOnly = locked; });
  let received = false;

  form.addEventListener('input', () => {
    if (!received) return;
    received = false;
    status.textContent = '';
    morph(title, title.textContent, greeting, 600);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    send.disabled = true;
    // Nothing typed from here on could be sent, and the reset below would erase it.
    lock(true);
    form.classList.remove('sent');
    form.classList.add('sending');
    status.textContent = 'Sending…';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { accept: 'application/json' },
      });
      form.classList.remove('sending');

      if (response.ok) {
        form.classList.add('sent');
        status.textContent = 'Thanks. A human will read it.';
        morph(title, title.textContent, 'Received.', 800);
        await new Promise((done) => setTimeout(done, 1600));
        form.reset();
        form.classList.remove('sent');
        redrawStream();
        received = true;
      } else if (response.status === 429) {
        status.textContent = 'Too many messages. Try again in a minute.';
      } else if (response.status === 400) {
        status.textContent = 'Please check your name, email and message.';
      } else {
        status.textContent = "That didn't go through. Try again in a minute.";
      }
    } catch {
      form.classList.remove('sending');
      status.textContent = "That didn't go through. Check your connection and try again.";
    }
    lock(false);
    send.disabled = false;
  });
}

function prepareDiagram() {
  const diagram = $('diagram');
  return CORNERS.map(([ax, ay], side) => {
    const [bx, by] = CORNERS[(side + 1) % 6];
    const bit = document.createElement('span');
    bit.className = 'bit';
    bit.textContent = toBits(0b011011)[side];
    if (bit.textContent === '1') bit.classList.add('on');
    bit.style.setProperty('--x', (((ax + bx) / 2) * 1.36).toFixed(3));
    bit.style.setProperty('--y', (((ay + by) / 2) * 1.36).toFixed(3));
    diagram.append(bit);
    return bit;
  });
}

async function startFlight() {
  const canvas = $('scene');
  let scene;
  try {
    scene = await createScene(canvas);
  } catch (error) {
    console.error(error);
  }
  if (!scene) {
    root.classList.remove('flight');
    return;
  }
  root.classList.add('scene');

  const { field } = scene;
  const [summitX, summitZ] = field.position(field.summit);
  const [logoX, logoZ] = field.position(field.logo);

  const bits = prepareDiagram();
  const diagram = $('diagram');
  const letter = $('diagram-letter');
  const captionMap = $('caption-map');
  const captionCell = $('caption-cell');
  const probeEl = $('probe');
  const story = $('story');
  const beliefs = $('beliefs');

  const base = { x: summitX, y: 0, z: summitZ, focus: 0, dim: calm ? 0.55 : 1, fog: 0, minor: 0.86, shiftX: 0, shiftY: 0, glow: -0.2 };
  const NUMERIC = ['x', 'y', 'z', 'azimuth', 'elevation', 'fov', 'lift', 'focus', 'dim', 'fog', 'minor', 'shiftX', 'shiftY', 'glow'];

  let keys = [];
  let width = 0;
  let height = 0;
  let quality = 1;
  let pixelRatio = 1;
  let storyTop = 0;
  let storyRun = 1;

  function fitCanvas() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const cap = width * height > 2.6e6 ? 1.5 : 2;
    pixelRatio = Math.max(1, Math.min(devicePixelRatio || 1, cap) * quality);
    scene.resize(width, height, pixelRatio);
  }

  function layout() {
    fitCanvas();

    const aspect = width / height;
    const fov = radians(30);
    const tan = Math.tan(fov / 2);
    const mapDistance = Math.max(27.5 / (2 * tan), 31.8 / (2 * tan * aspect)) * 1.1;
    const cellPixels = Math.min(width * 0.26, height * 0.2, 180);
    const cellDistance = (scene.radius / (cellPixels / (height / 2))) / tan;
    // Slides the map up so the cell clears the caption beneath it.
    const cellOffset = (height * 0.1) / (height / 2) * tan * cellDistance;

    const top = (el) => el.getBoundingClientRect().top + scrollY;
    const beliefsMiddle = top(beliefs) + beliefs.offsetHeight / 2 - innerHeight / 2;
    storyTop = top(story);
    storyRun = Math.max(1, story.offsetHeight - innerHeight);
    const end = root.scrollHeight - innerHeight;

    const wide = aspect > 1.15;
    const hero = { ...base, y: 3, distance: 23, azimuth: radians(155), elevation: radians(9.5), fov: radians(wide ? 27 : 36), lift: 1.3, fog: 0.024, shiftX: wide ? 0.26 : 0, shiftY: wide ? 0.02 : 0.12, glow: -0.09, at: 0 };
    const ridge = { ...base, x: summitX, y: 1.4, distance: 30, azimuth: radians(62), elevation: radians(32), fov: radians(34), lift: 1.15, dim: 0.46, fog: 0.018, shiftX: wide ? 0.5 : 0, shiftY: wide ? 0 : 0.2, at: beliefsMiddle };
    const map = { ...base, x: 0, z: 0, distance: mapDistance, azimuth: 0, elevation: radians(90), fov, lift: 0, minor: 0.34, shiftX: wide ? 0.2 : 0, shiftY: wide ? 0 : 0.14 };
    const cell = { ...base, x: logoX, z: logoZ + cellOffset, distance: cellDistance, azimuth: 0, elevation: radians(90), fov, lift: 0, focus: 1, minor: 0.34 };
    const farewell = { ...base, y: 2.6, distance: 25, azimuth: radians(-155), elevation: radians(3.5), fov: radians(24), lift: 1.3, dim: 0.85, fog: 0.024, shiftY: wide ? -0.84 : -0.86, glow: 0.06, at: Math.min(end, top($('form')) - innerHeight * 0.6) };

    keys = [
      hero,
      ridge,
      { ...map, at: storyTop },
      { ...map, at: storyTop + storyRun * 0.2 },
      { ...cell, at: storyTop + storyRun * 0.72, zoom: true },
      { ...cell, at: storyTop + storyRun },
      farewell,
    ];
    keys.forEach((key, i) => {
      key.at = Math.max(key.at, keys[i - 1]?.at ?? 0);
    });
  }

  function sample(y) {
    let i = 0;
    while (i < keys.length - 2 && y > keys[i + 1].at) i++;
    const [a, b] = [keys[i], keys[i + 1]];
    const t = ease(clamp01((y - a.at) / (b.at - a.at || 1)));
    const v = {};
    for (const name of NUMERIC) v[name] = lerp(a[name], b[name], t);
    v.distance = Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), t));
    if (b.zoom) {
      // Aim shrinks with distance, so the target cell stays put on screen as we dive.
      const w = (v.distance - b.distance) / (a.distance - b.distance);
      v.x = b.x + (a.x - b.x) * w;
      v.z = b.z + (a.z - b.z) * w;
    }
    return v;
  }

  const state = {
    probe: [summitX, summitZ],
    cell: [logoX, logoZ],
    time: 0,
    reveal: calm ? 2 : 0,
    probeOn: 0,
    pixelRatio: 1,
  };

  let probeCell = -1;
  let shownCell = -1;
  let probeUpdated = 0;
  const probeGlyph = $('probe-glyph');
  $('probe-ghost').setAttribute('d', hexPath(63, 0, 0, 11));

  function setProbe(cell) {
    if (cell < 0 || cell === probeCell) return;
    probeCell = cell;
    state.probe = field.position(cell);
  }

  // Follows the probe at a readable pace.
  function showProbe(now) {
    if (probeCell === shownCell || now - probeUpdated < 90) return;
    probeUpdated = now;
    shownCell = probeCell;

    const value = field.bits[probeCell];
    $('probe-bits').textContent = toBits(value);
    $('probe-char').textContent = ALPHABET[value];
    probeGlyph.setAttribute('d', hexPath(value, 0, 0, 11));
  }

  let pointer = null;
  let pointerMoved = -Infinity;
  let drift = [0, 0];
  addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      pointer = [event.clientX, event.clientY];
      pointerMoved = performance.now();
    },
    { passive: true },
  );

  let y = scrollY;
  let last = performance.now();
  let frames = 0;
  let frameTime = 0;

  function frame(now) {
    const elapsed = (now - last) / 1000;
    const dt = Math.min(0.05, elapsed);
    last = now;

    // Slow GPU: trade sharpness for smoothness.
    frameTime += dt;
    if (++frames === 50) {
      if (frameTime / frames > 0.03 && pixelRatio > 1) {
        quality *= 0.75;
        fitCanvas();
      }
      frames = 0;
      frameTime = 0;
    }

    state.time += dt;
    // Real time, so a slow device gets the same intro as a fast one.
    state.reveal = Math.min(state.reveal + elapsed / 3.4, 2);
    y = calm ? 0 : y + (scrollY - y) * (1 - Math.exp(-dt * 7));

    const v = sample(y);
    const hero = 1 - clamp01(y / (innerHeight * 0.7));

    const mouseActive = pointer && now - pointerMoved < 6000;
    const target = mouseActive ? [(pointer[0] / width) * 2 - 1, (pointer[1] / height) * 2 - 1] : [0, 0];
    drift = drift.map((d, i) => d + (target[i] - d) * (1 - Math.exp(-dt * 2.5)));
    v.azimuth += hero * (Math.sin(state.time * 0.08) * 0.03 + drift[0] * 0.035);
    v.elevation += hero * drift[1] * 0.012;

    scene.camera(v);

    if (hero > 0.05) {
      if (mouseActive && hero > 0.6) {
        setProbe(scene.pick(pointer[0], pointer[1], v.lift));
      } else {
        const t = state.time;
        setProbe(
          field.cellAt(
            summitX + Math.cos(t * 0.11) * 3.2 + Math.cos(t * 0.29) * 1.1,
            summitZ + Math.sin(t * 0.13) * 2.6 + Math.sin(t * 0.37) * 0.9,
          ),
        );
      }
      showProbe(now);
    }

    const intro = clamp01((state.reveal - 0.7) / 0.3);
    state.probeOn = hero * intro;
    state.lift = v.lift;
    state.focus = v.focus;
    state.dim = v.dim;
    state.fog = v.fog;
    state.minor = v.minor;
    state.glow = v.glow;
    state.pixelRatio = pixelRatio;
    scene.render(state);

    probeEl.style.opacity = state.probeOn;

    if (calm) return;

    const progress = clamp01((y - storyTop) / storyRun);
    captionMap.style.opacity = bump(progress, 0, 0.06, 0.24, 0.32);

    const glyphPosition = scene.project([logoX, 0, logoZ]);
    const edgePosition = scene.project([logoX + scene.radius, 0, logoZ]);
    const inView = v.focus > 0.98 && glyphPosition && edgePosition;
    diagram.style.opacity = inView ? 1 : 0;
    if (inView) {
      diagram.style.transform = `translate3d(${glyphPosition[0].toFixed(1)}px, ${glyphPosition[1].toFixed(1)}px, 0)`;
      diagram.style.setProperty('--r', (edgePosition[0] - glyphPosition[0]).toFixed(2));
    }
    bits.forEach((bit, i) => {
      bit.style.opacity = clamp01((progress - (0.74 + i * 0.026)) / 0.03);
    });
    letter.style.opacity = clamp01((progress - 0.9) / 0.05);
    captionCell.style.opacity = clamp01((progress - 0.88) / 0.08);

    requestAnimationFrame(frame);
  }

  layout();
  addEventListener('resize', layout);
  document.fonts.ready.then(layout);
  requestAnimationFrame(frame);

  if (calm) addEventListener('resize', () => requestAnimationFrame(frame));
}

if (!calm && 'WebGL2RenderingContext' in window) root.classList.add('flight');

introduceText();
prepareBeliefs();
prepareForm(prepareStream());
startFlight();
