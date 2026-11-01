// What the main.ts of before did for Pizzas and now lives in its ControllerGame: the versus verdict on the results phase, the stations only in a round, and the Ayudante
// switch (reset on `joined`, the echo of this phone's own `assist` consumed, someone else's left alone). Against a minimal fake DOM.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMsg, PhaseInfo, ServerMsg } from '@pichi/core';
import type { ControllerHost } from '@pichi/controller-kit/contract';
import { createPizzasController } from './game';

class FakeEl {
  textContent = '';
  innerHTML = '';
  id = '';
  className = '';
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  classes = new Set<string>();
  handlers: Record<string, (e: { preventDefault(): void }) => void> = {};
  classList = {
    toggle: (c: string, on?: boolean) => ((on ?? !this.classes.has(c)) ? this.classes.add(c) : this.classes.delete(c)),
    add: (c: string) => this.classes.add(c),
    remove: (c: string) => this.classes.delete(c),
  };
  setAttribute = (k: string, v: string) => {
    this.attrs[k] = v;
  };
  addEventListener = (t: string, h: (e: { preventDefault(): void }) => void) => {
    this.handlers[t] = h;
  };
  after = () => {};
  append = () => {};
  replaceWith = () => {};
  tap = () => this.handlers.pointerup?.({ preventDefault() {} });
}

let els: Map<string, FakeEl>;
let body: FakeEl;
const el = (id: string) => {
  if (!els.has(id)) els.set(id, new FakeEl());
  return els.get(id)!;
};
beforeEach(() => {
  els = new Map();
  body = new FakeEl();
  vi.stubGlobal('document', { getElementById: el, body, createElement: () => new FakeEl() });
});

const hostOf = (over: Partial<ControllerHost> = {}) => {
  const sent: ClientMsg[] = [];
  const host = {
    send: (m: ClientMsg) => sent.push(m),
    slot: { querySelector: (sel: string) => el(sel.slice(1)), ownerDocument: { body } },
    myId: () => 3,
    myTeam: () => 1,
    phase: () => 'lobby',
    ...over,
  } as unknown as ControllerHost;
  return { host, sent };
};
const results = (winner: number) =>
  ({
    t: 'phase',
    phase: 'results',
    scores: [{ id: 3, score: 10 }],
    result: {
      verdict: 'winner',
      winner,
      scores: [
        { team: 0, score: 40 },
        { team: 1, score: 55 },
      ],
    },
  }) as unknown as PhaseInfo;

describe('Pizzas on the phone: the versus verdict', () => {
  it('shows the own team score and the verdict on results, and clears it on any other phase', () => {
    const g = createPizzasController();
    const { host } = hostOf();
    g.onPhase?.(results(1), host);
    expect(body.dataset.outcome).toBe('won');
    expect(el('verdict').textContent).toBe('¡Ganaron!');
    expect(el('rank').textContent).toBe('55');
    g.onPhase?.(results(0), host);
    expect(body.dataset.outcome).toBe('lost');
    expect(el('verdict').textContent).toBe('Perdieron');
    g.onPhase?.({ phase: 'lobby' } as unknown as PhaseInfo, host); // the platform clears `outcome` before; the game does not set it again
    expect(body.dataset.outcome).toBe('lost');
  });
  it('a coop results phase (no result) leaves no verdict', () => {
    const g = createPizzasController();
    const { host } = hostOf();
    g.onPhase?.({ phase: 'results', scores: [{ id: 3, score: 10 }] } as unknown as PhaseInfo, host);
    expect(body.dataset.outcome).toBeUndefined();
  });
});

describe('Pizzas on the phone: the Ayudante switch', () => {
  const joined = { t: 'joined' } as ServerMsg;
  const echo = (playerId: number, on: boolean) => ({ t: 'assist', playerId, on }) as ServerMsg;
  it('the echo of this phone is consumed and shown; someone else is not', () => {
    const g = createPizzasController();
    const { host } = hostOf();
    g.init?.(host);
    expect(g.onMessage?.(echo(3, true), host)).toBe(true);
    expect(el('assist').classes.has('on')).toBe(true);
    expect(el('assistlbl').textContent).toBe('Modo Ayudante: sí');
    expect(g.onMessage?.(echo(9, false), host)).toBe(false);
    expect(el('assist').classes.has('on')).toBe(true); // untouched
  });
  it('a `joined` resets the switch (the relay echoes the stored choice after it) and is not consumed', () => {
    const g = createPizzasController();
    const { host } = hostOf();
    g.init?.(host);
    g.onMessage?.(echo(3, true), host);
    expect(g.onMessage?.(joined, host)).toBe(false);
    expect(el('assist').classes.has('on')).toBe(false);
    expect(el('assistlbl').textContent).toBe('Modo Ayudante: no');
  });
  it('a tap in the lobby flips it, tells the relay and announces; outside the lobby it does nothing', () => {
    const g = createPizzasController();
    const { host, sent } = hostOf();
    g.init?.(host);
    el('assist').tap();
    expect(sent).toEqual([{ t: 'assist', on: true }]);
    expect(el('assisttoast').textContent).toContain('activado');
    const out = hostOf({ phase: () => 'playing' });
    const g2 = createPizzasController();
    g2.init?.(out.host);
    el('assist').tap();
    expect(out.sent).toEqual([]);
  });
});
