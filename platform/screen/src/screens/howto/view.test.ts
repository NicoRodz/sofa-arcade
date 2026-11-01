import { describe, expect, it } from 'vitest';
import { howToTemplate } from './view';

const model = { game: 'Pizzas', bodyHtml: '<ol></ol>', showBar: true, fillWidth: '10.0%', seconds: 7 };
const skeleton = (m = model) => howToTemplate(m).strings.join('|');

describe('how-to template (no DOM: static parts and bound values of the TemplateResult)', () => {
  it('keeps the ids the stylesheet and the phones rely on', () => {
    const s = skeleton();
    for (const id of ['howtogame', 'howtobody', 'howtobar', 'howtofill', 'howtohint']) expect(s).toContain(`id="${id}"`);
    expect(s).toContain('Cómo se juega');
  });
  it('binds game name, steps html, bar visibility and fill width from the model', () => {
    const v = howToTemplate(model).values;
    expect(v[0]).toBe('Pizzas');
    expect(JSON.stringify(v)).toContain('<ol></ol>');
    expect(JSON.stringify(v)).toContain('10.0%');
    expect(JSON.stringify(v)).toContain('visible');
  });
  it('hint: countdown on the start card, close hint on the preview', () => {
    const hint = (m: typeof model) => JSON.stringify((howToTemplate(m).values as unknown[]).at(-1));
    expect(hint(model)).toContain('Empieza en');
    expect(hint({ ...model, seconds: null as never })).toContain('para cerrar');
  });
});
