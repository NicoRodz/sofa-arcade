// Headless captures of the renderer: serves the harness with vite on :3530, drives it over CDP, saves PNGs and measures fps.
// usage: npx tsx screen/src/games/obstaculos/harness/capture.ts <outDir> [scenario ...]    scenarios: l1-2 l1-8 straggler biomes ents fps
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const PORT = Number(process.env.PORT ?? 3530),
  CDP = Number(process.env.CDP ?? 9533); // the campaign sessions use PORT=4200 CDP=9710
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = path.resolve(process.argv[2] ?? 'shots');
const which = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function descendants(pid: number): number[] {
  const rows = execSync('ps -A -o pid=,ppid=')
    .toString()
    .trim()
    .split('\n')
    .map((l) => l.trim().split(/\s+/).map(Number));
  const out: number[] = [];
  const walk = (p: number) => {
    for (const [c, pp] of rows)
      if (pp === p && c !== undefined) {
        out.push(c);
        walk(c);
      }
  };
  walk(pid);
  return out;
}
async function killTree(proc: ChildProcess) {
  if (!proc.pid) return;
  const pids = [proc.pid, ...descendants(proc.pid)];
  for (const p of pids) {
    try {
      process.kill(p, 'SIGTERM');
    } catch {
      /* gone */
    }
  }
  await sleep(700);
  for (const p of pids) {
    try {
      process.kill(p, 0);
      process.kill(p, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  constructor(private ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m);
        this.pending.delete(m.id);
      } else if (m.method === 'Runtime.exceptionThrown')
        console.error(
          'PAGE ERROR',
          JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 800),
        );
      else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
        console.error(
          'PAGE',
          m.params.type,
          m.params.args
            .map((a: any) => a.value ?? a.description)
            .join(' ')
            .slice(0, 400),
        );
    });
  }
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval<T = unknown>(expr: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value as T;
  }
  async shot(name: string, clip?: { x: number; y: number; width: number; height: number; scale: number }) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
    const file = path.join(outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('saved', file);
  }
}

const start = (o: object) => `window.obst.start(${JSON.stringify(o)})`;
const stateOf = `(() => { const w = window.obst.world(); const r = window.obst.scene.view.camera.result; return { t: +w.timeSec.toFixed(2), zoom: +r.state.zoom.toFixed(3), cx: Math.round(r.state.cx), focus: r.focus, off: r.offscreen.map(o => o.id), due: window.obst.scene.view.bubbleDue, players: w.players.map(p => [p.id, Math.round(p.x), Math.round(p.y), p.bubble ? p.bubble.phase : p.dead ? 'dead' : 'ok']) }; })()`;

