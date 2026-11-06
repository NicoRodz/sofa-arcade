import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A scripted CDP endpoint: every outgoing command is answered on the next tick unless `replies` says otherwise.
class FakeWs extends EventEmitter {
  static last: FakeWs;
  sent: { id: number; method: string; params: any }[] = [];
  closed = false;
  replies: Record<string, unknown> = {};
  constructor(public url: string) {
    super();
    FakeWs.last = this;
    queueMicrotask(() => this.emit('open'));
  }
  send(raw: string) {
    const msg = JSON.parse(raw);
    this.sent.push(msg);
    const reply = this.replies[msg.method] ?? { result: {} };
    queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({ id: msg.id, ...(reply as object) }))));
  }
  push(m: object) {
    this.emit('message', Buffer.from(JSON.stringify(m)));
  }
  close() {
    this.closed = true;
  }
}

const waitForPageTarget = vi.fn();
vi.mock('ws', () => ({ WebSocket: FakeWs }));
vi.mock('./config', () => ({ CDP: 9444, CHROME: '/x/chrome', outDir: '/x/out' }));
vi.mock('./page-target', () => ({ waitForPageTarget: (...a: unknown[]) => waitForPageTarget(...a) }));

const { Cdp, connectCdp } = await import('./browser');

beforeEach(() => {
  waitForPageTarget.mockReset();
  waitForPageTarget.mockResolvedValue({ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9444/devtools/page/7' });
});

describe('connectCdp', () => {
  it('waits for a page target on the CDP port before opening the socket, so a slow Chrome does not fail the run', async () => {
    await connectCdp();
    expect(waitForPageTarget).toHaveBeenCalledWith(9444);
    expect(FakeWs.last.url).toBe('ws://127.0.0.1:9444/devtools/page/7');
  });

  it('does not open any socket when no page target ever appears (the error surfaces, not a TypeError)', async () => {
    waitForPageTarget.mockRejectedValue(new Error('exposed no page target within 30000 ms'));
    const before = FakeWs.last;
    await expect(connectCdp()).rejects.toThrow(/no page target/);
    expect(FakeWs.last).toBe(before);
  });

  it('enables Page and Runtime and pins the viewport to 1920x1080 desktop, in that order', async () => {
    await connectCdp();
    expect(FakeWs.last.sent.map((s) => s.method)).toEqual(['Page.enable', 'Runtime.enable', 'Emulation.setDeviceMetricsOverride']);
    expect(FakeWs.last.sent[2]!.params).toEqual({ width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  });
});

describe('Cdp', () => {
  const make = () => {
    const ws = new FakeWs('ws://x');
    return { ws, cdp: new Cdp(ws as never) };
  };
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('rejects a command when Chrome answers with an error', async () => {
    const { ws, cdp } = make();
    ws.replies['Boom.now'] = { error: { message: 'no such thing' } };
    await expect(cdp.send('Boom.now')).rejects.toThrow('no such thing');
  });

  it('correlates concurrent replies by id, not by order', async () => {
    const { ws, cdp } = make();
    const a = cdp.send('A');
    const b = cdp.send('B');
    ws.emit('message', Buffer.from(JSON.stringify({ id: ws.sent[1]!.id, result: 'for-b' })));
    ws.emit('message', Buffer.from(JSON.stringify({ id: ws.sent[0]!.id, result: 'for-a' })));
    await expect(a).resolves.toBe('for-a');
    await expect(b).resolves.toBe('for-b');
  });

  it('records uncaught page exceptions so the boot smoke can fail on them', () => {
    const spy = quiet();
    const { ws, cdp } = make();
    ws.push({
      method: 'Runtime.exceptionThrown',
      params: { exceptionDetails: { exception: { description: 'TypeError: x is undefined' } } },
    });
    ws.push({ method: 'Runtime.exceptionThrown', params: { exceptionDetails: { text: 'Uncaught (in promise)' } } });
    expect(cdp.pageErrors).toEqual(['"TypeError: x is undefined"', '"Uncaught (in promise)"']);
    spy.mockRestore();
  });

  it('keeps console errors and warnings out of pageErrors (they are logged, not fatal)', () => {
    const spy = quiet();
    const { ws, cdp } = make();
    ws.push({ method: 'Runtime.consoleAPICalled', params: { type: 'error', args: [{ value: 'bad' }] } });
    ws.push({ method: 'Runtime.consoleAPICalled', params: { type: 'log', args: [{ value: 'fine' }] } });
    expect(cdp.pageErrors).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('eval returns the value by value and awaits promises', async () => {
    const { ws, cdp } = make();
    ws.replies['Runtime.evaluate'] = { result: { result: { value: 42 } } };
    await expect(cdp.eval<number>('6*7')).resolves.toBe(42);
    expect(ws.sent[0]!.params).toMatchObject({ expression: '6*7', returnByValue: true, awaitPromise: true });
  });

  it('eval throws the page exception instead of returning undefined', async () => {
    const { ws, cdp } = make();
    ws.replies['Runtime.evaluate'] = { result: { exceptionDetails: { exception: { description: 'ReferenceError: nope' } } } };
    await expect(cdp.eval('nope')).rejects.toThrow('ReferenceError: nope');
  });

  it('close closes the socket', () => {
    const { ws, cdp } = make();
    cdp.close();
    expect(ws.closed).toBe(true);
  });
});
