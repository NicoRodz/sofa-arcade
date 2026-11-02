// Test double for Phaser Graphics and a 2D context: every call is recorded as `name(args)`, nothing is drawn.
export interface Recorder {
  calls: string[];
  proxy: unknown;
}
export function recorder(): Recorder {
  const calls: string[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) => {
          calls.push(`${name}(${args.map((a) => (typeof a === 'number' ? a.toFixed(3) : String(a))).join(',')})`);
          return proxy;
        },
      set: (_t, name: string, value: unknown) => {
        calls.push(`${name}=${String(value)}`);
        return true;
      },
    },
  );
  return { calls, proxy };
}
