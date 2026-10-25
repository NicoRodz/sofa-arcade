// Bundles measure.ts, serves it on port 3540, runs it in headless Chrome and prints the JSON it posts back.
// Foreground: Chrome is killed (SIGTERM, then SIGKILL) when the result arrives. Usage: node run.mjs
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'obst-measure-'));
await build({ entryPoints: [join(here, 'measure.ts')], bundle: true, format: 'iife', outfile: join(dir, 'm.js'), logLevel: 'warning' });
const PORT = 3540;
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const result = new Promise((resolve) => {
  const srv = createServer((req, res) => {
    if (req.method === 'POST') {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        res.end('ok');
        resolve(b);
      });
      return;
    }
    res.setHeader('content-type', req.url?.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(
      req.url?.endsWith('.js') ? readFileSync(join(dir, 'm.js')) : '<!doctype html><meta charset=utf-8><script src="/m.js"></script>',
    );
  }).listen(PORT);
});
const proc = spawn(
  chrome,
  ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${join(dir, 'profile')}`, `http://localhost:${PORT}/`],
  { stdio: 'ignore' },
);
const timer = setTimeout(() => {
  console.error('timeout');
  cleanup(1);
}, 180000);
function cleanup(code) {
  clearTimeout(timer);
  try {
    const pids = execSync(`pgrep -f ${join(dir, 'profile')} || true`)
      .toString()
      .split('\n')
      .filter(Boolean);
    for (const p of pids)
      try {
        process.kill(Number(p), 'SIGTERM');
      } catch {}
    setTimeout(() => {
      for (const p of pids)
        try {
          process.kill(Number(p), 'SIGKILL');
        } catch {}
      process.exit(code);
    }, 500);
  } catch {
    process.exit(code);
  }
}
const r = await result;
console.log(r);
cleanup(String(r).startsWith('ERROR') ? 1 : 0);
