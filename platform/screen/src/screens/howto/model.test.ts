import { describe, expect, it } from 'vitest';
import { HOWTO_MS } from '../../howto';
import { howToView } from './model';

const at = (mode: 'start' | 'preview', dt: number) => howToView({ mode, startedAt: 1000 }, 1000 + dt, 'Pizzas', '<ol></ol>');

describe('how-to view model', () => {
  it('start card: bar visible, fill follows the clock, seconds count down', () => {
    expect(at('start', 0)).toEqual({ game: 'Pizzas', bodyHtml: '<ol></ol>', showBar: true, fillWidth: '0.0%', seconds: 10 });
    expect(at('start', HOWTO_MS / 2)).toMatchObject({ fillWidth: '50.0%', seconds: 5 });
  });
  it('start card is gone (null) once the time runs out', () => {
    expect(at('start', HOWTO_MS)).toBeNull();
  });
  it('preview: no bar, no countdown, never expires', () => {
    expect(at('preview', HOWTO_MS * 5)).toMatchObject({ showBar: false, fillWidth: '0', seconds: null });
  });
});
