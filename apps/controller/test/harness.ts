// Phone layout harness: serves the controller with Vite, drives it in headless Chrome (touch + mobile emulation, safe-area
// insets) with a fake WebSocket standing in for the relay, and measures what ends up on screen.
// Shared by layout.test.ts (automatic overlap / touch-size checks) and capture.ts (screenshots).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { killTree } from '../../../tools/proc/kill-tree';
import { pageReadyJs, settleJs, waitUntil } from './settle';
import { WebSocket } from 'ws';
import { portFor } from './free-port';
import type { Scenario } from './scenario-types';
import { NONE, TOUCH_SELECTORS, VIEWPORTS, type Insets, type Viewport } from './phone/viewports';
import { PROBE, SELECTORS, type Probe } from './phone/probe';

// The harness's public surface lives in the files it was split into; consumers keep importing from here.
export { ORIENTATIONS, PORTRAITS, TOUCH_SELECTORS, VIEWPORTS, insetsName, type Insets, type Viewport } from './phone/viewports';
export { SELECTORS, type Box, type Item, type Probe } from './phone/probe';
export type { ControlsMsg } from './phone/scenario-msgs';
export { SCENARIOS } from './phone/scenarios';
export type { Scenario };

const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  readonly errors: string[] = [];
  constructor(private ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m);
        this.pending.delete(m.id);
      } else if (m.method === 'Runtime.exceptionThrown')
        this.errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400));
    });
  }
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval<T = unknown>(expr: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value as T;
  }
}

// ---- what runs in the page
// A WebSocket that never touches the network: the test pushes the relay's messages with window.__push.
const FAKE_WS = `(() => {
  const socks = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; socks.push(this); setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen({}); }, 5); }
    send(d) { (window.__sent = window.__sent || []).push(JSON.parse(d)); }
    close() { if (this.readyState === 3) return; this.readyState = 3; setTimeout(() => { if (this.onclose) this.onclose({}); }, 0); }
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
  window.__push = (m) => { const s = socks[socks.length - 1]; if (s && s.onmessage) s.onmessage({ data: JSON.stringify(m) }); };
  window.__wsOpen = () => socks.some((s) => s.readyState === 1);
  window.__closeSocket = () => { const s = socks[socks.length - 1]; if (s) s.close(); };
})();`;

// ---- the browser session
export interface Session {
  load(s: Scenario): Promise<void>;
  setViewport(v: Viewport, insets: Insets): Promise<void>;
  probe(): Promise<Probe>;
  shot(file: string): Promise<void>;
  tap(x: number, y: number): Promise<void>;
  hold(x: number, y: number, ms: number): Promise<void>; // touch down, wait, touch up
  eval<T>(expr: string): Promise<T>;
  pageErrors(): string[];
  close(): Promise<void>;
}

export async function openSession(): Promise<Session> {
  const [PORT, CDP_PORT] = await Promise.all([portFor(process.env.PG_PORT), portFor(process.env.PG_CDP_PORT)]);
  const vite: ViteDevServer = await createServer({
    root: path.resolve(HERE, '..'),
    configFile: path.resolve(HERE, '../vite.config.ts'),
    server: { port: PORT, strictPort: true, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await vite.listen();
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-ctrl-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--disable-gpu', // layout probes need no GPU: measured -28% CPU, same wall
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-color-profile=srgb',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const cleanup = async () => {
    await killTree(chrome);
    await vite.close();
    rmSync(profile, { recursive: true, force: true });
  };
  try {
    let targets: any[] = [];
    for (let i = 0; i < 240 && !targets.length; i++) {
      await sleep(50);
      try {
        targets = ((await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()) as any[]).filter((t) => t.type === 'page');
      } catch {
        /* not up yet */
      }
    }
    if (!targets.length) throw new Error(`Chrome did not start (${CHROME})`);
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    const cdp = new Cdp(ws);
    for (const m of ['Page.enable', 'Runtime.enable']) await cdp.send(m);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_WS });
    let vp: Viewport = VIEWPORTS[0]!;
    const setViewport = async (v: Viewport, insets: Insets) => {
      vp = v;
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: v.w,
        height: v.h,
        deviceScaleFactor: 2,
        mobile: true,
        screenOrientation: v.w > v.h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
      });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      await cdp.eval(settleJs(v.w, v.h));
    };
    return {
      async load(s) {
        await setViewport(vp, NONE);
        const store = s.fresh
          ? `localStorage.clear()`
          : `localStorage.setItem('pg.name', 'Nico'); localStorage.setItem('pg.room', 'main'); localStorage.setItem('pg.token', 'tok')`;
        const url = `http://127.0.0.1:${PORT}/c/?room=main`;
        const onOrigin = () => cdp.eval<boolean>(`location.href.startsWith('http') && document.readyState === 'complete'`);
        // storage is set from a document of our origin: the one the previous scenario left will do, only a fresh tab needs a first navigation
        if (!(await onOrigin().catch(() => false))) {
          await cdp.send('Page.navigate', { url });
          await waitUntil(onOrigin, 6000, 10);
        }
        await cdp.eval(store);
        await cdp.eval(`window.__old = true`); // marks the document we are leaving, so the wait below sees only the new one
        await cdp.send('Page.navigate', { url });
        await waitUntil(() => cdp.eval<boolean>(pageReadyJs(!s.fresh)), 6000, 10); // the stored name starts the pad; the fake socket opens
        for (const m of s.msgs) await cdp.eval(`window.__push(${JSON.stringify(m)})`);
        if (s.after) await cdp.eval(s.after);
        await cdp.eval(settleJs());
      },
      setViewport,
      async probe() {
        return cdp.eval<Probe>(`(${PROBE})(${JSON.stringify(SELECTORS)}, ${JSON.stringify(TOUCH_SELECTORS)})`);
      },
      async shot(file) {
        const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(file, Buffer.from(r.data, 'base64'));
      },
      async tap(x, y) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await sleep(50);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.eval(settleJs());
      },
      async hold(x, y, ms) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await sleep(ms);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.eval(settleJs());
      },
      eval: (e) => cdp.eval(e),
      pageErrors: () => cdp.errors,
      close: async () => {
        try {
          ws.close();
        } catch {
          /* closing */
        }
        await cleanup();
      },
    };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
