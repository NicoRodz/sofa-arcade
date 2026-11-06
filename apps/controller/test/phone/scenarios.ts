// The phone layout scenarios: relay messages that put the page in each state (moved out of harness.ts; order is the test order).
import { assistHelpScenarios } from '../assist-scenarios';
import type { Scenario } from '../scenario-types';
import {
  CAMPAIGN_MATCH,
  HOWTO_LONG,
  LONG,
  OBST,
  PIZZAS,
  PLAYING,
  SCHOOL,
  WIDE,
  captain,
  config,
  hint,
  phase,
  player,
  puestos,
  school,
  vsConfig,
  vsResult,
  you,
} from './scenario-msgs';
import { SCENARIOS_BEFORE_ASSIST_HELP } from './scenarios-lobby';

export const SCENARIOS: Scenario[] = [
  ...SCENARIOS_BEFORE_ASSIST_HELP,
  ...assistHelpScenarios({ player, config, vsConfig, you, captain, phase, WIDE }),
  {
    name: 'lobby-other-game',
    msgs: [player('Nico'), { ...config(), game: 'obstaculos' }, phase('lobby')],
    after: `document.body.dataset.howto = 'closed'`,
  }, // a game with no use for the switch
  {
    name: 'lobby-longname',
    msgs: [player('WWWWWWWWWWWWWWWW', 1, '#2F7DE1'), { ...config(), map: 'random', seed: 4000000000, difficulty: 'hard' }, phase('lobby')],
    after: `document.body.dataset.howto = 'closed'`,
  },
  { name: 'play', msgs: [player('Nico'), config(), phase('lobby'), phase('playing')] },
  // the campaign round: the pad plus the 6 signal buttons (a quick match round, `play`, has none)
  { name: 'play-campaign', msgs: [player('Nico'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)] },
  {
    name: 'play-campaign-pressed',
    msgs: [player('Nico'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)],
    after: `document.querySelectorAll('.act, .sg').forEach((b) => b.classList.add('down'))`,
  },
  {
    name: 'play-campaign-longname',
    msgs: [player('WWWWWWWWWWWWWWWW', 1, '#8E5CD9'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)],
  },
  { name: 'play-campaign-wide-font', msgs: [player('Nico'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)], after: WIDE },
  {
    name: 'play-campaign-zoomed',
    msgs: [player('Nico'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)],
    after: `document.body.classList.add('zoomed')`,
  },
  {
    name: 'play-puesto',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['horno', 'reparto']) })],
  },
  { name: 'play-puesto-long', msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['prep']) })] },
  {
    name: 'play-puesto-double',
    msgs: [
      player('WWWWWWWWWWWWWWWW', 1, '#FFC21A'),
      config(),
      phase('lobby'),
      phase('playing', { puestos: puestos(1, ['reparto', 'lavado']) }),
    ],
  },
  { name: 'play-hint', msgs: [...PLAYING, hint({ a: 'Al horno', b: 'Estirar', aIcon: 'oven', bIcon: 'chop' })] },
  { name: 'play-hint-off', msgs: [...PLAYING, hint({ a: 'Tomar', b: 'Correr', aIcon: 'grab', bIcon: 'move', aOff: true, bOff: true })] },
  { name: 'play-hint-mixed', msgs: [...PLAYING, hint({ a: 'Entregar', b: 'Picar', aIcon: 'bell', bIcon: 'chop', bOff: true })] },
  { name: 'play-hint-long', msgs: [...PLAYING, hint({ a: 'Devolver plato', b: 'Poner en tabla', aIcon: 'plate', bIcon: 'chop' })] },
  {
    name: 'play-hint-long-off',
    msgs: [...PLAYING, hint({ a: 'Despensa vacía', b: 'Sin control', aIcon: 'crate', bIcon: 'chop', aOff: true, bOff: true })],
  },
  {
    name: 'play-hint-wide-font',
    msgs: [
      player('WWWWWWWWWWWWWWWW', 1, '#1FB5A8'),
      config(),
      phase('lobby'),
      phase('playing', { puestos: puestos(1, ['prep', 'lavado']) }),
      hint({ a: 'Devolver plato', b: 'Poner en tabla', aIcon: 'plate', bIcon: 'chop' }),
    ],
    after: WIDE,
  },
  {
    name: 'play-pressed',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['masa']) })],
    after: `document.querySelectorAll('.act').forEach((b) => b.classList.add('down'))`,
  },
  { name: 'play-hold-labels', msgs: [player('Nico'), config(LONG), phase('lobby'), phase('playing', { puestos: puestos(1, ['corte']) })] },
  {
    name: 'play-reconnecting',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['masa', 'horno']) })],
    after: `window.__closeSocket()`,
  },
  {
    name: 'play-error',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing'), { t: 'error', reason: 'Sala llena (8 jugadores)' }],
  },
  {
    name: 'play-zoomed',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['horno']) })],
    after: `document.body.classList.add('zoomed')`,
  },
  // iOS draws SF Rounded, wider than the fallback of headless Chrome: Verdana (~12% wider) stands in to check there is room to spare
  {
    name: 'play-wide-font',
    msgs: [
      player('WWWWWWWWWWWWWWWW', 1, '#1FB5A8'),
      config(LONG),
      phase('lobby'),
      phase('playing', { puestos: puestos(1, ['prep', 'lavado']) }),
    ],
    after: WIDE,
  },
  {
    name: 'play-wide-font-real',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['reparto', 'lavado']) })],
    after: WIDE,
  },
  { name: 'howto-wide-font', msgs: [player('Nico'), config(PIZZAS, HOWTO_LONG), phase('lobby')], after: WIDE },
  {
    name: 'lobby-wide-font',
    msgs: [player('WWWWWWWWWWWWWWWW'), { ...config(), map: 'random', seed: 4000000000, difficulty: 'hard' }, phase('lobby')],
    after: `${WIDE}; document.body.dataset.howto = 'closed'`,
  },
  {
    name: 'lobby-zoomed',
    msgs: [player('Nico'), config(), phase('lobby')],
    after: `document.body.dataset.howto = 'closed'; document.body.classList.add('zoomed')`,
  },
  {
    name: 'results',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 1240 }] })],
  },
  {
    name: 'results-big',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 1234567 }] })],
  },
  // versus: the phone knows its team and gets the verdict with the results (won / lost / a draw / no winner), each inside a frame in the team colour
  {
    name: 'vs-results-won',
    msgs: [
      player('Nico'),
      vsConfig(),
      you(0),
      phase('lobby'),
      phase('playing'),
      phase('results', { scores: [{ id: 1, score: 410 }], result: vsResult('win', 0) }),
    ],
  },
  {
    name: 'vs-results-lost',
    msgs: [
      player('Nico'),
      vsConfig(),
      you(1),
      phase('lobby'),
      phase('playing'),
      phase('results', { scores: [{ id: 1, score: 340 }], result: vsResult('win', 0) }),
    ],
  },
  {
    name: 'vs-results-draw',
    msgs: [
      player('Nico'),
      vsConfig(),
      you(0),
      phase('lobby'),
      phase('playing'),
      phase('results', { scores: [{ id: 1, score: 1234567 }], result: vsResult('draw', null) }),
    ],
  },
  {
    name: 'vs-results-none',
    msgs: [
      player('WWWWWWWWWWWWWWWW'),
      vsConfig(),
      you(1),
      phase('lobby'),
      phase('playing'),
      phase('results', { scores: [{ id: 1, score: 340 }], result: vsResult('nowinner', null) }),
    ],
    after: WIDE,
  },
  // the Captain's D-pad (id 1 holds the crown): every screen but the round, and the others do not get it
  { name: 'captain-menu', msgs: [player('Nico'), config(), phase('menu'), captain()] },
  { name: 'captain-menu-longname', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#8E5CD9'), config(), phase('menu'), captain()] },
  { name: 'captain-lobby', msgs: [player('Nico'), config(), phase('lobby'), captain()], after: `document.body.dataset.howto = 'closed'` },
  {
    name: 'captain-lobby-longname',
    msgs: [
      player('WWWWWWWWWWWWWWWW', 1, '#2F7DE1'),
      { ...config(), map: 'random', seed: 4000000000, difficulty: 'hard' },
      phase('lobby'),
      captain(),
    ],
    after: `document.body.dataset.howto = 'closed'`,
  },
  { name: 'captain-howto', msgs: [player('Nico'), config(), phase('lobby'), captain()] },
  { name: 'captain-howto-long', msgs: [player('Nico'), config(PIZZAS, HOWTO_LONG), phase('lobby'), captain()] },
  {
    name: 'captain-results',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 1240 }] }), captain()],
  },
  {
    name: 'captain-results-big',
    msgs: [
      player('Nico'),
      config(),
      phase('lobby'),
      phase('playing'),
      phase('results', { scores: [{ id: 1, score: 1234567 }] }),
      captain(),
    ],
  },
  {
    name: 'captain-lobby-zoomed',
    msgs: [player('Nico'), config(), phase('lobby'), captain()],
    after: `document.body.dataset.howto = 'closed'; document.body.classList.add('zoomed')`,
  },
  {
    name: 'captain-wide-font',
    msgs: [player('WWWWWWWWWWWWWWWW'), { ...config(), map: 'random', seed: 4000000000, difficulty: 'hard' }, phase('lobby'), captain()],
    after: `${WIDE}; document.body.dataset.howto = 'closed'`,
  },
  { name: 'captain-howto-wide-font', msgs: [player('Nico'), config(PIZZAS, HOWTO_LONG), phase('lobby'), captain()], after: WIDE },
  {
    name: 'captain-play',
    msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['horno', 'reparto']) }), captain()],
  }, // the round: the pad alone, no D-pad
  { name: 'not-captain-menu', msgs: [player('Nico'), config(), phase('menu'), captain(2)] },
  { name: 'not-captain-howto', msgs: [player('Nico'), config(), phase('lobby'), captain(2)] },
  // the Cocina escuela: the pad plus the school card (step, dots, instruction, "Ya sé" and, for the Captain, "Saltar a todos"); the lit button comes with the message
  { name: 'school-step', msgs: [...SCHOOL, school(0, 'Toma masa del cajón', 'a')] },
  {
    name: 'school-knife',
    msgs: [
      ...SCHOOL,
      school(1, 'Toma tomate y pícalo en la tabla', 'b'),
      hint({ a: 'Poner en tabla', b: 'Picar', aIcon: 'chop', bIcon: 'chop' }),
    ],
  },
  {
    name: 'school-captain',
    msgs: [
      ...SCHOOL,
      captain(),
      school(2, 'Lleva el tomate picado al horno', 'a'),
      hint({ a: 'Al horno', b: 'Correr', aIcon: 'oven', bIcon: 'move', bOff: true }),
    ],
  },
  { name: 'school-done-captain', msgs: [...SCHOOL, captain(), school(4, 'Aléjate y toca B para correr', 'b', true)] },
  {
    name: 'school-versus',
    msgs: [
      player('Nico'),
      vsConfig(),
      you(1),
      phase('lobby'),
      phase('school'),
      captain(),
      school(3, 'Entrega la pizza en la ventanilla', 'a'),
    ],
  },
  {
    name: 'school-wide-font',
    msgs: [
      player('WWWWWWWWWWWWWWWW'),
      config(),
      phase('lobby'),
      phase('school'),
      captain(),
      school(3, 'Entrega la pizza en la ventanilla', 'a'),
      hint({ a: 'Devolver plato', b: 'Poner en tabla', aIcon: 'plate', bIcon: 'chop' }),
    ],
    after: WIDE,
  },
  {
    name: 'school-zoomed',
    msgs: [...SCHOOL, captain(), school(1, 'Toma tomate y pícalo en la tabla', 'a')],
    after: `document.body.classList.add('zoomed')`,
  },
];
