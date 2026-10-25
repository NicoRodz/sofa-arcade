import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const PORT = Number(process.env.PORT ?? 3700),
  CDP = Number(process.env.PG_CDP_PORT ?? 9444 + (PORT % 50));
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const what = process.argv[2] ?? 'play';
export const N = Number(process.argv[3] ?? 4);
export const outDir = path.resolve(process.argv[4] ?? 'docs/screens/obst');
mkdirSync(outDir, { recursive: true });
export const MODE = (process.env.MODE ?? 'free') as 'free' | 'chain';
export const LEVEL = Number(process.env.LEVEL ?? 1);
export const DIFF = process.env.DIFF ?? 'normal';
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
