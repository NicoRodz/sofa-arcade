// The Pizzas lobby as the Captain's touch form: `buildLobbyMenu` turns the lobby state into the declarative snapshot the phone draws, and `decideMenuAct`
// judges one touch against that same snapshot (the screen validates against its own state, never trusts the phone) and says what to do about it.
// Pure: no DOM, no app state. apps/screen/src/pizzas/lobby-menu.ts feeds it and carries the effects out with the lobby's own functions.
import { DIFFICULTIES, DIFFICULTY_LABEL, params, type Difficulty } from '@pichi/core/difficulty';
import { hasModeChoice, selectableModes, type GameDef, type ModeId } from '@pichi/core/games';
import type { LobbyConfig, MenuActBody, MenuBody, MenuErrCode, MenuGroup, MenuItem, MenuOption, MenuRow } from '@pichi/core';
import { eventsOf } from '../sim/midround';
import { COOP_MAPS, SERIES_MAPS, fixedMap, lobbyMaps } from '../sim/maps';
import { mutateOf } from '../sim/mutate/plan';
import { SABOTAGE_BLURB, SABOTAGE_LABEL, SABOTAGE_OPTION, sabotageOf } from '../sim/sabotage-config';
import { VERSUS_AUTO, VERSUS_RANDOM, teamSizes, versusAvailability, versusLobbyMaps } from '../sim/versus/lobby';
import { versusMap } from '../sim/versus/maps';
import { MECHS_ROW, SEED_ROW, mechIdOfRow, mechRows } from './lobby-menu-mech';
import type { MechId } from '../sim/mech/ids';

export interface PizzasLobbyState {
  config: LobbyConfig;
  def: GameDef;
  connected: number; // phones connected now
  n: number; // lobbyN: the group size the coop map statuses are judged for
  startProblem: string; // '' when the round can start
  mapNotice: string;
  teamNotice: string;
}

// The page's own row ids (index.html, focus-rows.ts): a touch on a menu row moves the TV's focus ring to its box.
export const FOCUS_ROW: Readonly<Record<string, string>> = {
  difficulty: 'diffs',
  mode: 'modes',
  sabotage: 'sabs',
  events: 'evs',
  mutate: 'muts',
  map: 'maps',
  seed: 'maps',
  mechs: 'maps',
  teams: 'teambar',
  start: 'start',
};
const MODE_LABEL: Partial<Record<ModeId, string>> = { coop: 'Cooperativo', versus: 'Versus' };
const MODE_HINT: Partial<Record<ModeId, string>> = { coop: 'Cooperativo: todos cocinan juntos', versus: 'Versus: dos equipos compiten' };
const OPTION_LABEL: Record<string, string> = { hiddenScore: 'Marcador oculto', handicap: 'Ventaja equipo chico' };
const optRow = (id: string) => `opt-${id}`;
const yesNo = (on: boolean, tipYes: string, tipNo: string): string => (on ? tipYes : tipNo);
const isSeries = (id: string) => SERIES_MAPS.some((m) => m.id === id);

const mapName = (c: LobbyConfig): string =>
  c.map === 'auto' || c.map === VERSUS_AUTO
    ? 'Mapa al azar'
    : c.map === 'random' || c.map === VERSUS_RANDOM
      ? `Mapa aleatorio ${c.seed}`
      : ((fixedMap(c.map) ?? versusMap(c.map))?.name ?? 'Mapa');

function mapRow(st: PizzasLobbyState, vs: boolean): MenuRow {
  const item = (
    map: { id: string; name: string; nMin: number; nMax: number; stars: number },
    state: string,
    reason?: string,
  ): MenuItem => ({
    id: map.id,
    label: map.name,
    players: `${map.nMin}-${map.nMax}`,
    stars: map.stars,
    enabled: state !== 'blocked',
    ...(reason ? { reason } : {}),
  });
  let groups: MenuGroup[];
  if (vs)
    groups = [
      {
        id: 'versus',
        label: 'Versus',
        items: versusLobbyMaps(teamSizes(st.config.teams)).map(({ map, status }) =>
          item(map, status.state, 'reason' in status ? status.reason : undefined),
        ),
      },
    ];
  else {
    const rows = lobbyMaps(st.n, COOP_MAPS).map(({ map, status }) => ({
      group: isSeries(map.id) ? 'series' : 'classic',
      ...item(map, status.state, 'reason' in status ? status.reason : undefined),
    }));
    groups = [
      { id: 'classic', label: 'Clásicos', items: rows.filter((r) => r.group === 'classic').map(({ group: _g, ...i }) => i) },
      { id: 'series', label: 'Carta larga', items: rows.filter((r) => r.group === 'series').map(({ group: _g, ...i }) => i) },
    ];
  }
  const extras: MenuOption[] = vs
    ? [
        { id: VERSUS_AUTO, label: 'Aleatorio', enabled: true },
        { id: VERSUS_RANDOM, label: 'Mapa generado', enabled: true },
      ]
    : [
        { id: 'auto', label: 'Aleatorio', enabled: true },
        { id: 'random', label: 'Mapa generado', enabled: true },
      ];
  return {
    id: 'map',
    label: 'Mapa',
    kind: 'grid',
    value: st.config.map,
    options: extras,
    groups,
    fitFor: Math.min(99, Math.max(1, vs ? teamSizes(st.config.teams).reduce((a, b) => a + b, 0) || st.connected : st.n)),
    ...(st.mapNotice ? { hint: st.mapNotice.slice(0, 120) } : {}),
  };
}

