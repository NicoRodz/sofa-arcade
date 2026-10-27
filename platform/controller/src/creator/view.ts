// The creator's DOM (built here, so apps/controller/index.html does not grow): layout in creator.css, behaviour in creator.ts.
import { CLOTHES_BY_GENDER, FIELD_SIZE, GENDER_LABELS, HAIR_COLORS, SKIN_TONES, STYLE_LABELS, type AppearanceField } from '@pichi/core';
import { STEPS, type Flow, type Step } from './flow';
import type { DrawAvatar } from './preview';
import { thumb } from './thumbs';

const TAB_LABEL: Record<Step, [short: string, full: string]> = {
  gender: ['Género', 'Género'],
  hair: ['Pelo', 'Pelo'],
  acc: ['Extras', 'Accesorios'],
  clothes: ['Ropa', 'Ropa'],
};
export interface Actions {
  pick(field: AppearanceField, value: number): void;
  step(s: Step): void;
  next(): void;
  random(): void;
  done(): void;
  play(): void;
  change(): void;
  edit(): void;
}
export interface View {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  render(f: Flow, dup: string | null): void;
}

type Attrs = Record<string, string>;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};
/** A button that fires on pointerup (a touchend inside the double-tap window would swallow a click; see main.ts). */
const press = (el: HTMLElement, fn: () => void) => {
  el.addEventListener('pointerup', (e) => {
    e.preventDefault();
    fn();
  });
  return el;
};
const copy = (src: HTMLCanvasElement): HTMLCanvasElement => {
  const c = h('canvas', { 'aria-hidden': 'true' });
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
};

export function createView(draw: DrawAvatar, act: Actions, slotColor: () => string): View {
  const canvas = h('canvas', { id: 'cr-canvas', 'data-ov': '', role: 'img', 'aria-label': 'Vista previa de tu personaje' });
  const dup = h('div', { id: 'cr-dup', 'data-ov': '', role: 'status' });
  const random = press(h('button', { id: 'cr-random', type: 'button', 'data-ov': '' }, 'Aleatorio'), act.random);
  const tabs = h('div', { id: 'cr-tabs', role: 'tablist' });
  const tabEls = STEPS.map((s) =>
    tabs.appendChild(
      press(
        h(
          'button',
          { class: 'cr-tab', type: 'button', role: 'tab', 'data-step': s, 'data-ov': '', 'aria-label': TAB_LABEL[s][1] },
          TAB_LABEL[s][0],
        ),
        () => act.step(s),
      ),
    ),
  );
  const opts = h('div', { id: 'cr-opts' });
  const next = press(h('button', { id: 'cr-next', type: 'button', 'data-ov': '' }, 'Siguiente'), act.next);
  const done = press(h('button', { id: 'cr-done', type: 'button', 'data-ov': '' }, 'Listo'), act.done);
  const bar = h('div', { id: 'cr-bar' }, next, done);
  const ask = h(
    'div',
    { id: 'cr-ask' },
    h('div', { id: 'cr-asktxt', 'data-ov': '' }, '¿Juegas con este?'),
    press(h('button', { id: 'cr-play', type: 'button', 'data-ov': '' }, 'Jugar así'), act.play),
    press(h('button', { id: 'cr-change', type: 'button', 'data-ov': '' }, 'Cambiar'), act.change),
  );
  const root = h('div', { id: 'creator', 'data-screen': 'closed' }, h('div', { id: 'cr-prev' }, canvas, dup), random, tabs, opts, bar, ask);

  const chip = (label: string, field: AppearanceField, value: number, extra: Attrs = {}, ...kids: (Node | string)[]) =>
    press(
      h(
        'button',
        {
          class: `cr-chip ${extra.class ?? ''}`.trim(),
          type: 'button',
          'data-field': field,
          'data-v': String(value),
          'data-ov': '',
          'aria-label': label,
          ...(extra.style ? { style: extra.style } : {}),
        },
        ...kids,
      ),
      () => act.pick(field, value),
    );
  const swatch = (label: string, field: AppearanceField, value: number, color: string) =>
    chip(label, field, value, { class: 'sw', style: `background:${color}` });
  const px = () => (document.documentElement.clientWidth < 400 || window.innerHeight < 420 ? 44 : 56);
  const pic = (field: AppearanceField, g: number, size: number) => (value: number) =>
    chip(`${field} ${value + 1}`, field, value, { class: 'pic' }, copy(thumb(draw, field, value, g, size, slotColor())));
  const row = (cls: string, ...kids: Node[]) => h('div', { class: `cr-row ${cls}` }, ...kids);
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);

  const build = (step: Step, g: number): Node[] => {
    if (step === 'gender')
      return [
        row('g', ...GENDER_LABELS.map((l, i) => chip(l, 'g', i, { class: 'gen' }, copy(thumb(draw, 'g', i, i, 72, slotColor())), l))),
      ];
    if (step === 'hair')
      return [
        row('hc', ...HAIR_COLORS.map((c, i) => swatch(`Color de pelo ${i + 1}`, 'hc', i, c))),
        row('hs', ...STYLE_LABELS.map((l, i) => chip(`Peinado ${l}`, 's', i, { class: 'txt' }, l))),
        row('sk', ...SKIN_TONES.map((c, i) => swatch(`Piel ${i + 1}`, 'sk', i, c))),
      ];
    if (step === 'acc') return (['hat', 'gl', 'bk'] as const).map((f) => row(f, ...range(FIELD_SIZE[f]).map(pic(f, g, px()))));
    const mk = (cl: number) => chip(`Ropa ${cl}`, 'cl', cl, { class: 'pic big' }, copy(thumb(draw, 'cl', cl, g, 64, slotColor())));
    return [row('cl', ...CLOTHES_BY_GENDER[g]!.map(mk))];
  };
  let built = '';
  return {
    root,
    canvas,
    render(f, dupName) {
      root.dataset.screen = f.screen;
      root.dataset.step = f.step;
      dup.textContent = dupName && f.screen !== 'closed' ? `Igual que ${dupName}, ¿cambias algo?` : '';
      dup.hidden = !dup.textContent;
      tabEls.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.step === f.step)));
      if (f.screen === 'closed') return;
      const key = `${f.step}.${f.ap.g}`;
      if (key !== built) {
        built = key;
        opts.replaceChildren(...build(f.step, f.ap.g));
      }
      for (const c of Array.from(opts.querySelectorAll<HTMLElement>('.cr-chip')))
        c.setAttribute('aria-pressed', String(f.ap[c.dataset.field as AppearanceField] === Number(c.dataset.v)));
    },
  };
}
