// Manchazo's phone in the round (F9), as states the layout test and the capture script load: the team background, the card in hand, the status "¡MAREADO!" and the notices.
// Messages are the real ones of the relay (the screen's `hint` and `buzz`, v7). The notice lasts ~1.3 s on the phone, so a scenario that shows one ends with it.
import type { Scenario } from './scenario-types';

const TEAMS = [
  { id: 0, name: 'Naranja', color: '#E69F00', icon: '▲', playerIds: [1] },
  { id: 1, name: 'Azul', color: '#0072B2', icon: '●', playerIds: [2] },
];
const CONTROLS = { stick: { label: 'Moverse', icon: 'move' }, btn1: { label: 'Piñata', icon: 'star' }, btn2: { label: 'Sabotaje', icon: 'bell' } };
const base = (team: 0 | 1): object[] => [
  { t: 'joined', player: { id: 1, name: 'Nico', color: team ? '#2F7DE1' : '#FF7A1A', slot: 0 }, room: 'main' },
  { t: 'config', game: 'arena', difficulty: 'normal', map: 'auto', seed: 1, controls: CONTROLS, howTo: { steps: [{ icon: 'move', text: 'Muévete' }] }, modeId: 'versus', teams: TEAMS, teamsLocked: true, modeOptions: {} },
  { t: 'you', teamId: team, color: TEAMS[team]!.color, icon: TEAMS[team]!.icon },
  { t: 'phase', phase: 'lobby' },
  { t: 'phase', phase: 'playing' },
];
const hint = (h: object) => ({ t: 'hint', a: null, b: 'Sin sabotaje', bIcon: 'star', bOff: true, ...h });
const buzz = (kind: string) => ({ t: 'buzz', kind });

export const MANCHAZO_SCENARIOS: Scenario[] = [
  { name: 'manchazo-orange', msgs: [...base(0), hint({})] },
  { name: 'manchazo-blue', msgs: [...base(1), hint({})] },
  { name: 'manchazo-card', msgs: [...base(0), hint({ b: 'Turpentina', bIcon: 'wash', bOff: false, card: 'turpentine' })] },
  { name: 'manchazo-dizzy', msgs: [...base(1), hint({ a: '¡Mareado! Stick al revés', aIcon: 'bell', st: 'dizzy' })] },
  { name: 'manchazo-stained', msgs: [...base(0), hint({ st: 'stained' }), buzz('stain'), buzz('lootlost')] },
  { name: 'manchazo-rescued', msgs: [...base(0), hint({}), buzz('rescued')] },
  { name: 'manchazo-phase', msgs: [...base(1), hint({}), buzz('phase')] },
  { name: 'manchazo-hourglass', msgs: [...base(0), hint({}), buzz('hourglass')] },
];
