import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { CDP, CHROME, outDir, sleep } from './config';

export class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  errors: string[] = [];
  constructor(private ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m);
        this.pending.delete(m.id);
      } else if (m.method === 'Debugger.paused')
        console.log(
          'PAUSED',
          m.params.callFrames
            .slice(0, 8)
            .map((f: any) => `${f.functionName}@${f.url.split('/').pop()}:${f.location.lineNumber}`)
            .join(' < '),
        );
      else if (m.method === 'Runtime.exceptionThrown')
        this.errors.push(
          `EXC ${JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400)}`,
        );
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        this.errors.push(
          `console.error ${m.params.args
            .map((a: any) => a.value ?? a.description)
            .join(' ')
            .slice(0, 300)}`,
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
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 20_000 });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value as T;
  }
  async shot(name: string) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('saved', file);
    return file;
  }
}

export function launchChrome(): ChildProcess {
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-obst-chrome-'));
  return spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP}`,
      `--user-data-dir=${profile}`,
      '--window-size=1920,1080',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--ignore-gpu-blocklist',
      '--force-color-profile=srgb',
      '--autoplay-policy=no-user-gesture-required',
      ...(process.env.UNCAP ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []),
      ...(process.env.SOFTGL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
}

// waits for the first page target and returns a ready 1920x1080 session
export async function connectCdp(): Promise<Cdp> {
  let targets: any[] = [];
  for (let i = 0; i < 50 && !targets.length; i++) {
    await sleep(200);
    try {
      targets = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).filter((t: any) => t.type === 'page');
    } catch {
      /* not up yet */
    }
  }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  return new Cdp(ws);
}
