// Modo Ayudante, explained: what the layout harness measures for it (selectors) and the states it is measured in (notice, "¿Qué es?" card).
import type { Scenario } from './harness';

export const ASSIST_TOUCH = ['#assist', '#assisthelpopen', '#assisthelpclose'];
export const ASSIST_SAFE = [...ASSIST_TOUCH, '#assisthelp li', '#assisttoast'];
export const ASSIST_PROBE = [
  '#assist',
  '#assist svg',
  '#assistlbl',
  '#assistsub',
  '#assistnote',
  '#assistrow',
  '#assisthelpopen',
  '#assisthelp h2',
  '#assisthelp li',
  '#assisthelpclose',
  '#assisttoast',
];

type Msg = unknown;
export interface Builders {
  player: (name: string) => Msg;
  config: () => Msg;
  vsConfig: () => Msg;
  you: (team: number) => Msg;
  captain: () => Msg;
  phase: (p: string) => Msg;
  WIDE: string;
}
const TOAST = `document.getElementById('assisttoast').textContent = 'Ayudante activado: llevarás un gorro con hélice'; document.body.dataset.assisttoast = 'on'`;
const CARD = `document.body.dataset.assisthelp = 'open'`;
const CLOSED = `document.body.dataset.howto = 'closed'`;

export function assistHelpScenarios(b: Builders): Scenario[] {
  const on = { t: 'assist', playerId: 1, on: true };
  const W = 'WWWWWWWWWWWWWWWW';
  const cap = [b.player('Nico'), b.vsConfig(), b.you(1), b.phase('lobby'), b.captain()];
  return [
    { name: 'lobby-assist-toast', msgs: [b.player('Nico'), b.config(), b.phase('lobby'), on], after: `${CLOSED}; ${TOAST}` },
    {
      name: 'captain-lobby-assist-toast',
      msgs: [b.player(W), b.vsConfig(), b.you(1), b.phase('lobby'), b.captain(), on],
      after: `${CLOSED}; ${TOAST}`,
    },
    { name: 'assist-help', msgs: [b.player('Nico'), b.config(), b.phase('lobby')], after: `${CLOSED}; ${CARD}` },
    { name: 'captain-assist-help', msgs: cap, after: `${CLOSED}; ${CARD}` },
    { name: 'assist-help-wide-font', msgs: [b.player(W), ...cap.slice(1)], after: `${b.WIDE}; ${CLOSED}; ${CARD}` },
  ] as Scenario[];
}
