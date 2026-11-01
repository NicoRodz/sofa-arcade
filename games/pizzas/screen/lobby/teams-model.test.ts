import { describe, expect, it } from 'vitest';
import { OPTION_PILL, plural, teamHead, teamHint, teambarView, yesNo } from './teams-model';

const ok = (k: number[]) => ({ ok: true as const, k });

describe('Pizzas lobby team model', () => {
  it('plural: 1 is singular, 0 and the rest plural', () => {
    expect([0, 1, 2].map((n) => plural(n, 'jugador', 'jugadores'))).toEqual(['0 jugadores', '1 jugador', '2 jugadores']);
  });
  it('team heading: the multiplier is shown only above x1 (0 hides it) and the count follows the roster', () => {
    const t = { icon: 'T', name: 'Rojo', playerIds: [1, 2, 3, 4] };
    expect(teamHead(t, 1)).toEqual({ icon: 'T', name: 'Rojo', k: 0, count: '4 jugadores' });
    expect(teamHead(t, 1.5).k).toBe(1.5);
    expect(teamHead({ ...t, playerIds: [9] }, 2)).toMatchObject({ k: 2, count: '1 jugador' });
  });
  it('team hint: the notice wins, then the setup problem, then the size gap, then the Ayudante rule, then the plain hint', () => {
    const base = { notice: '', setup: ok([1, 1]), sizes: [4, 4], handicap: true };
    expect(teamHint({ ...base, notice: 'Equipos bloqueados' })).toEqual({ text: 'Equipos bloqueados', bad: true });
    expect(teamHint({ ...base, setup: { ok: false, problems: ['Falta un jugador', 'otro'] } })).toEqual({
      text: 'Falta un jugador',
      bad: true,
    });
    expect(teamHint({ ...base, setup: ok([1, 1.5]), sizes: [5, 3] })).toEqual({ text: '5 contra 3: el equipo de 3 gana ×1.5', bad: false });
    expect(teamHint({ ...base, setup: ok([1, 1.5]), sizes: [5, 3], handicap: false }).text).toBe(
      '5 contra 3, sin ventaja para el equipo chico',
    );
    expect(teamHint({ ...base, setup: ok([1, 2]) }).text).toBe('Con Ayudante pesa 0,7: el equipo con más ayuda gana ×2');
    expect(teamHint(base)).toEqual({ text: 'Clic en un jugador: cambia de equipo', bad: false });
  });
  it('team bar: the lock label flips with the state; options use the short pill labels and are on only for a literal true', () => {
    const hint = { text: 'x', bad: false };
    const opts = [
      { id: 'hiddenScore', label: 'Ocultar el marcador hasta el final' },
      { id: 'handicap', label: 'sentence' },
      { id: 'other', label: 'Otra' },
    ];
    const v = teambarView(true, opts, { hiddenScore: true, handicap: 1 as unknown as boolean }, hint);
    expect(v.locked).toBe(true);
    expect(v.lockLabel).toBe('Desbloquear equipos');
    expect(v.options).toEqual([
      { id: 'hiddenScore', label: OPTION_PILL.hiddenScore, on: true },
      { id: 'handicap', label: OPTION_PILL.handicap, on: false },
      { id: 'other', label: 'Otra', on: false },
    ]);
    expect(teambarView(false, [], {}, hint).lockLabel).toBe('Bloquear equipos');
  });
  it('yes/no pills: Si first, exactly one selected, the title comes from the callback', () => {
    const p = yesNo(false, (v) => `t${v}`);
    expect(p).toEqual([
      { id: 'true', label: 'Sí', title: 'ttrue', selected: false },
      { id: 'false', label: 'No', title: 'tfalse', selected: true },
    ]);
  });
});
