// The TV overlay of the Cocina escuela: a strip over the (hidden) clock and score of the round with the title, the four steps and ONE chip per chef (avatar, name, four pips,
// a check when it is done), plus a big "todos listos" when the table finished. DOM, scaled like the rest of the stage (1920x1080). No logic: it draws the model it is given.
import { ICONS } from '@party/shared/icons';
import { SCHOOL_STEPS, SCHOOL_TITLE, SCHOOL_TOTAL } from '@party/shared/tutorial';
import { chefCanvas } from '../art/chef';
import { chefOf } from '../art/tokens';

export interface ChipModel { slot: number; name: string; step: number; done: boolean; skipped: boolean }
export interface ViewModel { sub: string; chips: readonly ChipModel[]; allDone: boolean; hint: string }
export interface SchoolView { show(): void; hide(): void; render(m: ViewModel): void; readonly shown: boolean }

const CSS = `
#schoolui { z-index: 30; pointer-events: none; }
#schoolui .sc-bar { position: absolute; left: 0; top: 0; width: 1920px; height: 104px; background: linear-gradient(rgba(43,27,23,.95), rgba(43,27,23,.86)); border-bottom: 4px solid var(--ink); }
#schoolui .sc-title { position: absolute; left: 28px; top: 4px; font: 800 44px/1.1 var(--font); color: var(--cheese); text-shadow: 0 3px 0 var(--ink); white-space: nowrap; }
#schoolui .sc-sub { position: absolute; left: 30px; top: 60px; width: 500px; font: 700 20px/1.15 var(--font); color: rgba(255,244,224,.85); }
#schoolui .sc-steps { position: absolute; left: 560px; top: 8px; display: flex; gap: 12px; }
#schoolui .sc-step { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 16px 0 5px; border: 3px solid var(--ink); border-radius: 21px; background: var(--cream); color: var(--ink); font: 800 22px var(--font); }
#schoolui .sc-step i { width: 30px; height: 30px; border-radius: 50%; background: #F6E8CB; border: 2px solid var(--ink); display: flex; align-items: center; justify-content: center; font-style: normal; }
#schoolui .sc-step svg { width: 20px; height: 20px; fill: none; stroke: var(--tomato2); stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round; }
#schoolui .sc-step b { color: var(--tomato2); }
#schoolui .sc-skip { position: absolute; right: 28px; top: 12px; font: 700 22px var(--font); color: var(--cream); white-space: nowrap; }
#schoolui .sc-skip kbd { display: inline-block; min-width: 38px; padding: 0 9px; margin-right: 6px; border: 3px solid var(--ink); border-radius: 9px; background: var(--cream); color: var(--ink); font: 800 20px/28px var(--font); text-align: center; }
#schoolui .sc-chips { position: absolute; left: 556px; right: 28px; top: 54px; height: 46px; display: flex; gap: 8px; }
#schoolui .sc-chip { flex: 1 1 0; min-width: 0; max-width: 220px; display: none; align-items: center; gap: 6px; height: 46px; padding: 0 9px 0 4px; border: 3px solid var(--c); border-radius: 23px; background: rgba(255,244,224,.14); color: var(--cream); font: 800 20px var(--font); }
#schoolui .sc-chip.on { display: flex; }
#schoolui .sc-chip .av { width: 30px; height: 40px; flex: none; position: relative; }
#schoolui .sc-chip .av canvas { position: absolute; left: -2px; bottom: -3px; width: 32px; height: 45px; }
#schoolui .sc-chip .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#schoolui .sc-chip .pips { display: flex; gap: 4px; flex: none; }
#schoolui .sc-chip .pip { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--cream); box-sizing: border-box; opacity: .75; }
#schoolui .sc-chip .pip.d { background: var(--c); border-color: var(--cream); opacity: 1; }
#schoolui .sc-chip .pip.now { background: var(--cream); animation: scpulse .9s ease-in-out infinite alternate; }
#schoolui .sc-chip .ck { display: none; flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--basil); border: 2px solid var(--cream); color: #fff; font: 800 20px/24px var(--font); text-align: center; }
#schoolui .sc-chip.done { background: rgba(63,163,77,.42); border-color: var(--basil); }
#schoolui .sc-chip.done .pips { display: none; }
#schoolui .sc-chip.done .ck { display: block; }
#schoolui .sc-banner { position: absolute; left: 0; right: 0; top: 470px; text-align: center; font: 800 150px/1 var(--font); color: var(--cheese); -webkit-text-stroke: 18px var(--ink); paint-order: stroke fill; text-shadow: 0 10px 0 rgba(43,27,23,.35); display: none; }
#schoolui .sc-banner small { display: block; margin-top: 18px; font: 800 40px var(--font); color: var(--cream); -webkit-text-stroke: 8px var(--ink); }
#schoolui.all .sc-banner { display: block; animation: scpop .45s cubic-bezier(.2,1.6,.4,1); }
@keyframes scpulse { from { transform: scale(.8); } to { transform: scale(1.25); } }
@keyframes scpop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
`;

