// One headless Chrome (1920x1080, DPR 1, software GL so the pixels do not depend on the machine's GPU) on its own CDP port, driving the real screen served by the real server.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { waitForPageTarget } from '../capture/page-target';
import { killTree } from '../proc/kill-tree';
import { PAGE_FAKES, SETTLE_JS } from './page-fakes';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** A free port from the OS (PG_PORT / PG_CDP pin the first/second one when set). */
export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });

export class Page {
  readonly pageErrors: string[] = [];
  private id = 0;
  private pending = new Map<number, (m: { result?: unknown; error?: { message: string } }) => void>();
  constructor(private ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m);
        this.pending.delete(m.id);
      } else if (m.method === 'Runtime.exceptionThrown')
        this.pageErrors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400));
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
  /** Advances the fake clock by n frames (yielding to the event loop now and then so the websocket and the DOM keep up). */
  async frames(n: number) {
    for (let i = 0; i < n; i++) {
      await this.eval('window.__frames(1)');
      if (i % 20 === 19) await sleep(2);
    }
  }
  /** Runs two more frames, then settles fonts and CSS animations (last, so a class a frame just added cannot start a transition after the pinning) and returns the screenshot PNG. */
  async shot(): Promise<Buffer> {
    await this.frames(2);
    await this.eval(SETTLE_JS);
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(r.data, 'base64');
  }
  close() {
    this.ws.close();
  }
}

export interface Browser {
  page: Page;
  stop(): Promise<void>;
}

export async function openBrowser(): Promise<Browser> {
  const cdpPort = await freePort();
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-visual-'));
  const chrome: ChildProcess = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      '--window-size=1920,1080',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      ...(process.env.CHROME_NO_SANDBOX ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const stop = async () => {
    await killTree(chrome);
    rmSync(profile, { recursive: true, force: true });
  };
  try {
    const target = await waitForPageTarget(cdpPort);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    const page = new Page(ws);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_FAKES });
    return {
      page,
      stop: async () => {
        page.close();
        await stop();
      },
    };
  } catch (e) {
    await stop();
    throw e;
  }
}
