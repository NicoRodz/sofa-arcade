// The character creator as a pure state machine (plan creador-personajes §4): name -> (confirm | creator) -> done, plus edit from the lobby.
// No DOM, no socket, no clock: `reduce` takes a state and an event and returns the next state with the effects the shell must run.
import { CLOTHES_BY_GENDER, FIELD_SIZE, clothesDefault, styleDefault, type Appearance, type AppearanceField } from '@pichi/core';

export const STEPS = ['gender', 'hair', 'acc', 'clothes'] as const;
export type Step = (typeof STEPS)[number];
export type Screen = 'closed' | 'confirm' | 'creator';

export interface Flow {
  screen: Screen;
  ap: Appearance; // what the phone shows and sends
  step: Step;
  genderChosen: boolean; // Aleatorio keeps `g` once the player picked it (or loaded a saved look)
  saved: Appearance | null; // what localStorage holds
}
export type Event =
  | { t: 'begin'; saved: Appearance | null; random: Appearance } // the name was entered: the join goes out with `ap`
  | { t: 'play' } // "Jugar así"
  | { t: 'change' } // "Cambiar"
  | { t: 'pick'; field: AppearanceField; value: number }
  | { t: 'step'; step: Step }
  | { t: 'next' }
  | { t: 'random'; ap: Appearance } // the shell draws it (it knows the roster); the machine applies it
  | { t: 'done' } // "Listo"
  | { t: 'edit' } // "Editar personaje" in the lobby
  | { t: 'forceClose' }; // the relay left the phases that accept a look (the host started a match)
export type Fx = { k: 'send'; done: boolean } | { k: 'save' } | { k: 'cue'; cue: 'soft' | 'done' };
export interface Result {
  flow: Flow;
  fx: Fx[];
}

export const initialFlow = (ap: Appearance): Flow => ({ screen: 'closed', ap, step: 'gender', genderChosen: false, saved: null });

/** The look with one field set; a new gender also moves hairstyle and clothes to that gender's defaults when the old clothes are not on its list. */
export function withField(ap: Appearance, field: AppearanceField, value: number): Appearance {
  if (!Number.isInteger(value) || value < 0 || value >= FIELD_SIZE[field]) return ap; // out of range: ignored, never sent
  if (field !== 'g') return { ...ap, [field]: value };
  const onList = CLOTHES_BY_GENDER[value]?.includes(ap.cl);
  return { ...ap, g: value, s: styleDefault(value), cl: onList ? ap.cl : clothesDefault(value) };
}

const same = (r: Result): Result => r;
const sent = (flow: Flow, ...more: Fx[]): Result => ({ flow, fx: [{ k: 'send', done: false }, ...more] });

export function reduce(f: Flow, e: Event): Result {
  switch (e.t) {
    case 'begin':
      return {
        flow: {
          ...f,
          ap: e.saved ?? e.random,
          genderChosen: !!e.saved,
          saved: e.saved,
          screen: e.saved ? 'confirm' : 'creator',
          step: 'gender',
        },
        fx: [{ k: 'cue', cue: 'soft' }],
      };
    case 'play':
      if (f.screen !== 'confirm') return same({ flow: f, fx: [] });
      return { flow: { ...f, screen: 'closed' }, fx: [{ k: 'save' }, { k: 'send', done: true }, { k: 'cue', cue: 'done' }] };
    case 'change':
      return f.screen === 'confirm' ? { flow: { ...f, screen: 'creator' }, fx: [] } : same({ flow: f, fx: [] });
    case 'pick': {
      if (f.screen !== 'creator') return same({ flow: f, fx: [] });
      const ap = withField(f.ap, e.field, e.value);
      if (ap === f.ap) return same({ flow: f, fx: [] });
      const advance = e.field === 'g' ? 'hair' : e.field === 'hc' ? 'acc' : null; // gender and hair colour move on by themselves; accessories wait for "Siguiente"
      return sent({ ...f, ap, genderChosen: f.genderChosen || e.field === 'g', step: advance ?? f.step });
    }
    case 'step':
      return f.screen === 'creator' ? { flow: { ...f, step: e.step }, fx: [] } : same({ flow: f, fx: [] });
    case 'next': {
      const i = STEPS.indexOf(f.step);
      return f.screen === 'creator' && i < STEPS.length - 1 ? { flow: { ...f, step: STEPS[i + 1]! }, fx: [] } : same({ flow: f, fx: [] });
    }
    case 'random':
      return f.screen === 'creator' ? sent({ ...f, ap: e.ap }) : same({ flow: f, fx: [] });
    case 'done':
      if (f.screen !== 'creator') return same({ flow: f, fx: [] });
      return { flow: { ...f, screen: 'closed', saved: f.ap }, fx: [{ k: 'save' }, { k: 'send', done: true }, { k: 'cue', cue: 'done' }] };
    case 'edit':
      if (f.screen !== 'closed') return same({ flow: f, fx: [] });
      return {
        flow: { ...f, screen: 'creator', step: 'gender', genderChosen: true },
        fx: [
          { k: 'send', done: false },
          { k: 'cue', cue: 'soft' },
        ],
      };
    case 'forceClose':
      if (f.screen === 'closed') return same({ flow: f, fx: [] });
      return { flow: { ...f, screen: 'closed', saved: f.ap }, fx: [{ k: 'save' }] }; // the relay forces `done` with the look as it stands: keep it here too
  }
}
