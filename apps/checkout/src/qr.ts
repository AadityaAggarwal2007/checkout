/**
 * A small QR code encoder (ISO 18004): byte mode, error correction level M, versions 1-40, best mask
 * by the standard penalty rules. Written here so the checkout page needs no CDN or library for the
 * UPI QR. qrMatrix() is pure (no DOM) so it is unit-tested in node; qrPath() turns a matrix into one
 * SVG path, drawn by the view with setAttribute (never innerHTML).
 */

/** Error correction codewords per block, level M, by version (index 0 unused). */
export const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 30, 30, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
/** Number of error correction blocks, level M, by version. */
export const EC_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

export const sizeOf = (version: number): number => version * 4 + 17;

/** Codewords (8 bits each) a version holds in all, data and error correction together. */
export function rawCodewords(version: number): number {
  let bits = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const n = Math.floor(version / 7) + 2;
    bits -= (25 * n - 10) * n - 55;
    if (version >= 7) bits -= 36;
  }
  return Math.floor(bits / 8);
}

export const dataCodewords = (version: number): number => rawCodewords(version) - EC_PER_BLOCK[version]! * EC_BLOCKS[version]!;

/** Centres of the alignment patterns along one axis (none for version 1). */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const size = sizeOf(version);
  const step = version === 32 ? 26 : Math.ceil((size - 13) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// ---------------------------------------------------------------- Reed-Solomon over GF(256), 0x11D

export function gfMul(a: number, b: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((b >>> i) & 1) * a;
  }
  return z & 0xff;
}

/** Generator polynomial (x - a^0)(x - a^1)…, highest power first with the leading 1 dropped. */
function rsGenerator(degree: number): number[] {
  const g = new Array<number>(degree).fill(0);
  g[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      g[j] = gfMul(g[j]!, root) ^ (j + 1 < degree ? g[j + 1]! : 0);
    }
    root = gfMul(root, 2);
  }
  return g;
}

/** The `degree` error correction codewords for these data codewords. */
export function rsRemainder(data: number[], degree: number): number[] {
  const g = rsGenerator(degree);
  const out = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ out.shift()!;
    out.push(0);
    for (let i = 0; i < degree; i++) out[i] = out[i]! ^ gfMul(g[i]!, factor);
  }
  return out;
}

// ---------------------------------------------------------------- data

const bytesOf = (text: string): number[] => Array.from(new TextEncoder().encode(text));

/** Smallest version whose data area holds `len` bytes in byte mode (count field: 8 bits up to v9, 16 after). */
export function versionFor(len: number): number {
  for (let v = 1; v <= 40; v++) {
    const bits = 4 + (v <= 9 ? 8 : 16) + 8 * len;
    if (bits <= dataCodewords(v) * 8) return v;
  }
  throw new Error('text too long for a QR code');
}

/** Data codewords: mode, count, bytes, terminator, padding to the version's capacity. */
export function dataBits(bytes: number[], version: number): number[] {
  const bits: number[] = [];
  const push = (value: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  return out;
}

/** Splits into blocks, adds the error correction of each, interleaves as the symbol wants them. */
export function interleave(data: number[], version: number): number[] {
  const blocks = EC_BLOCKS[version]!;
  const ecLen = EC_PER_BLOCK[version]!;
  const total = rawCodewords(version);
  const shortBlocks = blocks - (total % blocks);
  const shortLen = Math.floor(total / blocks) - ecLen;
  const parts: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const len = shortLen + (i < shortBlocks ? 0 : 1);
    const d = data.slice(k, k + len);
    k += len;
    const ec = rsRemainder(d, ecLen);
    if (i < shortBlocks) d.push(-1); // placeholder so every block has the same length when interleaving
    parts.push(d.concat(ec));
  }
  const out: number[] = [];
  for (let i = 0; i < parts[0]!.length; i++) for (const p of parts) if (p[i] !== -1) out.push(p[i]!);
  return out;
}

