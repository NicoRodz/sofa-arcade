import { describe, expect, it } from 'vitest';
import { waitForPageTarget } from './page-target';

const PAGE = { type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9/devtools/page/1' };

/** Fake clock + fetch: `/json/list` answers per call index; each sleep advances the clock. */
function harness(answer: (call: number) => unknown) {
  let t = 0;
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    opts: {
      now: () => t,
      sleepFn: async (ms: number) => void (t += ms),
      fetchFn: async () => {
        const r = answer(calls++);
        if (r instanceof Error) throw r;
        return { json: async () => r };
      },
    },
  };
}

describe('waitForPageTarget', () => {
  it('waits past the old 10 s window for a slow page target (CI flake)', async () => {
    // 80 polls x 200 ms = 16 s of an empty list / refused connections, then the page appears
    const h = harness((i) =>
      i < 40 ? new Error('ECONNREFUSED') : i < 80 ? [{ type: 'service_worker', webSocketDebuggerUrl: 'ws://x' }] : [PAGE],
    );
    await expect(waitForPageTarget(9333, h.opts)).resolves.toEqual(PAGE);
    expect(h.calls).toBe(81);
  });

  it('ignores non-page targets', async () => {
    const h = harness(() => [{ type: 'browser', webSocketDebuggerUrl: 'ws://b' }, PAGE]);
    await expect(waitForPageTarget(9333, h.opts)).resolves.toEqual(PAGE);
  });

  it('throws a clear error (not a TypeError) when no page ever shows up', async () => {
    const h = harness(() => []);
    await expect(waitForPageTarget(9333, { ...h.opts, timeoutMs: 5000 })).rejects.toThrow(
      /exposed no page target within 5000 ms \(targets: \[\]\)/,
    );
  });
});
