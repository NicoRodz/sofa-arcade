import { describe, expect, it, vi } from 'vitest';

vi.mock('@pichi/screen-kit/art/chef', () => ({ chefCanvas: (slot: number) => `canvas:${slot}` }));
const { awardTemplate, levelTemplate } = await import('./view');

const card = {
  lost: false,
  medalCls: 'gold',
  medalGlyph: 'O',
  name: '<Nivel>',
  biomeColor: '#fc0',
  sub: 'Nivel 1',
  time: '0:03 / par 1:15',
  stars: '1/3 ★',
  lives: '12 · caídas 0',
  checkpoints: '0/1',
  pts: '+2910',
};

describe('Obstaculos results templates (no DOM: static parts and bound values)', () => {
  it('level card keeps the classes the stylesheet relies on and binds every value, name included (lit escapes it)', () => {
    const t = levelTemplate(card);
    const s = t.strings.join('|');
    for (const cls of ['olv', 'h', 'medal', 'sub', 'bio', 'row', 'pts']) expect(s).toContain(`class="${cls}`);
    for (const label of ['Tiempo', 'Estrellas', 'Vidas', 'Checkpoints']) expect(s).toContain(`<span>${label}</span>`);
    // in template order: lost class, medal class and glyph, name, biome style, sub, time, stars, lives, checkpoints, points
    expect(t.values.map((v) => (typeof v === 'object' ? 'style' : v))).toEqual([
      '',
      'gold',
      'O',
      '<Nivel>',
      'style',
      'Nivel 1',
      '0:03 / par 1:15',
      '1/3 ★',
      '12 · caídas 0',
      '0/1',
      '+2910',
    ]);
    expect(JSON.stringify(t.values)).toContain('#fc0');
  });
  it('a lost level adds the "lost" class', () => {
    expect(levelTemplate({ ...card, lost: true }).values[0]).toBe(' lost');
    expect(levelTemplate(card).values[0]).toBe('');
  });
  it('award: title is the reason, the chef canvas goes first, label and name are bound', () => {
    const t = awardTemplate({ label: 'Taxi', why: 'lanzamientos y manos', slot: 2, name: 'Angi' });
    expect(t.strings[0]).toContain('class="award"');
    expect(t.values).toEqual(['lanzamientos y manos', 'canvas:2', 'Taxi', 'Angi']);
  });
});
