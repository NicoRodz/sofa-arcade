// Lobby chips: one persistent element per slot so the idle animation never restarts. Games with teams move the same elements into
// their team columns (and back home for coop / the menu). Moved out of apps/screen/src/main.ts (F4b) unchanged.
import { chefOf } from '../art/tokens';
import { assistBadgeCanvas, chefCanvas } from '../art/chef';
import { $ } from '../ui/dom';
import { app, services } from '../shell/app-state';
import { avatarCanvas, avatarKey, replay } from './chip-avatar';

export interface Chip {
  el: HTMLDivElement;
  av: Element;
  nm: Element;
  sub: Element;
  num: Element;
  who: number;
  look: string; // avatarKey of what the .av shows ('' none / the old chef)
  making: boolean;
}
export const chips: Chip[] = [];
let inTeams = false;

export function initChips() {
  Array.from({ length: 8 }, (_v, i) => {
    const el = document.createElement('div');
    el.className = 'chip empty';
    el.style.setProperty('--c', chefOf(i).color);
    el.innerHTML =
      '<div class="av"></div><div><div class="nm"></div><div class="sub"></div></div><div class="num"></div><div class="mv" title="Pasar al otro equipo">⇄</div>';
    $('chips').appendChild(el);
    chips.push({
      el,
      av: el.querySelector('.av')!,
      nm: el.querySelector('.nm')!,
      sub: el.querySelector('.sub')!,
      num: el.querySelector('.num')!,
      who: -1,
      look: '',
      making: false,
    });
  });
  chips.forEach((c, i) => {
    c.num.textContent = String(i + 1);
    c.nm.textContent = 'Esperando…';
  });
}

export function renderChips() {
  const bySlot = new Map([...app.players.values()].map((p) => [p.info.slot % 8, p.info]));
  chips.forEach((c, i) => {
    const info = bySlot.get(i);
    c.el.classList.toggle('empty', !info);
    c.el.classList.toggle('gone', !!info && !info.connected);
    if (!info) {
      c.who = -1;
      c.look = '';
      c.making = false;
      c.el.classList.remove('making');
      c.av.replaceChildren();
      c.nm.textContent = 'Esperando…';
      c.sub.textContent = '';
      return;
    }
    const slotColor = chefOf(i).color,
      look = info.ap ? avatarKey(info.ap, slotColor) : '',
      making = !!info.customizing;
    const joined = c.who !== info.id;
    if (joined || look !== c.look) {
      // a look that changes under a seated player (live creator updates) puffs; a new player pops the whole chip
      c.av.replaceChildren(info.ap ? avatarCanvas(info.ap, slotColor) : chefCanvas(i, 'idle', true));
      if (!joined) replay(c.av, 'puff');
      c.look = look;
    }
    if (joined) {
      c.who = info.id;
      c.making = making;
      replay(c.el, 'pop');
    } else if (c.making && !making) {
      replay(c.av, 'hop'); // "Listo": a little jump and a short tone (the screen's own audio)
      services.ui('plink');
    }
    c.making = making;
    const helper = !!info.assist,
      badge = c.av.querySelector('.hbadge');
    if (helper && !badge) {
      const b = assistBadgeCanvas();
      b.className = 'hbadge';
      c.av.appendChild(b);
    } else if (!helper && badge) badge.remove();
    c.el.classList.toggle('helper', helper);
    c.nm.textContent = (info.id === app.captainId ? '👑 ' : '') + info.name;
    c.el.classList.toggle('making', making && info.connected);
    if (!info.connected) c.sub.textContent = 'Desconectado';
    else if (making) c.sub.innerHTML = '<span class="pen">✏️</span>armando su personaje…';
    else c.sub.textContent = `${chefOf(i).name} · ${helper ? 'Ayudante' : 'listo'}`;
  });
}

/** The team columns took the chip elements: showTeams(false) will bring them home. */
export const chipsMovedToTeams = () => {
  inTeams = true;
};
export function showTeams(on: boolean) {
  $('chips').classList.toggle('off', on);
  $('teams').classList.toggle('off', !on);
  $('teambar').classList.toggle('off', !on);
  if (!on && inTeams) {
    inTeams = false;
    $('chips').replaceChildren(...chips.map((c) => c.el));
  }
}