// ---------------------------------------------------------------- the symbol

export type Matrix = boolean[][];

/** Format information (level M = 00, mask 0-7) with its BCH code, as 15 bits. */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Version information (versions 7+) with its BCH code, 18 bits. */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

const grid = (size: number): Matrix => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

/**
 * Draws the function patterns into `m` and marks them in `fn`; format bits for `mask`.
 * The function-module map is what the data placement and the masks skip.
 */
export function drawFunctions(m: Matrix, fn: Matrix, version: number, mask: number): void {
  const size = m.length;
  const set = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    m[y]![x] = dark;
    fn[y]![x] = true;
  };
  // Timing patterns.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Finder patterns with their separators.
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  // Alignment patterns (not over the finders).
  const pos = alignmentPositions(version);
  for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i]! + dx, pos[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Format bits, twice.
  const f = formatBits(mask);
  const bit = (i: number) => ((f >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the always-dark module
  // Version bits, twice (versions 7+).
  if (version >= 7) {
    const v = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((v >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
}

/** The order data modules are filled: two-column zigzag from the bottom right, skipping column 6. */
export function placementOrder(fn: Matrix): Array<[number, number]> {
  const size = fn.length;
  const out: Array<[number, number]> = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y]![x]) out.push([x, y]);
      }
    }
  }
  return out;
}

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The standard penalty score (lower reads better): long runs, 2x2 blocks, finder-like patterns, dark balance. */
export function penalty(m: Matrix): number {
  const size = m.length;
  let score = 0;
  const line = (get: (i: number) => boolean): string => {
    let s = '';
    let run = 0;
    for (let i = 0; i < size; i++) {
      s += get(i) ? '1' : '0';
      if (i > 0 && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
    return s;
  };
  for (let i = 0; i < size; i++) {
    for (const s of [line((j) => m[i]![j]!), line((j) => m[j]![i]!)]) {
      // A finder-like 1:1:3:1:1 pattern with a light quiet zone on either side.
      score += 40 * (s.match(/(?=00001011101|10111010000)/g)?.length ?? 0);
    }
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = m[y]![x];
    if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) score += 3;
  }
  let dark = 0;
  for (const row of m) for (const d of row) if (d) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return score + k * 10;
}

/** The QR symbol of `text` as a square matrix of dark modules (true = dark). */
export function qrMatrix(text: string): Matrix {
  const bytes = bytesOf(text);
  const version = versionFor(bytes.length);
  const codewords = interleave(dataBits(bytes, version), version);
  const size = sizeOf(version);
  let best: Matrix | undefined;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = grid(size);
    const fn = grid(size);
    drawFunctions(m, fn, version, mask);
    const order = placementOrder(fn);
    const f = MASKS[mask]!;
    for (let i = 0; i < order.length; i++) {
      const [x, y] = order[i]!;
      const bit = i < codewords.length * 8 ? ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1 : false; // remainder bits are 0
      m[y]![x] = bit !== f(x, y);
    }
    const score = penalty(m);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best!;
}

/** One SVG path (in module units) covering every dark module; viewBox = "0 0 size size". */
export function qrPath(m: Matrix): string {
  const parts: string[] = [];
  for (let y = 0; y < m.length; y++) {
    const row = m[y]!;
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (row[x + w]) w++;
      parts.push(`M${x} ${y}h${w}v1h-${w}z`);
      x += w - 1;
    }
  }
  return parts.join('');
}

/** The QR as an <svg> element (quiet zone of 2 modules); only numbers reach the attributes. */
export function qrSvg(text: string, px: number): SVGElement {
  const m = qrMatrix(text);
  const q = 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${-q} ${-q} ${m.length + 2 * q} ${m.length + 2 * q}`);
  svg.setAttribute('width', String(px));
  svg.setAttribute('height', String(px));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'UPI QR code');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', qrPath(m));
  path.setAttribute('fill', '#000');
  svg.appendChild(path);
  return svg;
}
