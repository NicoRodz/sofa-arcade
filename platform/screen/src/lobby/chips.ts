// Lobby chips: one persistent element per slot so the idle animation never restarts. Games with teams move the same elements into
// their team columns (and back home for coop / the menu). Moved out of apps/screen/src/main.ts (F4b) unchanged.
import { chefOf } from '../art/tokens';
import { assistBadgeCanvas, chefCanvas } from '../art/chef';
import { $ } from '../ui/dom';
import { app, services } from '../shell/app-state';
import { avatarCanvas, avatarKey, replay } from './chip-avatar';
import { chipView } from '../screens/lobby/model';
import { renderChip } from '../screens/lobby/view';

export interface Chip {
  el: HTMLDivElement; // the shell: games move it into their team columns; its content is rendered by lit (screens/lobby/view.ts) and nothing else writes there
  who: number;
  look: string; // avatarKey of what the .av shows ('' none / the old chef)
  making: boolean;
  avatar: Node | null; // bound into .av: the same node between renders, so the idle animation never restarts
  badge: Node | null; // the Ayudante sticker, beside the avatar
}
export const chips: Chip[] = [];
let inTeams = false;

const part = (c: Chip, sel: string) => c.el.querySelector(sel)!;

export function initChips() {
  Array.from({ length: 8 }, (_v, i) => {
    const el = document.createElement('div');
    el.className = 'chip empty';
    el.style.setProperty('--c', chefOf(i).color);
    $('chips').appendChild(el);
    const c: Chip = { el, who: -1, look: '', making: false, avatar: null, badge: null };
    chips.push(c);
    renderChip(el, chipView(i, undefined, null), null, null);
  });
}

export function renderChips() {
  const bySlot = new Map([...app.players.values()].map((p) => [p.info.slot % 8, p.info]));
  chips.forEach((c, i) => {
    const info = bySlot.get(i);
    const view = chipView(i, info, app.captainId);
    if (!info) {
      c.who = -1;
      c.look = '';
      c.making = false;
      c.avatar = null;
      c.badge = null;
      renderChip(c.el, view, null, null);
      return;
    }
    const slotColor = chefOf(i).color,
      look = info.ap ? avatarKey(info.ap, slotColor) : '',
      making = !!info.customizing;
    const joined = c.who !== info.id;
    const looked = joined || look !== c.look;
    if (looked) {
      // a look that changes under a seated player (live creator updates) puffs; a new player pops the whole chip
      c.avatar = info.ap ? avatarCanvas(info.ap, slotColor) : chefCanvas(i, 'idle', true); // no look of its own: the menu shows a neutral face instead of Pizzas' chef
      c.look = look;
    }
    const helper = view.classes.helper;
    if (helper && !c.badge) {
      const b = assistBadgeCanvas();
      b.className = 'hbadge';
      c.badge = b;
    } else if (!helper) c.badge = null;
    const hop = !joined && c.making && !making;
    renderChip(c.el, view, c.avatar, c.badge);
    if (looked && !joined) replay(part(c, '.av'), 'puff');
    if (joined) {
      c.who = info.id;
      replay(c.el, 'pop');
    } else if (hop) {
      replay(part(c, '.av'), 'hop'); // "Listo": a little jump and a short tone (the screen's own audio)
      services.ui('plink');
    }
    c.making = making;
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
