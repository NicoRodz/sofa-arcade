export interface PageTarget {
  type: string;
  webSocketDebuggerUrl: string;
}

export interface WaitOptions {
  /** Total wait for a `page` target, in ms (the CI runner's Chrome can take well over 10 s to expose one). */
  timeoutMs?: number;
  intervalMs?: number;
  fetchFn?: (url: string) => Promise<{ json(): Promise<unknown> }>;
  /** Injected so tests can run a fake clock: it must advance `now()`. */
  sleepFn?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Polls `/json/list` until Chrome exposes a `page` target; throws a clear error at the deadline instead of returning undefined. */
export async function waitForPageTarget(port: number, opts: WaitOptions = {}): Promise<PageTarget> {
  const { timeoutMs = 30_000, intervalMs = 200 } = opts;
  const fetchFn = opts.fetchFn ?? ((url: string) => fetch(url));
  const sleepFn = opts.sleepFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + timeoutMs;
  let seen = 'no response from /json/list';
  for (;;) {
    try {
      const list = (await (await fetchFn(`http://127.0.0.1:${port}/json/list`)).json()) as PageTarget[];
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
      seen = `targets: [${list.map((t) => t.type).join(', ')}]`;
    } catch (e) {
      seen = `/json/list failed: ${(e as Error).message}`;
    }
    if (now() >= deadline) break;
    await sleepFn(intervalMs);
  }
  throw new Error(`Chrome on CDP port ${port} exposed no page target within ${timeoutMs} ms (${seen})`);
}
