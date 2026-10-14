import { describe, expect, it } from 'vitest';
import {
  EC_BLOCKS,
  EC_PER_BLOCK,
  alignmentPositions,
  dataBits,
  dataCodewords,
  drawFunctions,
  formatBits,
  gfMul,
  interleave,
  placementOrder,
  qrMatrix,
  qrPath,
  rawCodewords,
  rsRemainder,
  sizeOf,
  versionBits,
  versionFor,
  type Matrix,
} from '../src/qr.js';

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

const grid = (size: number): Matrix => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

/** c(x) evaluated at every root a^0..a^(deg-1) must be 0 for a valid Reed-Solomon codeword. */
function syndromesZero(codeword: number[], degree: number): boolean {
  let root = 1;
  for (let i = 0; i < degree; i++) {
    let acc = 0;
    for (const c of codeword) acc = gfMul(acc, root) ^ c;
    if (acc !== 0) return false;
    root = gfMul(root, 2);
  }
  return true;
}

/**
 * Reads a symbol back the way a scanner would (without error correction): format info, unmask,
 * zigzag, de-interleave, check every block's Reed-Solomon code, then the byte-mode payload.
 */
function decode(m: Matrix): { version: number; mask: number; text: string } {
  const size = m.length;
  const version = (size - 17) / 4;
  // Format bits (first copy) and their BCH check.
  const bits = [...Array(6).keys()].map((i) => m[i]![8]!).concat([m[7]![8]!, m[8]![8]!, m[8]![7]!], [...Array(6).keys()].map((i) => m[8]![5 - i]!));
  let f = 0;
  bits.forEach((b, i) => (f |= (b ? 1 : 0) << i));
  const second = [...Array(8).keys()].map((i) => m[8]![size - 1 - i]!).concat([...Array(7).keys()].map((i) => m[size - 7 + i]![8]!));
  expect(second).toEqual(bits);
  const unmasked = f ^ 0x5412;
  let rem = unmasked;
  for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  expect(rem).toBe(0);
  expect((unmasked >>> 13) & 3).toBe(0); // level M
  const mask = (unmasked >>> 10) & 7;
  // Function modules of this version (the same drawing routine), then the data in zigzag order.
  const fn = grid(size);
  drawFunctions(grid(size), fn, version, mask);
  const order = placementOrder(fn);
  const total = rawCodewords(version);
  const raw: number[] = [];
  for (let i = 0; i < total * 8; i++) {
    const [x, y] = order[i]!;
    const bit = m[y]![x] !== MASKS[mask]!(x, y);
    if (i % 8 === 0) raw.push(0);
    raw[raw.length - 1] = (raw[raw.length - 1]! << 1) | (bit ? 1 : 0);
  }
  // De-interleave into blocks.
  const blocks = EC_BLOCKS[version]!;
  const ecLen = EC_PER_BLOCK[version]!;
  const shortBlocks = blocks - (total % blocks);
  const shortLen = Math.floor(total / blocks) - ecLen;
  const parts: number[][] = Array.from({ length: blocks }, () => []);
  let k = 0;
  for (let col = 0; col <= shortLen + ecLen; col++) {
    for (let b = 0; b < blocks; b++) {
      if (col === shortLen && b < shortBlocks) continue;
      parts[b]!.push(raw[k++]!);
    }
  }
  expect(k).toBe(total);
  const data: number[] = [];
  for (const p of parts) {
    expect(syndromesZero(p, ecLen)).toBe(true);
    data.push(...p.slice(0, p.length - ecLen));
  }
  // Byte mode payload.
  let pos = 0;
  const read = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++, pos++) v = (v << 1) | ((data[pos >>> 3]! >>> (7 - (pos & 7))) & 1);
    return v;
  };
  expect(read(4)).toBe(0b0100);
  const len = read(version <= 9 ? 8 : 16);
  const bytes = Array.from({ length: len }, () => read(8));
  return { version, mask, text: new TextDecoder().decode(new Uint8Array(bytes)) };
}