export function buildLobbyMenu(st: PizzasLobbyState): MenuBody {
  const c = st.config;
  const vs = c.modeId === 'versus';
  const mode = selectableModes(st.def).find((m) => m.id === c.modeId);
  const pr = params(
    c.difficulty,
    vs ? Math.round(teamSizes(c.teams).reduce((a, b) => a + b, 0) / Math.max(1, teamSizes(c.teams).length)) : st.n,
  );
  const rows: MenuRow[] = [
    {
      id: 'difficulty',
      label: 'Dificultad',
      kind: 'choice',
      value: c.difficulty,
      hint: `Pedido cada ${(pr.orderEveryMs / 1000).toFixed(0)} s, paciencia ${pr.orderTtlMs / 1000} s, hasta ${pr.maxOrders} pedidos`,
      options: DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_LABEL[d], enabled: true })),
    },
  ];
  if (hasModeChoice(st.def))
    rows.push({
      id: 'mode',
      label: 'Modalidad',
      kind: 'choice',
      value: c.modeId,
      hint: st.teamNotice ? st.teamNotice.slice(0, 120) : MODE_HINT[c.modeId],
      options: selectableModes(st.def).map((m) => {
        const av = m.id === 'versus' ? versusAvailability(m, st.connected) : { ok: true, reason: '' };
        return { id: m.id, label: MODE_LABEL[m.id] ?? m.label, enabled: av.ok, ...(av.ok ? {} : { reason: av.reason.slice(0, 80) }) };
      }),
    });
  const sab = vs ? mode?.choices?.find((x) => x.id === SABOTAGE_OPTION) : undefined;
  if (sab) {
    const cur = sabotageOf(c.modeOptions);
    rows.push({
      id: 'sabotage',
      label: 'Sabotaje',
      kind: 'choice',
      value: cur,
      hint: SABOTAGE_BLURB[cur].slice(0, 120),
      options: sab.values.map((v) => ({ id: v.id, label: SABOTAGE_LABEL[v.id as keyof typeof SABOTAGE_LABEL] ?? v.label, enabled: true })),
    });
  }
  const ev = eventsOf(c.modeOptions, c.difficulty);
  rows.push({
    id: 'events',
    label: 'Eventos',
    kind: 'toggle',
    value: ev,
    hint: yesNo(ev, 'Un evento por ronda, entre el 1:00 y el 2:00', 'Sin eventos'),
  });
  if (!vs) {
    const mu = mutateOf(c.modeOptions, c.difficulty);
    rows.push({
      id: 'mutate',
      label: 'Cocina que cambia',
      kind: 'toggle',
      value: mu,
      hint: yesNo(mu, 'En los mapas que lo tienen, la cocina cambia a 1:30', 'La cocina no cambia'),
    });
  }
  rows.push(mapRow(st, vs), ...mechRows(c));
  if (vs && c.teams) {
    rows.push({
      id: 'teams',
      label: 'Equipos',
      kind: 'buttons',
      value: null,
      ...(st.teamNotice ? { hint: st.teamNotice.slice(0, 120) } : {}),
      options: [
        { id: 'shuffle', label: 'Mezclar', enabled: !c.teamsLocked, ...(c.teamsLocked ? { reason: 'Los equipos están bloqueados' } : {}) },
        { id: 'lock', label: c.teamsLocked ? 'Desbloquear' : 'Bloquear', enabled: true },
      ],
    });
    for (const o of mode?.options ?? [])
      rows.push({
        id: optRow(o.id),
        label: (OPTION_LABEL[o.id] ?? o.label).slice(0, 40),
        kind: 'toggle',
        value: c.modeOptions[o.id] === true,
      });
  }
  const sizes = teamSizes(c.teams);
  const people = `${st.connected} ${st.connected === 1 ? 'jugador' : 'jugadores'}${vs && sizes.length ? ` (${sizes.join(' vs ')})` : ''}`;
  const style = vs
    ? `Versus · ${DIFFICULTY_LABEL[c.difficulty]} · Sabotaje ${SABOTAGE_LABEL[sabotageOf(c.modeOptions)]}`
    : `${MODE_LABEL.coop} · ${DIFFICULTY_LABEL[c.difficulty]}`;
  return {
    screen: 'lobby',
    rows,
    primary: {
      id: 'start',
      label: '¡A cocinar!',
      enabled: !st.startProblem,
      ...(st.startProblem ? { reason: st.startProblem.slice(0, 120) } : {}),
      summary: [`Mapa: ${mapName(c)}`.slice(0, 80), style.slice(0, 80), people],
    },
  };
}

