// Minimal PNG tools for the visual regression test (no dependency): decode what Chrome writes (8-bit RGB/RGBA, not interlaced),
// halve the resolution with a box filter, compare two images exactly and encode a readable diff image.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(png: Buffer): Raster {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, color, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6))
        throw new Error(`unsupported PNG (depth ${depth}, color ${color}, interlace ${interlace})`);
      channels = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(body);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let v = line[i]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = cur[x * channels]!;
      data[o + 1] = cur[x * channels + 1]!;
      data[o + 2] = cur[x * channels + 2]!;
      data[o + 3] = channels === 4 ? cur[x * channels + 3]! : 255;
    }
    prev.set(cur);
  }
  return { width, height, data };
}

const chunk = (type: string, body: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
};

/** RGB PNG (alpha dropped: Chrome shots are opaque), per-row adaptive filter (the one with the smallest sum of absolute residuals) + maximum deflate. */
export function encodePng(img: Raster): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = img.width * 3;
  const rgb = new Uint8Array(stride * img.height);
  for (let p = 0; p < img.width * img.height; p++) {
    rgb[p * 3] = img.data[p * 4]!;
    rgb[p * 3 + 1] = img.data[p * 4 + 1]!;
    rgb[p * 3 + 2] = img.data[p * 4 + 2]!;
  }
  const raw = Buffer.alloc((stride + 1) * img.height);
  const tries = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < img.height; y++) {
    let best = 0;
    let bestCost = Infinity;
    for (let f = 0; f < 5; f++) {
      let cost = 0;
      for (let i = 0; i < stride; i++) {
        const x = rgb[y * stride + i]!;
        const a = i >= 3 ? rgb[y * stride + i - 3]! : 0;
        const b = y ? rgb[(y - 1) * stride + i]! : 0;
        const c = y && i >= 3 ? rgb[(y - 1) * stride + i - 3]! : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const r = (x - pred) & 255;
        tries[f]![i] = r;
        cost += r < 128 ? r : 256 - r;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    raw.set(tries[best]!, y * (stride + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** 1/k of the width and height: each output pixel is the rounded mean of a k x k block (integer math, so it stays deterministic). Keeps a golden small enough for the repo. */
export function downscale(img: Raster, k: number): Raster {
  const width = Math.floor(img.width / k);
  const height = Math.floor(img.height / k);
  const data = new Uint8Array(width * height * 4);
  const half = (k * k) >> 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 4; c++) {
        let sum = half;
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) sum += img.data[((k * y + dy) * img.width + k * x + dx) * 4 + c]!;
        data[(y * width + x) * 4 + c] = Math.floor(sum / (k * k));
      }
  return { width, height, data };
}

export interface Comparison {
  /** Pixels whose RGB differs at all. */
  differing: number;
  /** Largest per-channel difference seen (0 when identical). */
  maxDelta: number;
  /** Bounding box of the differing pixels, null when identical. */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
}

export function compare(golden: Raster, actual: Raster): Comparison {
  if (golden.width !== actual.width || golden.height !== actual.height)
    throw new Error(`size differs: golden ${golden.width}x${golden.height}, actual ${actual.width}x${actual.height}`);
  let differing = 0;
  let maxDelta = 0;
  let box: Comparison['box'] = null;
  for (let p = 0; p < golden.width * golden.height; p++) {
    const d = Math.max(
      Math.abs(golden.data[p * 4]! - actual.data[p * 4]!),
      Math.abs(golden.data[p * 4 + 1]! - actual.data[p * 4 + 1]!),
      Math.abs(golden.data[p * 4 + 2]! - actual.data[p * 4 + 2]!),
    );
    if (d === 0) continue;
    differing++;
    maxDelta = Math.max(maxDelta, d);
    const x = p % golden.width;
    const y = (p / golden.width) | 0;
    box = box
      ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) }
      : { x0: x, y0: y, x1: x, y1: y };
  }
  return { differing, maxDelta, box };
}

/** Three panels side by side: golden | actual | diff (golden dimmed to 25 %, every differing pixel in magenta, plus a 1 px frame around the differing box). */
export function diffImage(golden: Raster, actual: Raster, box: Comparison['box']): Raster {
  const { width: w, height: h } = golden;
  const out = new Uint8Array(w * 3 * h * 4).fill(255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const put = (panel: number, r: number, g: number, b: number) => {
        const o = (y * w * 3 + panel * w + x) * 4;
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
      };
      put(0, golden.data[s]!, golden.data[s + 1]!, golden.data[s + 2]!);
      put(1, actual.data[s]!, actual.data[s + 1]!, actual.data[s + 2]!);
      const same =
        golden.data[s] === actual.data[s] && golden.data[s + 1] === actual.data[s + 1] && golden.data[s + 2] === actual.data[s + 2];
      if (same) put(2, golden.data[s]! >> 2, golden.data[s + 1]! >> 2, golden.data[s + 2]! >> 2);
      else put(2, 255, 0, 255);
      if (
        box &&
        x >= box.x0 - 3 &&
        x <= box.x1 + 3 &&
        y >= box.y0 - 3 &&
        y <= box.y1 + 3 &&
        (x <= box.x0 - 2 || x >= box.x1 + 2 || y <= box.y0 - 2 || y >= box.y1 + 2)
      )
        put(2, 255, 255, 0);
    }
  return { width: w * 3, height: h, data: out };
}
