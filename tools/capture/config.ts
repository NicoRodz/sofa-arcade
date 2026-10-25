import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const PORT = Number(process.env.PG_PORT ?? 3200),
  CDP = Number(process.env.PG_CDP ?? 9333);
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const what = process.argv[2] ?? 'all';
export const outDir = path.resolve(process.argv[3] ?? 'docs/screens');
mkdirSync(outDir, { recursive: true });
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
