// Relay messages that put the phone page in each state: builders and fixtures shared by the scenario lists (moved out of harness.ts).

export interface ControlsMsg {
  stick: { label: string; icon: string; hold?: boolean };
  btn1: { label: string; icon: string; hold?: boolean };
  btn2: { label: string; icon: string; hold?: boolean };
}
export const PIZZAS: ControlsMsg = {
  stick: { label: 'Mover', icon: 'move' },
  btn1: { label: 'Tomar / Soltar', icon: 'grab' },
  btn2: { label: 'Picar / Correr', icon: 'chop' },
};
// A future game at the registry's limits: 14-char labels and the "hold" hint on both buttons.
export const LONG: ControlsMsg = {
  stick: { label: 'Apuntar largo!', icon: 'move' },
  btn1: { label: 'Desplazamiento', icon: 'grab', hold: true },
  btn2: { label: 'Mmmmmmm Mmmmmm', icon: 'chop', hold: true },
};
// The real registry labels of Obstaculos (platform/core/src/games.ts) and the campaign flag the screen puts in phase.match: it makes the phone show the signal pad.
export const OBST: ControlsMsg = {
  stick: { label: 'Moverse', icon: 'move' },
  btn1: { label: 'Saltar', icon: 'jump' },
  btn2: { label: 'Agarrar', icon: 'grab' },
};
export const CAMPAIGN_MATCH = {
  match: { gameId: 'obstaculos', modeId: 'coop', mapId: 'campaign', difficulty: 'normal', teams: null, modeOptions: { campaign: true } },
};
export const HOWTO = {
  steps: [
    { icon: 'crate', text: 'Toma masa y tomate de las cajas' },
    { icon: 'chop', text: 'Pícalos en la tabla manteniendo el botón' },
    { icon: 'oven', text: 'Llévalos al horno y espera' },
    { icon: 'bell', text: 'Entrega la pizza en el mostrador antes de que venza el pedido' },
  ],
  note: 'Todos cooperan por el puntaje de equipo',
};
export const HOWTO_LONG = {
  steps: HOWTO.steps.map((s) => ({ ...s, text: (s.text + ' y además todo lo que haga falta para terminar').slice(0, 70) })),
  note: 'Todos cooperan por el puntaje de equipo y nadie se queda atrás',
};
export const POOL = ['masa', 'corte', 'queso', 'horno', 'reparto', 'lavado', 'apoyo', 'prep'];
export const puestos = (id: number, list: string[], cheese = true) => ({ cheese, sink: true, assign: [{ id, puestos: list, pool: POOL }] });

export const player = (name: string, id = 1, color = '#E63B2E') => ({ t: 'joined', player: { id, name, color, slot: 0 }, room: 'main' });
export const config = (controls: ControlsMsg = PIZZAS, howTo = HOWTO) => ({
  t: 'config',
  game: controls === OBST ? 'obstaculos' : 'pizzas',
  difficulty: 'normal',
  map: 'auto',
  seed: 1,
  controls,
  howTo,
});
export const captain = (id: number | null = 1) => ({ t: 'captain', playerId: id }); // the relay's crown message: id 1 is the phone every scenario plays
export const phase = (p: string, extra: object = {}) => ({ t: 'phase', phase: p, ...extra });
export const VS_TEAMS = [
  { id: 0, name: 'Picantes', color: '#A8330A', icon: '▲', side: 'izquierda', playerIds: [1] },
  { id: 1, name: 'Frescos', color: '#14338A', icon: '●', side: 'derecha', playerIds: [2] },
];
export const vsConfig = () => ({
  ...config(),
  modeId: 'versus',
  teams: VS_TEAMS,
  teamsLocked: true,
  modeOptions: { hiddenScore: true, handicap: true },
});
export const you = (team: number) => ({
  t: 'you',
  teamId: team,
  color: VS_TEAMS[team]!.color,
  icon: VS_TEAMS[team]!.icon,
  sideLabel: VS_TEAMS[team]!.side,
});
export const vsResult = (verdict: string, winner: number | null) => ({
  verdict,
  winner,
  scores: [
    { team: 0, score: 410 },
    { team: 1, score: 340 },
  ],
});

// contextual buttons: the screen sends the label, the glyph and the greyed state of A and B with the state of every tick
export const hint = (h: object) => ({ t: 'hint', ...h });
export const school = (step: number, text: string, btn: 'a' | 'b', done = false) => ({
  t: 'school',
  step,
  total: 4,
  text,
  btn,
  ...(done ? { done: true } : {}),
});
export const SCHOOL = [player('Nico'), config(), phase('lobby'), phase('school')];
export const PLAYING = [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['horno', 'reparto']) })];

export const WIDE = `document.documentElement.style.setProperty('--font', 'Verdana, sans-serif'); window.dispatchEvent(new Event('resize'))`;
