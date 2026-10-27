// The Obstaculos quick-game lobby as the Captain's touch form (mode, difficulty, level grid) and the judge of each touch against it. Same contract as
// games/pizzas/screen/lobby-menu.ts: pure, no DOM, the screen validates against its own state. Level ids are `lv<N>`; "Aleatorio" is the grid's extra, `lvr`.
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '@pichi/core/difficulty';
import type { MenuActBody, MenuBody, MenuErrCode, MenuItem, MenuRow } from '@pichi/core';
import { LEVELS } from '../levels';
import { MODE_BLURB, MODE_LABEL, RANDOM_LEVEL, levelCompat, type ObstOptions } from '../lobby';
import type { GameMode } from '../types';

export interface ObstLobbyState {
  opts: ObstOptions;
  difficulty: Difficulty;
  n: number; // connected phones
  seed: number;
  notice: string; // why the lobby moved the level by itself
}
// The page's own ids: a touch moves the TV's focus ring to its box.
export const OBST_FOCUS_ROW: Readonly<Record<string, string>> = { mode: 'obstmodes', level: 'obstlevels', start: 'start' };
const LEVEL_PREFIX = 'lv';
const RANDOM_ID = `${LEVEL_PREFIX}r`;
const levelId = (level: number) => (level === RANDOM_LEVEL ? RANDOM_ID : `${LEVEL_PREFIX}${level}`);

export function buildObstMenu(st: ObstLobbyState): MenuBody {
  const { opts, n } = st;
  const items: MenuItem[] = LEVELS.map((l, i) => {
    const c = levelCompat(l, n, opts.tether);
    return {
      id: levelId(i + 1),
      label: `${i + 1}. ${l.name}`.slice(0, 40),
      players: `${l.players.min}-${l.players.max}`,
      stars: l.stars,
      enabled: c.ok,
      ...(c.ok ? {} : { reason: c.reason }),
    };
  });
  const rows: MenuRow[] = [
    {
      id: 'mode',
      label: 'Modalidad',
      kind: 'choice',
      value: opts.tether,
      hint: MODE_BLURB[opts.tether],
      options: (['chain', 'free'] as GameMode[]).map((m) => ({ id: m, label: MODE_LABEL[m], enabled: true })),
    },
    {
      id: 'difficulty',
      label: 'Dificultad',
      kind: 'choice',
      value: st.difficulty,
      options: DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_LABEL[d], enabled: true })),
    },
    {
      id: 'level',
      label: 'Nivel',
      kind: 'grid',
      value: levelId(opts.level),
      fitFor: n,
      options: [{ id: RANDOM_ID, label: 'Aleatorio', enabled: true }],
      groups: [{ id: 'levels', label: 'Niveles', items }],
      ...(st.notice ? { hint: st.notice.slice(0, 120) } : {}),
    },
  ];
  const level =
    opts.level === RANDOM_LEVEL ? `Aleatorio (semilla ${st.seed})` : `Nivel ${opts.level}: ${LEVELS[opts.level - 1]?.name ?? ''}`;
  return {
    screen: 'lobby',
    rows,
    primary: {
      id: 'start',
      label: '¡A cruzar!',
      enabled: n >= 2,
      ...(n >= 2 ? {} : { reason: 'Se necesitan al menos 2 jugadores' }),
      summary: [level.slice(0, 80), `${MODE_LABEL[opts.tether]} · ${DIFFICULTY_LABEL[st.difficulty]}`, `${n} jugadores`],
    },
  };
}

export type ObstEffect =
  | { kind: 'mode'; value: GameMode }
  | { kind: 'difficulty'; value: Difficulty }
  | { kind: 'level'; value: number }
  | { kind: 'start' | 'focus' };
export type ObstDecision =
  | { ok: true; effect: ObstEffect; row?: string }
  | { ok: false; code: Exclude<MenuErrCode, 'notCaptain'>; msg: string };
const no = (msg: string, code: 'disabled' | 'stale' = 'disabled'): ObstDecision => ({ ok: false, code, msg });

/** One touch against the current snapshot: `set` is idempotent, `start` needs the current revision. */
export function decideObstAct(st: ObstLobbyState, act: MenuActBody, rev: number): ObstDecision {
  const menu = buildObstMenu(st);
  if (act.act === 'start') {
    if (act.rev !== rev) return no('Cambió la configuración: revisa y confirma', 'stale');
    return menu.primary.enabled
      ? { ok: true, effect: { kind: 'start' }, row: 'start' }
      : no(menu.primary.reason ?? 'Todavía no se puede empezar');
  }
  const row = menu.rows.find((r) => r.id === act.row);
  if (!row) return no('Esa opción ya no existe');
  if (act.act === 'focus') return { ok: true, effect: { kind: 'focus' }, row: row.id };
  if (act.act !== 'set' || (row.kind !== 'choice' && row.kind !== 'grid')) return no('Esa fila no se elige así');
  const opt = row.options?.find((o) => o.id === act.value) ?? row.groups?.flatMap((g) => g.items).find((i) => i.id === act.value);
  if (!opt) return no('Opción desconocida');
  if (!opt.enabled) return no(opt.reason ?? 'No disponible ahora');
  if (row.id === 'mode') return { ok: true, effect: { kind: 'mode', value: opt.id as GameMode }, row: row.id };
  if (row.id === 'difficulty') return { ok: true, effect: { kind: 'difficulty', value: opt.id as Difficulty }, row: row.id };
  const level = opt.id === RANDOM_ID ? RANDOM_LEVEL : Number(opt.id.slice(LEVEL_PREFIX.length));
  return { ok: true, effect: { kind: 'level', value: level }, row: row.id };
}
