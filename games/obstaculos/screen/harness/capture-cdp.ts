// Shared by the harness capture scenarios: a CDP client that saves PNGs into `outDir`, and the page snippets they evaluate.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WebSocket } from 'ws';

export class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  constructor(
    private ws: WebSocket,
    private outDir: string,
  ) {
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
    const file = path.join(this.outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('saved', file);
  }
}

export type Ctx = { cdp: Cdp };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const start = (o: object) => `window.obst.start(${JSON.stringify(o)})`;
export const stateOf = `(() => { const w = window.obst.world(); const r = window.obst.scene.view.camera.result; return { t: +w.timeSec.toFixed(2), zoom: +r.state.zoom.toFixed(3), cx: Math.round(r.state.cx), focus: r.focus, off: r.offscreen.map(o => o.id), due: window.obst.scene.view.bubbleDue, players: w.players.map(p => [p.id, Math.round(p.x), Math.round(p.y), p.bubble ? p.bubble.phase : p.dead ? 'dead' : 'ok']) }; })()`;
