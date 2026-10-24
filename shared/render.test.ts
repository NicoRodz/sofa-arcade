import { describe, expect, it } from 'vitest';
import { controlHtml, esc, howToHtml, iconSvg } from './render';
import { GAMES } from './games';

describe('render', () => {
  it('escapes text', () => {
    expect(esc(`<b a="1">&'`)).toBe('&#60;b a=&#34;1&#34;&#62;&#38;&#39;');
  });
  it('control: icon + label, and the hold hint only for hold buttons', () => {
    const c = GAMES[0].controls;
    expect(controlHtml(c.btn2)).toContain('Picar / Correr');
    expect(controlHtml({ ...c.btn2, hold: true })).toContain('mantén apretado');
    expect(controlHtml(c.btn2)).not.toContain('mantén');
    expect(controlHtml(c.btn2)).toContain('<svg');
    expect(controlHtml(c.btn1)).toContain('Tomar / Soltar');
    expect(controlHtml(c.btn1)).not.toContain('mantén');
    expect(controlHtml({ label: '<script>', icon: 'grab' })).not.toContain('<script>');
  });
  it('how-to: numbered steps in order, with icons and the note', () => {
    const h = howToHtml(GAMES[0].howTo);
    expect((h.match(/<li>/g) ?? []).length).toBe(GAMES[0].howTo.steps.length);
    expect(h.indexOf('masa y tomate')).toBeLessThan(h.indexOf('horno'));
    expect(h).toContain('<span class="n">4</span>');
    expect(h).toContain('class="note"');
    expect(howToHtml({ steps: GAMES[0].howTo.steps })).not.toContain('class="note"');
    expect(iconSvg('oven')).toContain('currentColor');
  });
});
