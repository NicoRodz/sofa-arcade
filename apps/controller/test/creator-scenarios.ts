// Character creator (platform/controller/src/creator): what the layout harness measures for it and the states it is measured in.
// The scenarios drive the real page: the name form is submitted, so the creator opens exactly as it does for a player (join with `ap` and customizing).
import type { Builders, Scenario } from './scenario-types';

export const CREATOR_TOUCH = ['#creator button', '#cr-edit'];
export const CR_STACK = ['#creator [data-ov]']; // leaf cells of the creator: none may sit on another
export const CREATOR_PROBE = [...CREATOR_TOUCH, ...CR_STACK];

const tap = (sel: string) =>
  `document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))`;
const submit = (name: string) =>
  `(() => { document.getElementById('name').value = ${JSON.stringify(name)}; document.getElementById('join').requestSubmit(); })()`;
const SAVED = `localStorage.setItem('pichiclub.ap.v1', JSON.stringify({ v: 1, g: 1, s: 0, hc: 2, sk: 1, hat: 3, gl: 1, bk: 2, cl: 4 }))`;
// the roster says somebody else wears exactly the look this phone sent in its join
const TWIN = (name: string) =>
  `(() => { const j = window.__sent.find((m) => m.t === 'join'); window.__push({ t: 'state', players: [{ id: 2, name: ${JSON.stringify(name)}, color: '#2F7DE1', slot: 1, connected: true, teamId: null, ap: j.ap }] }); })()`;

export function creatorScenarios(b: Builders): Scenario[] {
  const W = 'WWWWWWWWWWWWWWWW';
  // name submitted -> the relay answers (joined, config, lobby) -> then the script gets its turn
  const flow = (name: string, then: string, pre = ''): string =>
    `${pre}; ${submit(name)}; setTimeout(() => { ${[b.player(name), b.config(), b.phase('lobby')].map((m) => `window.__push(${JSON.stringify(m)})`).join('; ')}; ${then} }, 40)`;
  const lobby = (name: string) => [b.player(name), b.config(), b.phase('lobby')] as object[];
  const step = (s: string) => tap(`.cr-tab[data-step=${s}]`);
  return [
    { name: 'creator-gender', fresh: true, msgs: [], after: flow('Nico', '') },
    { name: 'creator-hair', fresh: true, msgs: [], after: flow('Nico', step('hair')) },
    { name: 'creator-acc', fresh: true, msgs: [], after: flow('Nico', step('acc')) },
    { name: 'creator-clothes', fresh: true, msgs: [], after: flow('Nico', step('clothes')) },
    { name: 'creator-dup', fresh: true, msgs: [], after: flow('Nico', `${step('clothes')}; ${TWIN('Ana')}`) },
    { name: 'creator-confirm', fresh: true, msgs: [], after: flow('Nico', '', SAVED) },
    { name: 'creator-confirm-dup', fresh: true, msgs: [], after: flow(W, TWIN(W), SAVED) },
    { name: 'creator-acc-wide-font', fresh: true, msgs: [], after: `${b.WIDE}; ${flow(W, `${step('acc')}; ${TWIN(W)}`)}` },
    { name: 'creator-hair-wide-font', fresh: true, msgs: [], after: `${b.WIDE}; ${flow(W, step('hair'))}` },
    {
      name: 'creator-edit',
      msgs: lobby('Nico'),
      after: `document.body.dataset.howto = 'closed'; ${tap('#cr-edit')}`,
    },
    {
      name: 'creator-edit-clothes-wide-font',
      msgs: lobby(W),
      after: `${b.WIDE}; document.body.dataset.howto = 'closed'; ${tap('#cr-edit')}; ${step('clothes')}`,
    },
  ];
}
