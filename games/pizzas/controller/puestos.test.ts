// The station card of the phone, against a minimal fake DOM: it shows the puestos the screen dealt to THIS phone and hides without them, and "Cambiar" moves to the
// next puesto of the pool and tells the screen. The layout slow tests only measure the card; this one fixes what it says and what it sends.
import { describe, expect, it } from 'vitest';
import type { ClientMsg } from '@pichi/core';
import type { ControllerHost } from '@pichi/controller-kit/contract';
import { PUESTOS, assignPuestos } from '../sim/puestos';
import { createPuestos } from './puestos';

type FakeEl = {
  textContent: string;
  innerHTML: string;
  fire: () => void;
  on?: (e: { preventDefault(): void }) => void;
  addEventListener: (t: string, h: (e: { preventDefault(): void }) => void) => void;
};
const setup = (myId = 2) => {
  const els = new Map<string, FakeEl>();
  const el = (id: string) => {
    if (!els.has(id)) {
      const e: FakeEl = {
        textContent: '',
        innerHTML: '',
        fire: () => e.on?.({ preventDefault() {} }),
        addEventListener: (_t: string, h: (e: { preventDefault(): void }) => void) => {
          e.on = h;
        },
      };
      els.set(id, e);
    }
    return els.get(id)!;
  };
  const body = { dataset: {} as Record<string, string> };
  const sent: ClientMsg[] = [];
  const host = {
    slot: { querySelector: (sel: string) => el(sel.slice(1)), ownerDocument: { body } },
    send: (m: ClientMsg) => sent.push(m),
    myId: () => myId,
  } as unknown as ControllerHost;
  return { p: createPuestos(host), el, body, sent };
};

describe('the Pizzas station card', () => {
  it('shows the stations dealt to this phone and hides without them', () => {
    const t = setup(2);
    const pm = assignPuestos([1, 2], { cheese: false, sink: false });
    t.p.apply(pm);
    const mine = pm.assign.find((a) => a.id === 2)!;
    expect(t.body.dataset.puesto).toBe('on');
    expect(t.el('pname').textContent).toBe(mine.puestos.map((i) => PUESTOS[i].name).join(' + '));
    t.p.apply(undefined);
    expect(t.body.dataset.puesto).toBe('off');
    t.p.apply(assignPuestos([1], { cheese: false, sink: false })); // a dealing without this phone
    expect(t.body.dataset.puesto).toBe('off');
  });
  it('"Cambiar" cycles through the pool and tells the screen', () => {
    const t = setup(1);
    const pm = assignPuestos([1, 2], { cheese: true, sink: true });
    t.p.apply(pm);
    const mine = pm.assign[0]!;
    const next = mine.pool[(mine.pool.indexOf(mine.puestos[0]!) + 1) % mine.pool.length]!;
    t.el('pswap').fire();
    expect(t.sent).toEqual([{ t: 'puesto', puestos: [next] }]);
    expect(t.el('pname').textContent).toBe(PUESTOS[next].name);
  });
});