async function main() {
  const vite = spawn('npx', ['vite', 'screen', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
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
        const r = await fetch(`http://127.0.0.1:${PORT}/screen/`);
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
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/src/games/obstaculos/harness/index.html` });
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
    const wait = async (cond: string, ms = 20000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await cdp.eval<boolean>(cond)) return true;
        await sleep(100);
      }
      return false;
    };

    if (run('l1-2')) {
      await cdp.eval(start({ level: 1, n: 2, mode: 'chain', bots: true }));
      await sleep(400);
      await cdp.eval('window.obst.ff(1.5)');
      await cdp.shot('l1-2p-start');
      await cdp.eval('window.obst.ff(6)');
      await sleep(200);
      await cdp.shot('l1-2p-run');
      console.log(JSON.stringify(await cdp.eval(stateOf)));
    }
    if (run('l1-8')) {
      await cdp.eval(start({ level: 1, n: 8, mode: 'chain', bots: true }));
      await sleep(400);
      await cdp.eval('window.obst.ff(2.5)');
      await sleep(200);
      await cdp.shot('l1-8p-start');
      await cdp.eval('window.obst.ff(7)');
      await sleep(200);
      await cdp.shot('l1-8p-run');
      console.log(JSON.stringify(await cdp.eval(stateOf)));
      await cdp.eval('window.obst.ff(10)');
      await sleep(200);
      await cdp.shot('l1-8p-wall');
      console.log(JSON.stringify(await cdp.eval(stateOf)));
    }
    if (run('straggler')) {
      await cdp.eval(start({ level: 1, n: 4, mode: 'free', bots: true, idle: [3], long: true }));
      await sleep(400);
      // the idle player stays at the start; the three others run ahead and the picture follows them
      let got = false;
      for (let i = 0; i < 400 && !got; i++) {
        await cdp.eval('window.obst.ff(0.1)');
        got = await cdp.eval<boolean>('window.obst.scene.view.camera.result.offscreen.length > 0');
      }
      await sleep(150);
      await cdp.shot('straggler-arrow');
      console.log(JSON.stringify(await cdp.eval(stateOf)));
      await cdp.eval('window.obst.ff(1.2)');
      await sleep(120);
      await cdp.shot('straggler-arrow-urgent');
      let fly = false;
      for (let i = 0; i < 100 && !fly; i++) {
        await cdp.eval('window.obst.ff(0.1)');
        fly = await cdp.eval<boolean>('window.obst.world().players[3].bubble !== null');
      }
      for (let i = 0; i < 200; i++) {
        await cdp.eval('window.obst.ff(0.1)');
        if (
          await cdp.eval<boolean>(
            '(() => { const w = window.obst.world(), r = window.obst.scene.view.camera.result.rect, p = w.players[3]; return p.bubble && p.x > r.x + 150 && p.x < r.x + r.w - 150; })()',
          )
        )
          break;
      }
      await sleep(120);
      await cdp.shot('straggler-bubble');
      console.log(JSON.stringify(await cdp.eval(stateOf)));
    }
    if (run('rig')) {
      await cdp.eval(start({ level: 1, n: 8, mode: 'chain', bots: true, idle: [0, 1, 2, 3, 4, 5, 6, 7] }));
      await sleep(400);
      await cdp.eval('window.obst.ff(1.2)');
      await sleep(300);
      const c = await cdp.eval<{ x: number; y: number }>(
        '(() => { const r = window.obst.scene.view.camera.result; const f = window.obst.scene.view.feet.get(3); return { x: (f.x - r.rect.x) * r.state.zoom, y: (f.y - r.rect.y) * r.state.zoom }; })()',
      );
      await cdp.shot('rig-idle8', { x: c.x - 160, y: c.y - 110, width: 320, height: 150, scale: 4 });
      await cdp.eval(start({ level: 1, n: 3, mode: 'chain', bots: true }));
      await sleep(300);
      await cdp.eval('window.obst.ff(2.0)');
      await sleep(100);
      const d = await cdp.eval<{ x: number; y: number }>(
        '(() => { const r = window.obst.scene.view.camera.result; const f = window.obst.scene.view.feet.get(1); return { x: (f.x - r.rect.x) * r.state.zoom, y: (f.y - r.rect.y) * r.state.zoom }; })()',
      );
      await cdp.shot('rig-run3', { x: d.x - 160, y: d.y - 110, width: 320, height: 150, scale: 4 });
    }
    if (run('spread8')) {
      await cdp.eval(start({ level: 1, n: 8, mode: 'free', bots: true, idle: [0, 1, 2, 3, 4, 5, 6, 7] }));
      await sleep(300);
      const spots = [
        [3, 11],
        [10, 11],
        [17, 11],
        [22, 11],
        [36, 8],
        [40, 8],
        [46, 11],
        [54, 7],
      ];
      await cdp.eval(`(() => { const w = window.obst.world(); ${JSON.stringify(spots)}.forEach(([c, r], i) => w.teleport(i, c, r)); })()`);
      await cdp.eval('window.obst.ff(4)');
      await sleep(250);
      await cdp.shot('l1-8p-spread');
      console.log(JSON.stringify(await cdp.eval(stateOf)));
      // one of them goes far away: only the others are framed
      await cdp.eval(start({ level: 1, n: 8, mode: 'free', bots: true, idle: [0, 1, 2, 3, 4, 5, 6, 7], long: true }));
      await sleep(300);
      const far = [
        [3, 11],
        [6, 11],
        [9, 11],
        [12, 11],
        [60, 11],
        [62, 11],
        [64, 11],
        [66, 11],
      ];
      await cdp.eval(`(() => { const w = window.obst.world(); ${JSON.stringify(far)}.forEach(([c, r], i) => w.teleport(i, c, r)); })()`);
      await cdp.eval('window.obst.ff(3)');
      await sleep(250);
      await cdp.shot('l1-8p-two-groups');
      console.log(JSON.stringify(await cdp.eval(stateOf)));
    }
    if (run('poses')) {
      await cdp.eval(start({ level: 1, n: 8, mode: 'free', bots: true, idle: [0, 1, 2, 3, 4, 5, 6, 7] }));
      await sleep(300);
      await cdp.eval(`(() => { const w = window.obst.world(); [[4, 11], [6, 11], [6, 11], [8, 11], [10, 11], [12, 11], [14, 11], [16, 11]].forEach(([c, r], i) => w.teleport(i, c, r));
        w.forced[0] = { planted: true }; w.forced[1] = { holding: 'player' }; w.forced[2] = { carriedBy: 1 }; w.forced[3] = { thrown: true, vx: 300 }; w.forced[4] = { hanging: true, grounded: false };
        w.forced[5] = { anchored: true, grounded: false }; w.forced[6] = { inGoal: true }; w.forced[7] = { holding: 'box', hint: 'throw' }; })()`);
      await cdp.eval('window.obst.ff(0.5)');
      await sleep(200);
      const c = await cdp.eval<{ x: number; y: number }>(
        '(() => { const r = window.obst.scene.view.camera.result; const f = window.obst.scene.view.feet.get(3); return { x: (f.x - r.rect.x) * r.state.zoom, y: (f.y - r.rect.y) * r.state.zoom }; })()',
      );
      await cdp.shot('poses', { x: c.x - 240, y: c.y - 130, width: 480, height: 170, scale: 3 });
      await cdp.eval(start({ level: 1, n: 3, mode: 'free', bots: true, idle: [0, 1, 2] }));
      await sleep(300);
      await cdp.eval('window.obst.world().teleport(0, 32, 11)');
      let dead = false;
      for (let i = 0; i < 120 && !dead; i++) {
        await cdp.eval('window.obst.ff(1/60)');
        dead = await cdp.eval<boolean>('window.obst.world().players[0].dead');
      }
      await sleep(60);
      await cdp.shot('death-burst');
    }
    if (run('biomes')) {
      for (const b of ['beach', 'forest', 'mine', 'glacier', 'volcano']) {
        await cdp.eval(start({ level: 1, n: 3, mode: 'chain', bots: true, biome: b }));
        await sleep(300);
        await cdp.eval('window.obst.ff(9)');
        await sleep(200);
        await cdp.shot(`biome-${b}`);
      }
    }
    if (run('ents')) {
      for (const [lv, name] of [
        [4, 'l4'],
        [8, 'l8'],
      ] as const) {
        await cdp.eval(start({ level: lv, n: 4, mode: lv === 8 ? 'free' : 'chain', bots: false }));
        await sleep(300);
        await cdp.eval('window.obst.ff(0.5)');
        await sleep(200);
        await cdp.shot(`ents-${name}`);
      }
    }
    if (run('a5')) {
      // campaign A5 on the real session: [scenario, seconds into the level to look at, name]
      const shots: [string, number, string][] = [
        ['balance', 5.2, 'a5-balance'],
        ['target', 5.8, 'a5-target-open'],
        ['enemies', 6.5, 'a5-enemies'],
        ['ice', 7, 'a5-ice'],
        ['wind', 5.6, 'a5-wind-gust'],
        ['pickaxe', 3.8, 'a5-pick-take'],
        ['pickaxe', 7.5, 'a5-pick-climb'],
        ['pickaxe', 10.5, 'a5-pick-top'],
        ['throw', 4.9, 'a5-throw-flight'],
      ];
      let cur = '',
        at = 0;
      for (const [id, t, name] of shots) {
        if (id !== cur || t < at) {
          await cdp.eval(`window.obst.startSim(${JSON.stringify(id)})`);
          await sleep(500);
          cur = id;
          at = 0;
        }
        await cdp.eval(`window.obst.ff(${t - at})`);
        at = t;
        await sleep(250);
        await cdp.shot(name);
        console.log(
          name,
          JSON.stringify(
            await cdp.eval(
              '(() => { const w = window.obst.sim().session.world; return { tick: w.tick, status: w.status, p0: [Math.round(w.players[0].body.x), Math.round(w.players[0].body.y)], p1: [Math.round(w.players[1].body.x), Math.round(w.players[1].body.y)] }; })()',
            ),
          ),
        );
      }
    }
    // campaign A6: the four new dynamics and the layer for 2 (shared hearts, the long rope, a signal over the head), on the real session. [scenario, seconds into the level, name, javascript to run first]
    for (const set of ['a6', 'layer'] as const)
      if (run(set)) {
        const shots: [string, number, string, string?][] =
          set === 'a6'
            ? [
                ['lantern', 4.2, 'a6-lantern-take'],
                ['lantern', 6.2, 'a6-lantern-bridge'],
                ['lantern', 7.6, 'a6-lantern-cross'],
                ['bungee', 5.3, 'a6-bungee-stretch'],
                ['bungee', 6.6, 'a6-bungee-bounce'],
                ['sinkers', 5.4, 'a6-sinker'],
                ['geyser', 5.2, 'a6-geyser-warn'],
                ['geyser', 5.85, 'a6-geyser-gush'],
                ['geyser', 6.4, 'a6-geyser-air'],
              ]
            : [
                ['layer', 4, 'layer-rope'],
                [
                  'layer',
                  4.4,
                  'layer-signal',
                  `(() => { const r = window.obst.sim(); r.receive(0, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'arrowR', seq: 0 } }); r.receive(0, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'arrowR', seq: 1 } }); })()`,
                ],
                [
                  'layer',
                  4.9,
                  'layer-signal-wait',
                  `(() => { const r = window.obst.sim(); r.receive(1, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'wait', seq: 0 } }); r.receive(1, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'wait', seq: 1 } }); })()`,
                ],
                ['layer', 8.6, 'layer-death-bubble'],
                ['layer', 10.2, 'layer-hearts-after'],
              ];
        let cur = '',
          at = 0;
        for (const [id, t, name, pre] of shots) {
          if (id !== cur || t < at) {
            await cdp.eval(`window.obst.startSim(${JSON.stringify(id)})`);
            await sleep(500);
            cur = id;
            at = 0;
          }
          await cdp.eval(`window.obst.ff(${t - at})`);
          at = t;
          if (pre) {
            await cdp.eval(pre);
            await cdp.eval('window.obst.ff(0.15)');
            at += 0.15;
          }
          await sleep(250);
          await cdp.shot(name);
          console.log(
            name,
            JSON.stringify(
              await cdp.eval(
                '(() => { const w = window.obst.sim().session.world; return { tick: w.tick, status: w.status, lives: w.lives, p0: [Math.round(w.players[0].body.x), Math.round(w.players[0].body.y), w.players[0].mode], p1: [Math.round(w.players[1].body.x), Math.round(w.players[1].body.y), w.players[1].mode] }; })()',
              ),
            ),
          );
        }
      }
    if (run('fps')) {
      for (const [n, long, label] of [
        [2, false, '2p'],
        [8, false, '8p'],
        [8, true, '8p long level, camera zooming'],
      ] as const) {
        await cdp.eval(start({ level: 1, n, mode: long ? 'free' : 'chain', bots: true, long, idle: long ? [6, 7] : [] }));
        await sleep(800);
        await cdp.eval('window.obst.resetStats()');
        await sleep(8000);
        const r = await cdp.eval<{ frames: number; cpuMs: number; updMs: number; dts: number[] }>(
          '({ ...window.obst.stats(), dts: window.obst.frameDts() })',
        );
        const dts = r.dts.slice(5).sort((a, b) => a - b);
        const avg = dts.reduce((s, v) => s + v, 0) / dts.length;
        console.log(
          `fps ${label}: frames=${r.frames} avgFrame=${avg.toFixed(2)}ms (${(1000 / avg).toFixed(1)} fps) p95=${dts[Math.floor(dts.length * 0.95)]!.toFixed(1)}ms max=${dts[dts.length - 1]!.toFixed(1)}ms update(world+view)=${(r.updMs / r.frames).toFixed(2)}ms render-submit=${(r.cpuMs / r.frames).toFixed(2)}ms`,
        );
        console.log(JSON.stringify(await cdp.eval(stateOf)));
      }
    }
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
