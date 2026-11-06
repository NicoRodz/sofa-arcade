// Headless captures of the renderer: serves the harness with vite on :3530, drives it over CDP, saves PNGs and measures fps.
// usage: npx tsx games/obstaculos/screen/harness/capture.ts <outDir> [scenario ...]    scenarios: l1-2 l1-8 straggler biomes ents fps
// The scenarios live in capture-scenarios.ts and capture-campaign.ts; this file is the entrypoint (arguments, vite, Chrome, dispatch).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { killTree } from '../../../../tools/proc/kill-tree';
import { shotsA5, shotsA6OrLayer } from './capture-campaign';
import { Cdp, sleep, type Ctx } from './capture-cdp';
import {
  measureFps,
  shotsBiomes,
  shotsEnts,
  shotsL12,
  shotsL18,
  shotsPoses,
  shotsRig,
  shotsSpread8,
  shotsStraggler,
} from './capture-scenarios';

const PORT = Number(process.env.PORT ?? 3530),
  CDP = Number(process.env.CDP ?? 9533); // the campaign sessions use PORT=4200 CDP=9710
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = path.resolve(process.argv[2] ?? 'shots');
const which = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });

// In the order they run.
const SCENARIOS: [string, (ctx: Ctx) => Promise<void>][] = [
  ['l1-2', shotsL12],
  ['l1-8', shotsL18],
  ['straggler', shotsStraggler],
  ['rig', shotsRig],
  ['spread8', shotsSpread8],
  ['poses', shotsPoses],
  ['biomes', shotsBiomes],
  ['ents', shotsEnts],
  ['a5', shotsA5],
  ['a6', (ctx) => shotsA6OrLayer(ctx, 'a6')],
  ['layer', (ctx) => shotsA6OrLayer(ctx, 'layer')],
  ['fps', measureFps],
];

async function main() {
  const vite = spawn('npx', ['vite', 'games/obstaculos/screen/harness', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });
  vite.stderr?.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  const profile = mkdtempSync(path.join(tmpdir(), 'obst-chrome-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP}`,
      `--user-data-dir=${profile}`,
      '--window-size=1920,1080',
      '--hide-scrollbars',
      '--no-first-run',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  try {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/`);
        if (r.ok) break;
      } catch {
        /* not yet */
      }
      await sleep(500);
    }
    let target: any;
    for (let i = 0; i < 40 && !target; i++) {
      try {
        const l = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()) as any[];
        target = l.find((t) => t.type === 'page');
      } catch {
        /* not yet */
      }
      if (!target) await sleep(300);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.on('open', r));
    const cdp = new Cdp(ws, outDir);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    for (let i = 0; i < 80; i++) {
      if (await cdp.eval<boolean>('!!(window.obst && window.obst.scene && window.obst.scene.sys.isActive())').catch(() => false)) break;
      await sleep(250);
    }
    console.log(
      'renderer',
      await cdp.eval(
        'window.obst.game.renderer.type === 2 ? "WEBGL" : window.obst.game.renderer.type === 1 ? "CANVAS" : String(window.obst.game.renderer.type)',
      ),
    );
    const run = (name: string) => !which.length || which.includes(name);
    for (const [name, scenario] of SCENARIOS) if (run(name)) await scenario({ cdp });
    ws.close();
  } finally {
    await killTree(chrome);
    await killTree(vite);
  }
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
