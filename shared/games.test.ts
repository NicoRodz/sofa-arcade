import { describe, expect, it } from 'vitest';
import { GAMES, GAME_IDS, HOWTO_MAX_STEPS, HOWTO_MIN_STEPS, LABEL_MAX, gameInfo, gameProblems, isGameId, type GameDef } from './games';
import { ICON_IDS, isIconId } from './icons';
import { configMsg, DEFAULT_CONFIG } from './protocol';

const pizzas = GAMES[0] as GameDef;
const clone = (): GameDef => structuredClone(pizzas) as GameDef;

describe('game registry', () => {
  it('has unique ids and every entry passes the authoring check', () => {
    expect(new Set(GAME_IDS).size).toBe(GAMES.length);
    for (const g of GAMES) expect(gameProblems(g), g.id).toEqual([]);
  });
  it('pizzas declares the agreed labels and four how-to steps', () => {
    expect(pizzas.controls.stick).toMatchObject({ label: 'Mover' });
    expect(pizzas.controls.btn1).toMatchObject({ label: 'Tomar / Soltar' });
    expect(pizzas.controls.btn2).toMatchObject({ label: 'Picar', hold: true });
    expect(pizzas.controls.btn1.hold).toBeUndefined();
    expect(pizzas.howTo.steps).toHaveLength(4);
    expect(pizzas.howTo.note).toMatch(/equipo/);
  });
  it('every icon the registry references exists', () => {
    for (const g of GAMES) for (const i of [g.controls.stick.icon, g.controls.btn1.icon, g.controls.btn2.icon, ...g.howTo.steps.map((s) => s.icon)]) expect(isIconId(i)).toBe(true);
    expect(ICON_IDS.length).toBeGreaterThan(5);
  });
  it('the authoring check rejects bad entries', () => {
    const noLabel = clone(); (noLabel.controls.btn1 as { label: string }).label = '  ';
    expect(gameProblems(noLabel)).toContain('btn1: empty label');
    const longLabel = clone(); (longLabel.controls.stick as { label: string }).label = 'x'.repeat(LABEL_MAX + 1);
    expect(gameProblems(longLabel)).toContain(`stick: label over ${LABEL_MAX} chars`);
    const badIcon = clone(); (badIcon.controls.btn2 as { icon: string }).icon = 'nope';
    expect(gameProblems(badIcon)).toContain('btn2: unknown icon nope');
    const few = clone(); (few.howTo as { steps: unknown[] }).steps = few.howTo.steps.slice(0, HOWTO_MIN_STEPS - 1);
    expect(gameProblems(few)[0]).toMatch(/steps/);
    const many = clone(); (many.howTo as { steps: unknown[] }).steps = [...many.howTo.steps, ...many.howTo.steps].slice(0, HOWTO_MAX_STEPS + 1);
    expect(gameProblems(many)[0]).toMatch(/steps/);
    const longStep = clone(); (longStep.howTo.steps[0] as { text: string }).text = 'y'.repeat(200);
    expect(gameProblems(longStep).some((p) => p.startsWith('step 1'))).toBe(true);
  });
  it('gameInfo and the config message carry the registry labels for every game', () => {
    for (const g of GAMES) {
      expect(gameInfo(g.id)).toEqual({ controls: g.controls, howTo: g.howTo });
      const m = configMsg({ ...DEFAULT_CONFIG, game: g.id });
      expect(m).toMatchObject({ t: 'config', game: g.id, controls: g.controls, howTo: g.howTo });
    }
    // a second game defines its own labels and the message follows the chosen one: no controller change involved
    const other: GameDef = { ...clone(), id: 'other', controls: { stick: { label: 'Girar', icon: 'move' }, btn1: { label: 'Saltar', icon: 'grab' }, btn2: { label: 'Disparar', icon: 'chop' } } };
    const two = [pizzas, other];
    expect(configMsg({ ...DEFAULT_CONFIG, game: 'other' as never }, two).controls.btn1.label).toBe('Saltar');
    expect(configMsg({ ...DEFAULT_CONFIG, game: 'pizzas' }, two).controls.btn1.label).toBe('Tomar / Soltar');
    expect(isGameId('pizzas')).toBe(true);
    expect(gameInfo('nope' as never).controls).toBe(pizzas.controls); // unknown id falls back to the default game
  });
});
