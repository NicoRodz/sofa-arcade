// The creator on the phone (plan creador-personajes §4): glues the pure flow (flow.ts) to the socket, localStorage, the preview and the DOM (view.ts).
// main.ts only forwards: begin() on the name form, joinExtra() into the join, onMessage() for every relay message.
import { APPEARANCE_PHASES, sanitizeAppearance, type Appearance, type ClientMsg, type ServerMsg } from '@pichi/core';
import { mulberry32, type Rng } from '@pichi/core/rng';
import { fireCue, type Cue } from '../attention';
import './creator.css';
import { initialFlow, reduce, type Event, type Flow, type Fx } from './flow';
import type { DrawAvatar } from './preview';
import { drawAvatar } from './preview-stub'; // F2 integration: import { drawAvatar } from '@pichi/core' (core/avatar/draw.ts) instead; the signature is the same
import { duplicateOf, randomAvoiding, type RosterEntry } from './similar';
import { LIVE_MS, createThrottle, type Clock } from './throttle';
import { createUi, type Ui } from './ui';
import type { Actions } from './view';

export const AP_KEY = 'pichiclub.ap.v1';
export interface Kv {
  get(k: string): string | null;
  set(k: string, v: string): void;
}
export interface CreatorDeps {
  send: (m: ClientMsg) => void;
  draw?: DrawAvatar;
  store?: Kv;
  cue?: (c: Cue) => void;
  rng?: Rng;
  clock?: Clock;
  ui?: (act: Actions, getAp: () => Appearance, color: () => string) => Ui; // tests pass a fake; the page gets the DOM one
}
export interface Creator {
  begin(): void; // the name was entered
  joinExtra(): { ap?: Record<string, unknown> };
  onMessage(m: ServerMsg): void;
  readonly flow: Flow;
}

const safeStore = (): Kv => ({
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: the look just is not remembered */
    }
  },
});
export function loadSaved(store: Kv): Appearance | null {
  try {
    const raw = JSON.parse(store.get(AP_KEY) ?? 'null');
    return raw && typeof raw === 'object' && raw.v === 1 ? sanitizeAppearance(raw, 0) : null;
  } catch {
    return null;
  }
}

export function createCreator(deps: CreatorDeps): Creator {
  const store = deps.store ?? safeStore();
  const draw = deps.draw ?? drawAvatar;
  const cue = deps.cue ?? fireCue;
  const rng = deps.rng ?? mulberry32((Math.random() * 2 ** 32) >>> 0);
  const roster = new Map<number, RosterEntry>();
  const live = createThrottle<{ ap: Appearance; done: boolean }>(
    (m) => deps.send({ t: 'appearance', ap: { ...m.ap }, done: m.done }),
    LIVE_MS,
    deps.clock,
  );
  let flow = initialFlow(sanitizeAppearance(null, 0));
  let myId: number | null = null;
  let color = '#E63B2E';
  let phase = '';
  let joinAp: Appearance | null = null; // the saved look a join carried while the creator was closed
  let lastDup: string | null = null;

  const dupNow = () => (flow.screen === 'closed' ? null : duplicateOf(flow.ap, roster.values(), myId));
  const refresh = () => {
    const open = flow.screen !== 'closed';
    const dup = dupNow();
    ui.render(flow, dup);
    ui.show(open, open, !open && phase === 'lobby' && myId !== null);
    if (dup && dup !== lastDup) cue('soft'); // a notice appearing on the phone is looked at
    lastDup = dup;
  };
  const run = (fx: Fx[]) => {
    for (const f of fx) {
      if (f.k === 'save') store.set(AP_KEY, JSON.stringify(flow.ap));
      else if (f.k === 'cue') cue(f.cue);
      else if (f.done) live.now({ ap: flow.ap, done: true });
      else live.push({ ap: flow.ap, done: false });
    }
  };
  const dispatch = (e: Event) => {
    const r = reduce(flow, e);
    flow = r.flow;
    run(r.fx);
    refresh();
  };
  const others = () => [...roster.values()].filter((p) => p.id !== myId && p.ap).map((p) => p.ap!);
  const act: Actions = {
    pick: (field, value) => dispatch({ t: 'pick', field, value }),
    step: (step) => dispatch({ t: 'step', step }),
    next: () => dispatch({ t: 'next' }),
    random: () => dispatch({ t: 'random', ap: randomAvoiding(rng, others(), flow.genderChosen ? flow.ap.g : null) }),
    done: () => dispatch({ t: 'done' }),
    play: () => dispatch({ t: 'play' }),
    change: () => dispatch({ t: 'change' }),
    edit: () => phase === 'lobby' && dispatch({ t: 'edit' }),
  };
  const ui = (deps.ui ?? ((a, g, c) => createUi(draw, a, g, c)))(
    act,
    () => flow.ap,
    () => color,
  );

  return {
    begin() {
      dispatch({ t: 'begin', saved: loadSaved(store), random: randomAvoiding(rng, [], null) });
    },
    joinExtra() {
      joinAp = flow.screen === 'closed' ? loadSaved(store) : null;
      const ap = flow.screen !== 'closed' ? flow.ap : joinAp; // creating: keep `customizing` across a reconnect; closed: remind the relay of the saved look
      return ap ? { ap: { ...ap } } : {};
    },
    onMessage(m) {
      if (m.t === 'joined') {
        myId = m.player.id;
        color = m.player.color;
        if (joinAp && flow.screen === 'closed') live.now({ ap: joinAp, done: true }); // a join with `ap` marks the phone as customizing: say it is done
        joinAp = null;
      } else if (m.t === 'state') {
        roster.clear();
        for (const p of m.players) roster.set(p.id, p);
      } else if (m.t === 'player_joined') roster.set(m.player.id, m.player);
      else if (m.t === 'player_removed') roster.delete(m.playerId);
      else if (m.t === 'appearance') {
        const p = roster.get(m.playerId);
        if (p) p.ap = m.ap;
      } else if (m.t === 'phase') {
        phase = m.phase;
        if (!APPEARANCE_PHASES.includes(m.phase)) {
          live.cancel();
          dispatch({ t: 'forceClose' });
          return;
        }
      }
      refresh();
    },
    get flow() {
      return flow;
    },
  };
}
