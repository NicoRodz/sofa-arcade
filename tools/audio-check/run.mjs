// Offline render check of every sound in headless Chrome (CDP on port 3300).
// Usage: node tools/audio-check/run.mjs
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const out = join(tmpdir(), 'audio-check');
mkdirSync(out, { recursive: true });
for (const name of ['check', 'smoke']) {
  execFileSync('npx', ['esbuild', `tools/audio-check/${name}.ts`, '--bundle', '--format=iife', '--target=es2022', `--outfile=${out}/${name}.js`, '--log-level=warning'], { cwd: root, stdio: 'inherit' });
  writeFileSync(join(out, `${name}.html`), `<!doctype html><meta charset=utf-8><body><pre id=out></pre><script src="${name}.js"></script></body>`);
}

const PORT = 3300;
const profile = join(out, 'profile');
rmSync(profile, { recursive: true, force: true }); // a stale profile keeps the saved mute flag
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
  await send('Page.navigate', { url: `file://${out}/check.html` });
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

  // Integration smoke: real AudioContext, real gesture events.
  await send('Page.navigate', { url: `file://${out}/smoke.html` });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: `window.__smoke.${expr}`, returnByValue: true })).result?.result?.value;
  for (let i = 0; i < 20 && (await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.result.value !== 'ready'; i++) await sleep(250);
  const log = [];
  const check = (name, got, want) => { log.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) }); };
  check('before click: context state', await ev('state()'), 'suspended');
  check('before click: hint', await ev('hint()'), 'Haz clic para activar el sonido');
  await send('Runtime.evaluate', { expression: 'window.__smoke.emit("itemPicked", {player:1,item:"raw0",from:"crate"})' });
  const silent = await ev('oscillators()');
  check('events before unlock make no sound', silent, 0);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 10, y: 10, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 10, y: 10, button: 'left', clickCount: 1 });
  await sleep(600);
  check('after click: context state', await ev('state()'), 'running');
  check('after click: hint hidden', await ev('hint()'), '');
  const base = await ev('oscillators()');
  await sleep(500);
  const lobbyMusic = (await ev('oscillators()')) - base;
  check('lobby music schedules notes (oscillators in 0.5 s > 0)', lobbyMusic > 0, true);
  await send('Runtime.evaluate', { expression: 'window.__smoke.play()' });
  const before = await ev('oscillators()');
  await send('Runtime.evaluate', { expression: 'window.__smoke.emit("delivered", {player:1,points:20,tip:0})' });
  check('delivered event makes sound', (await ev('oscillators()')) - before >= 4, true);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'm', code: 'KeyM', text: 'm', windowsVirtualKeyCode: 77 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 });
  await sleep(100);
  check('M: hint says muted', await ev('hint()'), 'Sonido silenciado (M)');
  check('M: persisted', await ev('muted()'), '1');
  console.table(log);
  if (log.some((l) => !l.ok)) process.exitCode = 1;
} finally {
  await cleanup();
}
