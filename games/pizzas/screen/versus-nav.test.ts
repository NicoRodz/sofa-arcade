import { describe, expect, it } from 'vitest';
import { VERSUS_NAV, versusNavStep } from './versus-nav';

describe('versus pause and results: keys and the Captain D-pad', () => {
  it('the pause bar: arrows toggle between the two buttons, Enter presses the highlighted one', () => {
    expect(versusNavStep('pause', 0, 'ArrowRight', false)).toEqual({ handled: true, sel: 1, press: null });
    expect(versusNavStep('pause', 1, 'ArrowRight', false).sel).toBe(0);
    expect(versusNavStep('pause', 0, 'ArrowLeft', false).sel).toBe(1);
    expect(versusNavStep('pause', 0, 'Enter', false).press).toBe('pcont'); // Seguir sin ganador
    expect(versusNavStep('pause', 1, 'Enter', false).press).toBe('pend'); // Terminar
  });
  it('the results: Revancha is the default, the arrows reach the other two, Esc is Volver al lobby', () => {
    expect(versusNavStep('results', 0, 'Enter', false).press).toBe('vs-rematch');
    expect(versusNavStep('results', 0, 'ArrowRight', false).sel).toBe(1);
    expect(versusNavStep('results', 1, 'Enter', false).press).toBe('vs-shuffle'); // Cambiar equipos
    expect(versusNavStep('results', 2, 'Enter', false).press).toBe('vs-lobby');
    expect(versusNavStep('results', 2, 'ArrowRight', false).sel).toBe(0);
    expect(versusNavStep('results', 0, 'Escape', false)).toEqual({ handled: true, sel: 0, press: 'vs-lobby' });
  });
  it('a held key never presses twice, Esc on the pause does nothing and other keys are not taken', () => {
    expect(versusNavStep('results', 0, 'Enter', true).press).toBeNull();
    expect(versusNavStep('results', 0, 'Escape', true).press).toBeNull();
    expect(versusNavStep('pause', 0, 'Escape', false)).toEqual({ handled: false, sel: 0, press: null });
    expect(versusNavStep('results', 0, 'h', false).handled).toBe(false);
  });
  it('every button of the table exists in the screen HTML', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('../../../apps/screen/index.html', import.meta.url), 'utf8');
    for (const ctx of Object.values(VERSUS_NAV)) for (const id of ctx.buttons) expect(html).toContain(`id="${id}"`);
  });
});
