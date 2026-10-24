// Offline render check of every sound in headless Chrome (CDP on port 3300).
// Usage: node tools/audio-check/run.mjs
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const out = join(tmpdir(), 'audio-check');
mkdirSync(out, { recursive: true });
execFileSync('npx', ['esbuild', 'tools/audio-check/check.ts', '--bundle', '--format=iife', '--target=es2022', `--outfile=${out}/check.js`, '--log-level=warning'], { cwd: root, stdio: 'inherit' });
writeFileSync(join(out, 'index.html'), '<!doctype html><meta charset=utf-8><body><pre id=out></pre><script src="check.js"></script></body>');

const PORT = 3300;
const profile = join(out, 'profile');
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = async () => {
  chrome.kill('SIGTERM');
  await sleep(500);
  try { execFileSync('pkill', ['-9', '-f', profile]); } catch { /* nothing left */ }
};
try {
  let pages;
  for (let i = 0; i < 50 && !pages; i++) {
    try { pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); }
  }
  const ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); };
  const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.navigate', { url: `file://${out}/index.html` });
  let result = '';
  for (let i = 0; i < 120 && !result; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: 'document.title === "done" ? document.getElementById("out").textContent : ""', returnByValue: true });
    result = r.result?.result?.value ?? '';
  }
  if (!result) throw new Error('no result from page');
  const rows = JSON.parse(result);
  console.table(rows);
  const bad = rows.filter((r) => r.nan || r.peak <= 0 || r.peak >= 1);
  if (bad.length) { console.error('FAIL', bad.map((r) => r.name)); process.exitCode = 1; }
} finally {
  await cleanup();
}
