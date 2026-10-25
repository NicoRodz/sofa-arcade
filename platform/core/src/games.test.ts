import { describe, expect, it } from 'vitest';
import {
  COMING_SOON,
  GAMES,
  GAME_IDS,
  HOWTO_MAX_STEPS,
  HOWTO_MIN_STEPS,
  LABEL_MAX,
  defaultModeOf,
  gameInfo,
  gameProblems,
  hasModeChoice,
  isGameId,
  modeOf,
  playersLabel,
  resolveModes,
  selectableModes,
  type GameDef,
  type ModeSpec,
} from './games';
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
    expect(pizzas.controls.btn2).toMatchObject({ label: 'Picar / Correr' });
    expect(pizzas.controls.btn1.hold).toBeUndefined();
    expect(pizzas.howTo.steps).toHaveLength(4);
    expect(pizzas.howTo.note).toMatch(/equipo/);
  });
  it('declares a player range the menu can use, and the authoring check rejects a broken one', () => {
    expect(pizzas).toMatchObject({ minPlayers: 2, maxPlayers: 8 });
    expect(playersLabel(pizzas)).toBe('2 a 8 jugadores');
    expect(playersLabel({ minPlayers: 4, maxPlayers: 4 })).toBe('4 jugadores');
    for (const [min, max] of [
      [0, 8],
      [5, 3],
      [1.5, 4],
    ] as const) {
      const bad = { ...clone(), minPlayers: min, maxPlayers: max };
      expect(
        gameProblems(bad).some((p) => p.startsWith('players')),
        `${min}-${max}`,
      ).toBe(true);
    }
  });
  it('the announced games are not in the registry, so config and phones never see them', () => {
    expect(COMING_SOON.length).toBeGreaterThanOrEqual(1); // obstaculos left the list when F3 published it
    for (const s of COMING_SOON) {
      expect(isGameId(s.id)).toBe(false);
      expect(s.name.length).toBeGreaterThan(0);
    }
  });
  it('every icon the registry references exists', () => {
    for (const g of GAMES)
      for (const i of [g.controls.stick.icon, g.controls.btn1.icon, g.controls.btn2.icon, ...g.howTo.steps.map((s) => s.icon)])
        expect(isIconId(i)).toBe(true);
    expect(ICON_IDS.length).toBeGreaterThan(5);
  });
  it('the authoring check rejects bad entries', () => {
    const noLabel = clone();
    (noLabel.controls.btn1 as { label: string }).label = '  ';
    expect(gameProblems(noLabel)).toContain('btn1: empty label');
    const longLabel = clone();
    (longLabel.controls.stick as { label: string }).label = 'x'.repeat(LABEL_MAX + 1);
    expect(gameProblems(longLabel)).toContain(`stick: label over ${LABEL_MAX} chars`);
    const badIcon = clone();
    (badIcon.controls.btn2 as { icon: string }).icon = 'nope';
    expect(gameProblems(badIcon)).toContain('btn2: unknown icon nope');
    const few = clone();
    (few.howTo as { steps: unknown[] }).steps = few.howTo.steps.slice(0, HOWTO_MIN_STEPS - 1);
    expect(gameProblems(few)[0]).toMatch(/steps/);
    const many = clone();
    (many.howTo as { steps: unknown[] }).steps = [...many.howTo.steps, ...many.howTo.steps].slice(0, HOWTO_MAX_STEPS + 1);
    expect(gameProblems(many)[0]).toMatch(/steps/);
    const longStep = clone();
    (longStep.howTo.steps[0] as { text: string }).text = 'y'.repeat(200);
    expect(gameProblems(longStep).some((p) => p.startsWith('step 1'))).toBe(true);
  });
  it('gameInfo and the config message carry the registry labels for every game', () => {
    for (const g of GAMES) {
      expect(gameInfo(g.id)).toEqual({ controls: g.controls, howTo: g.howTo });
      const m = configMsg({ ...DEFAULT_CONFIG, game: g.id });
      expect(m).toMatchObject({ t: 'config', game: g.id, controls: g.controls, howTo: g.howTo });
    }
    // a second game defines its own labels and the message follows the chosen one: no controller change involved
    const other: GameDef = {
      ...clone(),
      id: 'other',
      controls: {
        stick: { label: 'Girar', icon: 'move' },
        btn1: { label: 'Saltar', icon: 'grab' },
        btn2: { label: 'Disparar', icon: 'chop' },
      },
    };
    const two = [pizzas, other];
    expect(configMsg({ ...DEFAULT_CONFIG, game: 'other' as never }, two).controls.btn1.label).toBe('Saltar');
    expect(configMsg({ ...DEFAULT_CONFIG, game: 'pizzas' }, two).controls.btn1.label).toBe('Tomar / Soltar');
    expect(isGameId('pizzas')).toBe(true);
    expect(gameInfo('nope' as never).controls).toBe(pizzas.controls); // unknown id falls back to the default game
  });
});

