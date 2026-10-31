// Helpers of tools/menu-remote-e2e.ts: process-tree kill, the CDP client and the iris wait.
import { execSync, type ChildProcess } from 'node:child_process';
import { WebSocket } from 'ws';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function descendants(pid: number): number[] {
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
export async function killTree(proc: ChildProcess) {
  if (!proc.pid) return;
  const pids = [proc.pid, ...descendants(proc.pid)];
  for (const p of pids) {
    try {
      process.kill(p, 'SIGTERM');
    } catch {
      /* gone */
    }
  }
  await sleep(600);
  for (const p of pids) {
    try {
      process.kill(p, 0);
      process.kill(p, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}

export class Cdp {
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
        this.errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
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
  async key(key: string, code: string, vk: number) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  }
}

/** By state, not by sleeping: #iris is display:block while it moves (1 s) and swallows every key. */
export async function irisFree(cdp: Cdp) {
  for (let i = 0; i < 80; i++) {
    if (await cdp.eval<boolean>(`getComputedStyle(document.getElementById('iris')).display === 'none'`)) return;
    await sleep(50);
  }
  throw new Error('the iris never freed');
}