describe('QR tables', () => {
  it('codeword counts match the standard', () => {
    expect([1, 2, 7, 10, 40].map(rawCodewords)).toEqual([26, 44, 196, 346, 3706]);
    expect([1, 2, 10, 40].map(dataCodewords)).toEqual([16, 28, 216, 2334]);
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(formatBits(0)).toBe(0x5412);
    expect(formatBits(1)).toBe(0x5125);
    expect(versionBits(7)).toBe(0x07c94);
    expect(versionBits(10)).toBe(0x0a4d3);
  });

  it('picks the smallest version that holds the bytes', () => {
    expect(versionFor(10)).toBe(1);
    expect(versionFor(14)).toBe(1); // 16 data codewords = 128 bits; 4 + 8 + 14 * 8 = 124
    expect(versionFor(15)).toBe(2);
    expect(versionFor(213)).toBe(10);
    expect(versionFor(300)).toBe(13);
    expect(() => versionFor(3000)).toThrow(/too long/);
  });
});

describe('Reed-Solomon', () => {
  it('matches the published 1-M "HELLO WORLD" example', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('every block it makes has zero syndromes', () => {
    for (let v = 1; v <= 40; v += 3) {
      const bytes = Array.from({ length: dataCodewords(v) - 3 }, (_, i) => (i * 37 + v) & 0xff);
      const cw = interleave(dataBits(bytes, v), v);
      expect(cw).toHaveLength(rawCodewords(v));
    }
    const d = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    expect(syndromesZero(d.concat(rsRemainder(d, 10)), 10)).toBe(true);
    expect(syndromesZero(d.concat(rsRemainder(d, 10)).map((x, i) => (i === 3 ? x ^ 1 : x)), 10)).toBe(false);
  });

  it('pads the data with the terminator and EC/11 bytes', () => {
    expect(dataBits([0x41], 1)).toEqual([0x40, 0x14, 0x10, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec]);
  });
});

describe('QR symbol', () => {
  const texts = [
    'A',
    'HELLO WORLD',
    'upi://pay?pa=merchant@payu&pn=Kurtiya&tr=ckABCDEF123456&am=147.80&cu=INR&tn=Order%20at%20Kurtiya',
    'upi://pay?pa=payu.merchant.0123456789@hdfcbank&pn=Some%20Long%20Store%20Name%20Private%20Limited&tr=ckABCDEF123456&tid=403993715&am=12345.67&cu=INR&tn=Order%20CK1001%20at%20Some%20Long%20Store%20Name&mc=5691&url=https%3A%2F%2Fexample.com%2Fcheckout%2Freturn%2FckABCDEF123456&mode=04&purpose=00&orgid=000000&sign=MEUCIQDexampleexampleexampleexampleexampleexample',
    'नमस्ते 😀',
  ];
  it.each(texts)('encodes and reads back %s', (text) => {
    const m = qrMatrix(text);
    const version = versionFor(new TextEncoder().encode(text).length);
    expect(m).toHaveLength(sizeOf(version));
    const out = decode(m);
    expect(out.version).toBe(version);
    expect(out.mask).toBeGreaterThanOrEqual(0);
    expect(out.mask).toBeLessThan(8);
    expect(out.text).toBe(text);
  });

  it('has the three finder patterns, the timing patterns and the dark module', () => {
    const m = qrMatrix('upi://pay?pa=x@y&am=1.00');
    const size = m.length;
    const finder = (ox: number, oy: number) => {
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
        const edge = dx === 0 || dy === 0 || dx === 6 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        expect(m[oy + dy]![ox + dx]).toBe(edge || core);
      }
    };
    finder(0, 0);
    finder(size - 7, 0);
    finder(0, size - 7);
    for (let i = 8; i < size - 8; i++) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
    expect(m[size - 8]![8]).toBe(true);
  });

  it('draws one path rectangle per run of dark modules', () => {
    expect(qrPath([[true, true, false], [false, true, false], [false, false, false]])).toBe('M0 0h2v1h-2zM1 1h1v1h-1z');
    expect(qrPath([[false]])).toBe('');
  });
});
