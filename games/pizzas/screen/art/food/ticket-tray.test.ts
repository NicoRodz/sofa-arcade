// The ticket of a Bandeja: three plates in a row; each plate on the window dims and shows a tick; the bonus line counts the margin down and turns into "sin bono".
import { describe, expect, it, vi } from 'vitest';

interface Fake {
  key?: string;
  text?: string;
  alpha: number;
  visible: boolean;
  setScale: () => Fake;
  setAlpha: (a: number) => Fake;
  setVisible: (v: boolean) => Fake;
  setText: (t: string) => Fake;
}
const made: Fake[] = [];
const fake = (o: Partial<Fake>): Fake => {
  const f: Fake = {
    alpha: 1,
    visible: true,
    setScale: () => f,
    setAlpha: (a) => ((f.alpha = a), f),
    setVisible: (v) => ((f.visible = v), f),
    setText: (t) => ((f.text = t), f),
    ...o,
  };
  made.push(f);
  return f;
};
vi.mock('../stations', () => ({ place: (_s: unknown, key: string) => fake({ key }) }));
vi.mock('@pichi/screen-kit/art/fx', () => ({ makeText: (_s: unknown, _x: number, _y: number, text: string) => fake({ text }) }));

import { trayParts } from './ticket-tray';

describe('the ticket of a Bandeja', () => {
  it('draws the three plates of the order, dims the ones already served with a tick, and shows the margin left, then "sin bono"', () => {
    made.length = 0;
    const tray = trayParts({} as never, ['marinara', 'casa', 'calzonerel']);
    const pizzas = made.filter((f) => f.key);
    expect(pizzas.map((f) => f.key)).toEqual(['it_pizza_done', 'it_pizza_done_h1', 'it_calzone_done_r']);
    const ticks = made.filter((f) => f.text === '✓');
    const bonus = made.find((f) => f.text === 'x1.3')!;
    tray.set(undefined, null);
    expect(pizzas.map((f) => f.alpha)).toEqual([1, 1, 1]);
    expect(ticks.map((f) => f.visible)).toEqual([false, false, false]);
    expect(bonus.text).toBe('x1.3');
    tray.set([false, true, false], 12_300);
    expect(pizzas.map((f) => f.alpha)).toEqual([1, 0.35, 1]);
    expect(ticks.map((f) => f.visible)).toEqual([false, true, false]);
    expect(bonus.text).toBe('x1.3  13s');
    tray.set([true, true, false], -5);
    expect(bonus.text).toBe('sin bono');
    expect(tray.objects.length).toBe(made.length);
  });
});
