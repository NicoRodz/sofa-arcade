// First part of the phone scenarios (join, menu, lobby, school), up to the Ayudante help block (moved out of harness.ts).
import type { Scenario } from '../scenario-types';
import { HOWTO_LONG, PIZZAS, WIDE, captain, config, phase, player, vsConfig, you } from './scenario-msgs';

export const SCENARIOS_BEFORE_ASSIST_HELP: Scenario[] = [
  { name: 'join', fresh: true, msgs: [] },
  {
    name: 'join-longname',
    fresh: true,
    msgs: [],
    after: `(() => { const i = document.getElementById('name'); i.value = 'WWWWWWWWWWWWWWWW'; })()`,
  },
  { name: 'menu', msgs: [player('Nico'), config(), phase('menu')] },
  { name: 'menu-longname', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#8E5CD9'), config(), phase('menu')] },
  { name: 'howto', msgs: [player('Nico'), config(), phase('lobby')] }, // joining opens the "Cómo se juega" card
  { name: 'howto-long', msgs: [player('Nico'), config(PIZZAS, HOWTO_LONG), phase('lobby')] },
  { name: 'lobby', msgs: [player('Nico'), config(), phase('lobby')], after: `document.body.dataset.howto = 'closed'` },
  // Ayudante: the switch next to "Cómo se juega", off and on; in versus (the busiest lobby: team card + swap + the switch) and with the Captain's D-pad
  {
    name: 'lobby-assist',
    msgs: [player('Nico'), config(), phase('lobby'), { t: 'assist', playerId: 1, on: true }],
    after: `document.body.dataset.howto = 'closed'`,
  },
  {
    name: 'lobby-assist-versus',
    msgs: [player('WWWWWWWWWWWWWWWW'), vsConfig(), you(0), phase('lobby'), { t: 'assist', playerId: 1, on: true }],
    after: `document.body.dataset.howto = 'closed'`,
  },
  {
    name: 'captain-lobby-assist',
    msgs: [player('Nico'), vsConfig(), you(1), phase('lobby'), captain(), { t: 'assist', playerId: 1, on: true }],
    after: `document.body.dataset.howto = 'closed'`,
  },
  {
    name: 'lobby-assist-wide-font',
    msgs: [
      player('WWWWWWWWWWWWWWWW'),
      { ...vsConfig(), map: 'V1' },
      you(1),
      phase('lobby'),
      captain(),
      { t: 'assist', playerId: 1, on: true },
    ],
    after: `${WIDE}; document.body.dataset.howto = 'closed'`,
  },
];
