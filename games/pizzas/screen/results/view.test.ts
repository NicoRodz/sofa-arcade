import { describe, expect, it, vi } from 'vitest';

vi.mock('@pichi/screen-kit/art/chef', () => ({ chefCanvas: (slot: number) => `canvas:${slot}` }));
const { podiumEntryTemplate, podiumTemplate, starlineTemplate, statTemplate } = await import('./view');

describe('Pizzas results templates (no DOM: static parts and bound values)', () => {
  it('starline: bold numbers bound, or the plain three-stars line', () => {
    const t = starlineTemplate({ next: 335, missing: 75 });
    expect(t.strings.join('|')).toBe('Próxima estrella a <b>|</b> · te faltaron <b>|</b>');
    expect(t.values).toEqual([335, 75]);
    expect(starlineTemplate(null).strings.join('')).toBe('¡Tres estrellas!');
  });
  it('stat tile: class from the model, value and label bound', () => {
    const t = statTemplate({ cls: 'bad', value: 3, label: 'Falladas' });
    expect(t.strings.join('|')).toBe('<div class="stat |"><b>|</b><span>|</span></div>');
    expect(t.values).toEqual(['bad', 3, 'Falladas']);
  });
  it('podium entry: canvas first, crown only when asked, name escaped by binding, singular/plural', () => {
    const one = podiumEntryTemplate({ place: 1, slot: 3, name: '<Nico>', count: 1, crown: true });
    expect(one.strings[0]).toBe('<div class="pod p');
    expect(one.values[0]).toBe(1);
    expect(one.values[1]).toBe('canvas:3');
    expect(JSON.stringify(one.values[2])).toContain('crown');
    expect(one.values.slice(3)).toEqual(['<Nico>', 1, 'pizza']);
    const many = podiumEntryTemplate({ place: 2, slot: 0, name: 'A', count: 2, crown: false });
    expect(many.values[2]).not.toMatchObject({ strings: expect.anything() });
    expect(many.values.at(-1)).toBe('pizzas');
  });
  it('podium: the hint when nobody delivered', () => {
    expect(podiumTemplate([]).strings.join('')).toContain('Nadie alcanzó a entregar una pizza');
  });
});
