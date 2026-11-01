import { describe, expect, it } from 'vitest';
import { compose } from './compose';

describe('compose (screen fragments)', () => {
  it('replaces a slot line with the parts, one per line, without their trailing newline', () => {
    const out = compose('<a>\n<!--slot:x-->\n</a>\n', { x: ['  <b></b>\n', '  <i></i>\n'] });
    expect(out).toBe('<a>\n  <b></b>\n  <i></i>\n</a>\n');
  });

  it('fills a slot written inline in a line', () => {
    expect(compose('<p>a<!--slot:in-->c</p>', { in: ['b'] })).toBe('<p>abc</p>');
  });

  it('keeps a template without slots as it is', () => {
    expect(compose('<div></div>\n')).toBe('<div></div>\n');
  });

  it('throws on a slot nobody fills', () => {
    expect(() => compose('<!--slot:missing-->', {})).toThrow(/missing/);
    expect(() => compose('<!--slot:missing-->', { missing: [] })).toThrow(/missing/);
  });

  it('throws on a fill for a slot that does not exist', () => {
    expect(() => compose('<div></div>', { extra: ['x'] })).toThrow(/extra/);
  });
});
