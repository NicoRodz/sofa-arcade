// Manchazo on the phone, end to end over a fake <body>: what a hint / buzz / phase message from the TV does to the phone's look. The status must not outlive a dead link,
// and a phone that is in another game (or between rounds) must stay clean: every game sees every message.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATUS_STALE_MS } from '../../controller/phone-state';

class FakeEl {
  dataset: Record<string, string> = {};
  style = {
    props: new Map<string, string>(),
    setProperty(k: string, v: string) {
      this.props.set(k, v);
    },
    removeProperty(k: string) {
      this.props.delete(k);
    },
  };
  cls = new Set<string>();
  classList = { add: (c: string) => this.cls.add(c), remove: (c: string) => this.cls.delete(c) };
  children: FakeEl[] = [];
  id = '';
  innerHTML = '';
  offsetWidth = 0;
  removed = false;
  b = { textContent: '' };
  span = { textContent: '' };
  append(...c: FakeEl[]) {
    this.children.push(...c);
  }
  querySelector(sel: string) {
    return sel === 'b' ? this.b : this.span;
  }
  remove() {
    this.removed = true;
  }
}

let body: FakeEl;
let made: FakeEl[];
let listeners: Map<string, () => void>;
const audio = { resumed: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  body = new FakeEl();
  body.dataset.game = 'arena';
  made = [];
  listeners = new Map();
  audio.resumed = 0;
  vi.stubGlobal('document', {
    body,
    createElement: () => {
      const e = new FakeEl();
      made.push(e);
      return e;
    },
  });
  vi.stubGlobal('addEventListener', (ev: string, fn: () => void) => void listeners.set(ev, fn));
  vi.stubGlobal('removeEventListener', (ev: string) => void listeners.delete(ev));
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'suspended';
      resume() {
        audio.resumed++;
        return Promise.resolve();
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function boot() {
  const { arenaController } = await import('../../controller/game');
  arenaController.init!({} as never);
  const cue = made[0]!;
  const send = (m: object) => arenaController.onMessage!(m as never, {} as never);
  return { ctl: arenaController, cue, send };
}

describe('arena phone', () => {
  it('never consumes a message: the platform still vibrates and relabels', async () => {
    const { send } = await boot();
    expect(send({ t: 'hint', st: 'dizzy' })).toBe(false);
  });

  it('wears its team, even before the config says arena', async () => {
    const { send } = await boot();
    body.dataset.game = 'pizzas';
    send({ t: 'you', teamId: 1 });
    expect(body.dataset.arenaTeam).toBe('1');
  });

  it('a hint with a status paints it on the phone; the card in hand colours button B', async () => {
    const { send } = await boot();
    send({ t: 'hint', st: 'dizzy', card: 'roller' });
    expect(body.dataset.arenaSt).toBe('dizzy');
    expect(body.style.props.get('--arenast')).toBe('"¡MAREADO!"');
    expect(body.dataset.arenaCard).toBe('roller');
    expect(body.style.props.get('--card')).toBe('#FFD166');
  });

  it('the status fades by itself once the TV stops resending it (link dropped), not before', async () => {
    const { send } = await boot();
    send({ t: 'hint', st: 'stained' });
    vi.advanceTimersByTime(STATUS_STALE_MS - 1);
    expect(body.dataset.arenaSt).toBe('stained');
    vi.advanceTimersByTime(1);
    expect(body.dataset.arenaSt).toBeUndefined();
  });

  it('a resent hint keeps the status alive (the stale timer restarts)', async () => {
    const { send } = await boot();
    send({ t: 'hint', st: 'stained' });
    vi.advanceTimersByTime(2000);
    send({ t: 'hint', st: 'stained' });
    vi.advanceTimersByTime(2000);
    expect(body.dataset.arenaSt).toBe('stained');
  });

  it('a hint without status, or with one this phone does not know, clears it', async () => {
    const { send } = await boot();
    send({ t: 'hint', st: 'dizzy' });
    send({ t: 'hint' });
    expect(body.dataset.arenaSt).toBeUndefined();
    send({ t: 'hint', st: 'dizzy' });
    send({ t: 'hint', st: 'on-fire' });
    expect(body.dataset.arenaSt).toBeUndefined();
  });

  it('an unknown card clears the colour instead of keeping the previous one', async () => {
    const { send } = await boot();
    send({ t: 'hint', card: 'glue' });
    send({ t: 'hint', card: 'bogus' });
    expect(body.dataset.arenaCard).toBeUndefined();
    expect(body.style.props.has('--card')).toBe(false);
  });

  it('while the phone is in another game, hints and buzzes change nothing', async () => {
    const { send, cue } = await boot();
    body.dataset.game = 'pizzas';
    send({ t: 'hint', st: 'dizzy', card: 'glue' });
    send({ t: 'buzz', kind: 'stain' });
    expect(body.dataset.arenaSt).toBeUndefined();
    expect(body.dataset.arenaCard).toBeUndefined();
    expect(cue.cls.has('on')).toBe(false);
  });

  it('a buzz of an alert kind takes the phone: words, colours, and it goes away after its duration', async () => {
    const { send, cue } = await boot();
    send({ t: 'buzz', kind: 'rescued' });
    expect(cue.b.textContent).toBe('¡TE RESCATARON!');
    expect(cue.cls.has('on')).toBe(true);
    expect(cue.style.props.get('--bg')).toBe('#22B573');
    vi.advanceTimersByTime(1300);
    expect(cue.cls.has('on')).toBe(false);
  });

  it('platform buzzes that are not arena alerts (alert, big) do not draw a notice', async () => {
    const { send, cue } = await boot();
    send({ t: 'buzz', kind: 'alert' });
    expect(cue.cls.has('on')).toBe(false);
  });

  it('stain followed at once by lootlost is one folded notice, not two', async () => {
    const { send, cue } = await boot();
    send({ t: 'buzz', kind: 'stain' });
    vi.advanceTimersByTime(100);
    send({ t: 'buzz', kind: 'lootlost' });
    expect(cue.b.textContent).toBe('¡TE MANCHARON!');
    expect(cue.span.textContent).toBe('Y soltaste tu sabotaje: cayó al piso');
  });

  it('a lootlost long after the stain is its own notice', async () => {
    const { send, cue } = await boot();
    send({ t: 'buzz', kind: 'stain' });
    vi.advanceTimersByTime(5000);
    send({ t: 'buzz', kind: 'lootlost' });
    expect(cue.b.textContent).toBe('¡PERDISTE EL BOTÍN!');
  });

  it('a newer notice does not get cut short by the timer of the previous one', async () => {
    const { send, cue } = await boot();
    send({ t: 'buzz', kind: 'rescued' }); // 1300 ms
    vi.advanceTimersByTime(1000);
    send({ t: 'buzz', kind: 'hourglass' }); // 1800 ms
    vi.advanceTimersByTime(600);
    expect(cue.cls.has('on')).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(cue.cls.has('on')).toBe(false);
  });

  it('leaving the round wipes status, card and notice; staying in `playing` does not', async () => {
    const { ctl, send, cue } = await boot();
    send({ t: 'hint', st: 'dizzy', card: 'fan' });
    send({ t: 'buzz', kind: 'dizzy' });
    ctl.onPhase!({ phase: 'playing' } as never, {} as never);
    expect(body.dataset.arenaSt).toBe('dizzy');
    ctl.onPhase!({ phase: 'results' } as never, {} as never);
    expect(body.dataset.arenaSt).toBeUndefined();
    expect(body.dataset.arenaCard).toBeUndefined();
    expect(cue.cls.has('on')).toBe(false);
  });

  it('the first touch unlocks audio; dispose removes the listener and the overlays', async () => {
    const { ctl, cue } = await boot();
    listeners.get('pointerdown')!();
    expect(audio.resumed).toBe(1);
    ctl.dispose!();
    expect(listeners.has('pointerdown')).toBe(false);
    expect(cue.removed).toBe(true);
  });

  it('setupLabel tells teams apart from free-for-all', async () => {
    const { ctl } = await boot();
    expect(ctl.setupLabel({ teams: true } as never)).toBe('Naranja contra azul');
    expect(ctl.setupLabel({ teams: false, difficulty: 'normal' } as never)).toMatch(/^Último en pie · /);
  });
});
