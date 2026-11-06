// What the layout harness measures in the page: probe types, selector list and the in-page probe function (moved out of harness.ts).
import { ASSIST_PROBE } from '../assist-scenarios';
import { MATCH_PROBE } from '../match-probe';
import type { Insets } from './viewports';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Item {
  sel: string;
  i: number;
  box: Box; // border box
  text: Box | null; // union of the text line boxes, when the element carries text
  ellipsis: boolean; // text-overflow: ellipsis on a clipping box: the cut is designed
  clipped: boolean; // content taller/wider than the box (not designed)
  round: boolean; // a circle (border-radius 50%)
  fs: number; // computed font size
  covered: boolean; // a touch target whose centre hits something that is not it (an overlay on top, off screen)
}
export interface Probe {
  vw: number;
  vh: number;
  inset: Insets;
  zoomed: boolean;
  pressed: boolean;
  view: string;
  items: Item[];
}

// Selectors that matter for layout. Anything not displayed in the current state is skipped by the probe.
export const SELECTORS = [
  '#join .brand',
  '#name',
  '#join button',
  '#zone',
  '#stickhint',
  '#stickhint .ico',
  '#stickhint .lbl',
  '#btnA',
  '#btnA .ico',
  '#btnA .lbl',
  '#btnA .hold',
  '#btnB',
  '#btnB .ico',
  '#btnB .lbl',
  '#btnB .hold',
  '#stickLbl .pl',
  '#stickLbl .lbl',
  '#stickLbl .hold',
  '#lblA .pl',
  '#lblA .lbl',
  '#lblA .hold',
  '#lblB .pl',
  '#lblB .lbl',
  '#lblB .hold',
  ...MATCH_PROBE,
  '#school',
  '#schoolstep',
  '#schooltext',
  '#schoolskip',
  '#schoolall',
  '#signals',
  '#signals .sg',
  '#wait > *',
  '#howtoopen',
  ...ASSIST_PROBE,
  '#choosing > *',
  '#results > *',
  '#howto h2',
  '#howtogame',
  '#howto .steps',
  '#howto .steps li',
  '#howto .steps .n',
  '#howto .steps .ic',
  '#howto .steps .tx',
  '#howto .note',
  '#howtoclose',
  '#rotate > *',
  '#zoomfix',
  '#remote .rb',
  '#remote .crown',
  '#teamswap',
];

export const PROBE = `((selectors, touch) => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const ps = getComputedStyle(probe);
  const inset = { top: parseFloat(ps.paddingTop), right: parseFloat(ps.paddingRight), bottom: parseFloat(ps.paddingBottom), left: parseFloat(ps.paddingLeft) };
  probe.remove();
  const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const modal = document.body.dataset.howto === 'open'; // the how-to card is a modal: what it hides is meant to be hidden
  const items = [];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el, i) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden') return; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      let text = null;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText) {
        const range = document.createRange(); range.selectNodeContents(el);
        const rs = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        if (rs.length) { const l = Math.min(...rs.map((q) => q.left)), t = Math.min(...rs.map((q) => q.top)), rr = Math.max(...rs.map((q) => q.right)), b = Math.max(...rs.map((q) => q.bottom)); text = { x: l, y: t, w: rr - l, h: b - t }; }
      }
      const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible';
      items.push({ sel, i, box: box(r), text, ellipsis: cs.textOverflow === 'ellipsis' && clips,
        clipped: clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1),
        round: parseFloat(cs.borderTopLeftRadius) >= Math.min(r.width, r.height) / 2 - 0.5 && r.width > 0 && Math.abs(r.width - r.height) < 1,
        fs: parseFloat(cs.fontSize),
        covered: touch.includes(sel) && !(modal && !el.closest('#howto, #remote, #zoomfix')) && (() => { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(e && el.contains(e)); })() });
    });
  }
  return { vw: innerWidth, vh: innerHeight, inset, zoomed: document.body.classList.contains('zoomed'), view: document.body.dataset.view || '', pressed: !!document.querySelector('.act.down'), items };
})`;