const icon = (id: keyof typeof ICONS) => `<svg viewBox="0 0 48 48">${ICONS[id]}</svg>`;

export function createSchoolView(doc: Document = document): SchoolView {
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const root = doc.createElement('div');
  root.id = 'schoolui';
  root.className = 'stage off';
  root.innerHTML = `<div class="sc-bar"><div class="sc-title">${SCHOOL_TITLE}</div><div class="sc-sub"></div>`
    + `<div class="sc-steps">${SCHOOL_STEPS.map((s, i) => `<span class="sc-step"><i>${icon(s.icon)}</i><b>${i + 1}</b>${s.short}</span>`).join('')}</div>`
    + `<div class="sc-skip"></div><div class="sc-chips"></div></div><div class="sc-banner">¡Todos listos!<small>Enter para seguir</small></div>`;
  doc.body.appendChild(root);
  const sub = root.querySelector<HTMLElement>('.sc-sub')!, skip = root.querySelector<HTMLElement>('.sc-skip')!, host = root.querySelector<HTMLElement>('.sc-chips')!;
  // one persistent chip per slot (the avatar is drawn once, like the lobby's chips)
  const chips = Array.from({ length: 8 }, (_v, i) => {
    const el = doc.createElement('div');
    el.className = 'sc-chip';
    el.style.setProperty('--c', chefOf(i).color);
    el.innerHTML = `<div class="av"></div><span class="nm"></span><span class="pips">${'<i class="pip"></i>'.repeat(SCHOOL_TOTAL)}</span><span class="ck">✓</span>`;
    el.querySelector('.av')!.appendChild(chefCanvas(i, 'idle', true));
    host.appendChild(el);
    return { el, nm: el.querySelector<HTMLElement>('.nm')!, pips: Array.from(el.querySelectorAll<HTMLElement>('.pip')) };
  });
  let shown = false, key = '';
  return {
    get shown() { return shown; },
    show() { shown = true; root.classList.remove('off'); },
    hide() { shown = false; key = ''; root.classList.add('off'); root.classList.remove('all'); },
    render(m) {
      const k = JSON.stringify(m);
      if (k === key) return;
      key = k;
      sub.textContent = m.sub;
      skip.innerHTML = m.hint;
      root.classList.toggle('all', m.allDone);
      const bySlot = new Map(m.chips.map((c) => [c.slot % 8, c]));
      chips.forEach((c, i) => {
        const d = bySlot.get(i);
        c.el.classList.toggle('on', !!d);
        if (!d) return;
        c.nm.textContent = d.name;
        c.el.classList.toggle('done', d.done);
        c.pips.forEach((p, j) => { p.classList.toggle('d', j < d.step); p.classList.toggle('now', j === d.step && !d.done); });
      });
    },
  };
}