export type MenuEffect =
  | { kind: 'difficulty'; value: Difficulty }
  | { kind: 'mode'; value: ModeId }
  | { kind: 'sabotage' | 'map'; value: string }
  | { kind: 'events' | 'mutate' | 'mechs'; value: boolean }
  | { kind: 'mech'; id: MechId; value: boolean }
  | { kind: 'reseed' }
  | { kind: 'option'; id: string; value: boolean }
  | { kind: 'group'; value: 'classic' | 'series' }
  | { kind: 'shuffle' | 'lock' | 'start' }
  | { kind: 'focus' };
export type MenuDecision =
  | { ok: true; effect: MenuEffect; row?: string } // `row`: the menu row touched (the TV's focus ring follows it)
  | { ok: false; code: Exclude<MenuErrCode, 'notCaptain'>; msg: string };
const no = (msg: string, code: 'disabled' | 'stale' = 'disabled'): MenuDecision => ({ ok: false, code, msg });

/** One touch against the current snapshot. `rev` is the snapshot's current revision: `set` is idempotent (any rev is fine while its option is enabled), `start` needs the current one. */
export function decideMenuAct(st: PizzasLobbyState, act: MenuActBody, rev: number): MenuDecision {
  const menu = buildLobbyMenu(st);
  if (act.act === 'start') {
    if (act.rev !== rev) return no('Cambió la configuración: revisa y confirma', 'stale');
    return menu.primary.enabled
      ? { ok: true, effect: { kind: 'start' }, row: 'start' }
      : no(menu.primary.reason ?? 'Todavía no se puede empezar');
  }
  const row = menu.rows.find((r) => r.id === act.row);
  if (!row) return no('Esa opción ya no existe');
  if (act.act === 'focus') {
    const g = typeof act.value === 'string' && row.id === 'map' ? row.groups?.find((x) => x.id === act.value) : undefined;
    return g
      ? { ok: true, effect: { kind: 'group', value: g.id as 'classic' | 'series' }, row: row.id }
      : { ok: true, effect: { kind: 'focus' }, row: row.id };
  }
  if (act.act === 'press') {
    const opt = row.kind === 'buttons' ? row.options?.find((o) => o.id === act.value) : undefined;
    if (!opt) return no('Ese botón ya no existe');
    if (!opt.enabled) return no(opt.reason ?? 'No disponible ahora');
    if (row.id === SEED_ROW) return { ok: true, effect: { kind: 'reseed' }, row: row.id };
    return { ok: true, effect: { kind: opt.id === 'shuffle' ? 'shuffle' : 'lock' }, row: row.id };
  }
  // set
  if (row.kind === 'toggle') {
    if (typeof act.value !== 'boolean') return no('Valor no válido');
    const mech = mechIdOfRow(row.id);
    if (mech) return { ok: true, effect: { kind: 'mech', id: mech, value: act.value }, row: row.id };
    if (row.id === 'events' || row.id === 'mutate' || row.id === MECHS_ROW)
      return { ok: true, effect: { kind: row.id, value: act.value }, row: row.id };
    return { ok: true, effect: { kind: 'option', id: row.id.slice(4), value: act.value }, row: row.id };
  }
  if (row.kind !== 'choice' && row.kind !== 'grid') return no('Esa fila no se elige así');
  const opt: MenuOption | undefined =
    row.options?.find((o) => o.id === act.value) ?? row.groups?.flatMap((g) => g.items).find((i) => i.id === act.value);
  if (!opt) return no('Opción desconocida');
  if (!opt.enabled) return no(opt.reason ?? 'No disponible ahora');
  const v = opt.id;
  switch (row.id) {
    case 'difficulty':
      return { ok: true, effect: { kind: 'difficulty', value: v as Difficulty }, row: row.id };
    case 'mode':
      return { ok: true, effect: { kind: 'mode', value: v as ModeId }, row: row.id };
    case 'sabotage':
      return { ok: true, effect: { kind: 'sabotage', value: v }, row: row.id };
    case 'map':
      return { ok: true, effect: { kind: 'map', value: v }, row: row.id };
  }
  return no('Esa fila no se elige así');
}
