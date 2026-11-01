import { describe, expect, it } from 'vitest';
import { kudosTemplate } from './view';

describe('results kudos template (no DOM: static parts and bound values of the TemplateResult)', () => {
  it('draws one <div> per line, with the text bound (lit escapes it) and not concatenated', () => {
    const t = kudosTemplate({ lines: ['<b>Nico</b> & Angi', 'Pablo'], hidden: false });
    const lines = t.values[0] as { strings: string[]; values: unknown[] }[];
    expect(lines).toHaveLength(2);
    expect(lines[0]!.strings.join('|')).toBe('<div>|</div>');
    expect(lines.map((l) => l.values[0])).toEqual(['<b>Nico</b> & Angi', 'Pablo']);
  });
  it('draws nothing for an empty list', () => {
    expect(kudosTemplate({ lines: [], hidden: true }).values[0]).toEqual([]);
  });
});
