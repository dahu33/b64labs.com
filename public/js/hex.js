// One base64 character is six bits. One hexagon has six sides.
// Sides are numbered clockwise from the top; side 0 is the most significant bit.

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const S = Math.sqrt(3) / 2;

// Clockwise from top-left. Side i joins corner i to corner i + 1.
export const CORNERS = [
  [-0.5, -S],
  [0.5, -S],
  [1, 0],
  [0.5, S],
  [-0.5, S],
  [-1, 0],
];

export const encode = (text) => {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const toBits = (value) => value.toString(2).padStart(6, '0');

// SVG path for the lit sides of a hexagon. Neighbouring lit sides share a joint.
export function hexPath(value, x, y, r) {
  const lit = (i) => (value >> (5 - (i % 6))) & 1;
  const point = (i) => {
    const [cx, cy] = CORNERS[i % 6];
    return `${+(x + cx * r).toFixed(2)} ${+(y + cy * r).toFixed(2)}`;
  };

  if (value === 63) return `M${[0, 1, 2, 3, 4, 5].map(point).join('L')}Z`;

  let d = '';
  const first = [0, 1, 2, 3, 4, 5].find((i) => !lit(i));
  for (let i = first + 1; i < first + 6; i++) {
    if (!lit(i)) continue;
    if (!lit(i + 5)) d += `M${point(i)}`;
    d += `L${point(i + 1)}`;
  }
  return d;
}