describe('game modes', () => {
  const versus = () => pizzas.modes!.find((m) => m.id === 'versus')!;
  it('pizzas declares coop (the default, one team) and versus (two teams, k handicap, selectable since F1)', () => {
    expect(pizzas.modes!.map((m) => m.id)).toEqual(['coop', 'versus']);
    expect(defaultModeOf(pizzas)).toBe('coop');
    expect(modeOf(pizzas).id).toBe('coop');
    expect(modeOf(pizzas, 'nope').id).toBe('coop');
    expect(modeOf(pizzas, 'versus').id).toBe('versus');
    const coop = modeOf(pizzas, 'coop');
    expect(coop.teams).toMatchObject({ count: [1, 1], handicap: 'none' });
    expect(coop.soon).toBeUndefined();
    expect(versus()).toMatchObject({ players: [2, 8], teams: { count: [2, 2], maxRatio: 2, handicap: 'score-k' } });
    expect(versus().teams!.styles!.map((s) => s.name)).toEqual(['Picantes', 'Frescos']);
    expect(new Set(versus().teams!.styles!.map((s) => s.icon)).size).toBe(2); // colour is never the only difference
    expect(versus().options!.map((o) => o.id)).toEqual(['hiddenScore', 'handicap']);
  });
  it('F1 opened versus in the lobby (no longer "soon"): the selector shows; a game whose extra mode is "soon" still has none', () => {
    expect(versus().soon).toBeUndefined();
    expect(selectableModes(pizzas).map((m) => m.id)).toEqual(['coop', 'versus']);
    expect(hasModeChoice(pizzas)).toBe(true);
    const closed: GameDef = { ...clone(), modes: pizzas.modes!.map((m) => (m.id === 'versus' ? { ...m, soon: true } : m)) };
    expect(selectableModes(closed).map((m) => m.id)).toEqual(['coop']);
    expect(hasModeChoice(closed)).toBe(false);
  });
  it('a game that declares no modes gets one cooperative mode from its own fields', () => {
    const plain: GameDef = { ...clone(), modes: undefined, defaultMode: undefined, minPlayers: 3, maxPlayers: 5 };
    const modes = resolveModes(plain);
    expect(modes).toHaveLength(1);
    expect(modes[0]).toMatchObject({ id: 'coop', players: [3, 5], teams: { count: [1, 1] } });
    expect(defaultModeOf(plain)).toBe('coop');
    expect(hasModeChoice(plain)).toBe(false);
    expect(gameProblems(plain)).toEqual([]);
  });
  it('gameInfo overlays the mode controls and how-to on the game ones', () => {
    const custom: GameDef = {
      ...clone(),
      modes: [{ id: 'coop', label: 'C', players: [2, 8], controls: { btn2: { label: 'Dash', icon: 'chop' } } } as ModeSpec],
    };
    expect(gameInfo('pizzas', [custom], 'coop').controls.btn2.label).toBe('Dash');
    expect(gameInfo('pizzas', [custom], 'coop').controls.btn1.label).toBe('Tomar / Soltar'); // untouched ones stay
    expect(gameInfo('pizzas', [custom]).controls.btn2.label).toBe('Picar / Correr'); // no mode: the game's own
    expect(gameInfo('pizzas', [custom], 'nope').howTo).toBe(custom.howTo);
  });
  it('the authoring check rejects broken modes', () => {
    const bad = (f: (m: ModeSpec[]) => void, defaultMode?: GameDef['defaultMode']): string[] => {
      const g = clone();
      const modes = structuredClone(g.modes!) as ModeSpec[];
      f(modes);
      return gameProblems({ ...g, modes, defaultMode: defaultMode ?? g.defaultMode });
    };
    expect(gameProblems(pizzas)).toEqual([]);
    expect(bad(() => {}, 'race')).toContain('defaultMode race is not declared');
    expect(
      bad((m) => {
        m[1] = { ...m[0]!, soon: true };
      }),
    ).toContain('modes: duplicated id');
    expect(
      bad((m) =>
        m.forEach((x) => {
          x.soon = true;
        }),
      ),
    ).toContain('modes: none is selectable');
    expect(
      bad((m) => {
        m[1]!.players = [1, 12];
      }).some((p) => p.includes('outside the game')),
    ).toBe(true);
    expect(
      bad((m) => {
        (m[1]!.teams as unknown as { count: [number, number] }).count = [3, 2];
      }).some((p) => p.includes('bad team count')),
    ).toBe(true);
    expect(
      bad((m) => {
        (m[1]!.teams as unknown as { count: [number, number] }).count = [2, 4];
      }).some((p) => p.includes('styles for up to 4')),
    ).toBe(true);
    expect(
      bad((m) => {
        m[1]!.teams!.maxRatio = 0.5;
      }).some((p) => p.includes('maxRatio')),
    ).toBe(true);
    expect(
      bad((m) => {
        (m[0]!.teams as unknown as { count: [number, number] }).count = [2, 2];
      }).some((p) => p.includes('coop is a single team')),
    ).toBe(true);
    expect(
      bad((m) => {
        m[1]!.howTo!.steps = m[1]!.howTo!.steps.slice(0, 1);
      }).some((p) => p.includes('howTo 1 steps')),
    ).toBe(true);
    expect(
      bad((m) => {
        m[1]!.options = [...m[1]!.options!, m[1]!.options![0]!];
      }),
    ).toContain('mode versus: duplicated option id');
    expect(
      bad((m) => {
        m[0]!.label = ' ';
      }),
    ).toContain('mode coop: empty label');
  });
});
