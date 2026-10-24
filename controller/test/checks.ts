// Layout rules for the phone page, checked on a Probe (see harness.ts). Each returns human-readable violations.
import type { Box, Insets, Item, Probe } from './harness';

export const MIN_TOUCH = 44; // CSS px: Apple's HIG minimum; Android recommends 48 dp
const EPS = 0.75;

const inside = (b: Box, o: Box, tol = EPS) => b.x >= o.x - tol && b.y >= o.y - tol && b.x + b.w <= o.x + o.w + tol && b.y + b.h <= o.y + o.h + tol;
const rectsHit = (a: Box, b: Box) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const corners = (b: Box) => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]] as const;
const dist = (px: number, py: number, c: { cx: number; cy: number }) => Math.hypot(px - c.cx, py - c.cy);
const circleOf = (b: Box) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: Math.min(b.w, b.h) / 2 });
// circle vs rectangle: distance from the centre to the closest point of the rectangle
const circleHitsRect = (b: Box, r: Box) => { const c = circleOf(b); const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w)), ny = Math.max(r.y, Math.min(c.cy, r.y + r.h)); return dist(nx, ny, c) < c.r - EPS; };

const one = (p: Probe, sel: string) => p.items.find((i) => i.sel === sel);
const all = (p: Probe, sel: string) => p.items.filter((i) => i.sel === sel);
const safeRect = (p: Probe): Box => ({ x: p.inset.left, y: p.inset.top, w: p.vw - p.inset.left - p.inset.right, h: p.vh - p.inset.top - p.inset.bottom });
const fmt = (b: Box) => `[${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.w.toFixed(0)}x${b.h.toFixed(0)}]`;
const nm = (i: Item) => `${i.sel}#${i.i}`;

// 1. Everything you press is at least 44x44 CSS px.
const TOUCH = ['#remote .rb', '#btnA', '#btnB', '#pswap', '#howtoopen', '#assist', '#howtoclose', '#zoomfix', '#join button', '#name'];
export function touchSize(p: Probe): string[] {
  const out: string[] = [];
  for (const sel of TOUCH) for (const i of all(p, sel)) if (i.box.w < MIN_TOUCH - 0.5 || i.box.h < MIN_TOUCH - 0.5) out.push(`touch target ${nm(i)} is ${i.box.w.toFixed(0)}x${i.box.h.toFixed(0)} (< ${MIN_TOUCH})`);
  return out;
}

// 2. Labels and icons stay inside the round control that carries them (the circle's border is 5px).
export function insideControl(p: Probe): string[] {
  const out: string[] = [];
  for (const sel of ['#btnA', '#btnB', '#stickhint']) {
    const c = one(p, sel); if (!c) continue;
    const circle = circleOf(c.box); const lim = circle.r - 5;
    for (const child of p.items.filter((i) => i.sel.startsWith(`${sel} `))) {
      const b = child.text ?? child.box;
      for (const [x, y] of corners(b)) if (dist(x, y, circle) > lim + EPS) { out.push(`${nm(child)} ${fmt(b)} sticks out of ${sel} (corner ${x.toFixed(0)},${y.toFixed(0)} is ${(dist(x, y, circle) - lim).toFixed(0)}px past the face)`); break; }
    }
    // label above icon: they must not overlap each other
    const ico = p.items.find((i) => i.sel === `${sel} .ico`), lbl = p.items.find((i) => i.sel === `${sel} .lbl`);
    if (ico && lbl?.text && rectsHit(ico.box, lbl.text)) out.push(`${sel}: label overlaps its icon`);
  }
  return out;
}

// 3. Text stays inside the box that is meant to hold it (cards, tiles); a designed ellipsis only clips horizontally.
const CONTAINERS: [string, string][] = [['#puesto', '#pico'], ['#puesto', '#pname'], ['#puesto', '#phint'], ['#puesto', '#pswap'], ['#howto .steps li', '#howto .steps .tx'], ['#howto .steps li', '#howto .steps .ic'],
  ...['#stickLbl', '#lblA', '#lblB'].flatMap((l): [string, string][] => [[`${l} .pl`, `${l} .lbl`], [`${l} .pl`, `${l} .hold`]])];
export function textInBox(p: Probe): string[] {
  const out: string[] = [];
  for (const [cs, ks] of CONTAINERS) {
    const cont = all(p, cs);
    for (const k of all(p, ks)) {
      const host = cont.find((c) => inside(k.box, c.box, 2)) ?? cont.find((c) => rectsHit(c.box, k.box));
      if (!host) { out.push(`${nm(k)} has no ${cs} around it`); continue; }
      const b = k.text ?? k.box;
      const tb = k.ellipsis ? { ...b, x: k.box.x, w: k.box.w } : b;
      if (!inside(tb, host.box, 1.5)) out.push(`${nm(k)} text ${fmt(b)} leaves ${cs} ${fmt(host.box)}`);
      if (k.clipped && !k.ellipsis) out.push(`${nm(k)} content is clipped by its own box`);
    }
  }
  // a text that is clipped (box smaller than its content) without a designed ellipsis, anywhere
  for (const i of p.items) if (i.text && i.clipped && !i.ellipsis && !CONTAINERS.some(([, k]) => k === i.sel)) out.push(`${nm(i)} text is clipped`);
  return out;
}

// 4. Controls and text stay inside the safe area (notch, rounded corners, home indicator).
const SAFE_BOXES = ['#remote .rb', '#remote .crown', '#stickLbl .pl', '#lblA .pl', '#lblB .pl', '#btnA', '#btnB', '#stickhint', '#puesto', '#zoomfix', '#join button', '#name', '#howtoopen', '#assist', '#howtoclose', '#howto .steps li', '#howto .note'];
export function safeArea(p: Probe): string[] {
  const out: string[] = [];
  const safe = safeRect(p), full: Box = { x: 0, y: 0, w: p.vw, h: p.vh };
  for (const i of p.items) {
    if (SAFE_BOXES.includes(i.sel) && !inside(i.box, safe)) out.push(`${nm(i)} ${fmt(i.box)} leaves the safe area ${fmt(safe)}`);
    else if (i.text && !inside(i.text, i.sel === '#hud' ? safe : full)) out.push(`${nm(i)} text ${fmt(i.text)} leaves ${i.sel === '#hud' ? 'the safe area' : 'the screen'}`);
    else if (i.text && i.sel === '#hud' && !inside(i.text, safe)) out.push(`#hud text ${fmt(i.text)} leaves the safe area`);
    if (!inside(i.box, full) && i.sel !== '#zone' && i.sel !== '#howto .steps') out.push(`${nm(i)} ${fmt(i.box)} leaves the screen`);
  }
  return out;
}

// 5. Nothing on the pad sits on top of anything else: stick, two buttons, station card, HUD, zoom banner.
export function padOverlaps(p: Probe): string[] {
  const out: string[] = [];
  const parts = ['#stickhint', '#btnA', '#btnB', '#stickLbl .pl', '#lblA .pl', '#lblB .pl', '#puesto', '#hud', '#zoomfix'].flatMap((s) => all(p, s));
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
    const A = parts[a]!, B = parts[b]!;
    const ba = A.sel === '#hud' ? A.text ?? A.box : A.box, bb = B.sel === '#hud' ? B.text ?? B.box : B.box;
    const ca = A.round, cb = B.round;
    const hit = ca && cb ? dist(circleOf(ba).cx, circleOf(ba).cy, circleOf(bb)) < circleOf(ba).r + circleOf(bb).r - EPS : ca ? circleHitsRect(ba, bb) : cb ? circleHitsRect(bb, ba) : rectsHit(ba, bb);
    if (hit) out.push(`${A.sel} ${fmt(ba)} overlaps ${B.sel} ${fmt(bb)}`);
  }
  // text of the pad (labels) over another control: already covered by insideControl + the circles above
  return out;
}

// 6. Overlay screens: their text blocks must not collide, and the whole content must fit the screen.
export function stacked(p: Probe): string[] {
  const out: string[] = [];
  for (const root of ['#wait > *', '#choosing > *', '#results > *', '#rotate > *', '#join .brand', '#name', '#join button']) {
    const xs = all(p, root).filter((i) => i.text ?? i.box);
    for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) {
      const A = xs[a]!, B = xs[b]!;
      const ba = A.text ?? A.box, bb = B.text ?? B.box;
      if (rectsHit(ba, bb)) out.push(`${nm(A)} ${fmt(ba)} overlaps ${nm(B)} ${fmt(bb)}`);
    }
  }
  const brand = all(p, '#join .brand')[0], name = one(p, '#name'), btn = one(p, '#join button');
  const seq = [brand, name, btn].filter((x): x is Item => !!x);
  for (let a = 0; a < seq.length; a++) for (let b = a + 1; b < seq.length; b++) if (rectsHit(seq[a]!.text ?? seq[a]!.box, seq[b]!.text ?? seq[b]!.box)) out.push(`join: ${nm(seq[a]!)} overlaps ${nm(seq[b]!)}`);
  // the how-to card: tiles do not overlap each other nor the note / close button
  const lis = all(p, '#howto .steps li'), extra = [...all(p, '#howto .note'), ...all(p, '#howtoclose'), ...all(p, '#howto h2'), ...all(p, '#howtogame')];
  for (let a = 0; a < lis.length; a++) {
    for (let b = a + 1; b < lis.length; b++) if (rectsHit(lis[a]!.box, lis[b]!.box)) out.push(`how-to tile ${a} overlaps tile ${b}`);
    for (const e of extra) if (rectsHit(lis[a]!.box, e.text ?? e.box)) out.push(`how-to tile ${a} overlaps ${nm(e)}`);
  }
  for (let a = 0; a < extra.length; a++) for (let b = a + 1; b < extra.length; b++) if (rectsHit(extra[a]!.text ?? extra[a]!.box, extra[b]!.text ?? extra[b]!.box)) out.push(`${nm(extra[a]!)} overlaps ${nm(extra[b]!)}`);
  // the zoom banner floats over whatever is there: it may not sit on top of the stacked text
  const z = one(p, '#zoomfix');
  if (z) for (const i of p.items) if (i.text && i.sel !== '#zoomfix' && i.sel !== '#hud' && !i.sel.startsWith('#btn') && rectsHit(z.box, i.text)) out.push(`#zoomfix covers ${nm(i)}`);
  return out;
}

// 7. The touch zones are the ones the game was tuned with: the left half is the stick, A and B keep their size and place
// (A may only move left of the safe-area inset and up by what the home indicator takes).
export function touchZones(p: Probe): string[] {
  const out: string[] = [];
  const z = one(p, '#zone'), a = one(p, '#btnA'), b = one(p, '#btnB');
  if (!z || !a || !b) return out;
  const vmin = Math.min(p.vw, p.vh), size = 0.34 * vmin, near = (x: number, y: number, t = 1.5) => Math.abs(x - y) <= t;
  if (!near(z.box.x, 0) || !near(z.box.y, 0) || !near(z.box.w, p.vw / 2) || !near(z.box.h, p.vh)) out.push(`stick zone is ${fmt(z.box)}, want the left half`);
  for (const [n, i] of [['A', a], ['B', b]] as const) if (!near(i.box.w, size) || !near(i.box.h, size)) out.push(`button ${n} is ${i.box.w.toFixed(0)}x${i.box.h.toFixed(0)}, want ${size.toFixed(0)}`);
  if (!near(b.box.x + b.box.w, p.vw * 0.73) || !near(b.box.y, p.vh * 0.09, p.pressed ? 0.012 * vmin + 1.5 : 1.5)) out.push(`button B moved: ${fmt(b.box)}`);
  const wantRight = Math.max(p.vw * 0.04, p.inset.right + 10), top = p.vh * 0.52;
  const lift = p.inset.bottom ? 16 : 0, dip = p.pressed ? 0.012 * vmin + 1.5 : 1.5; // a pressed button sinks 1.2vmin by design
  if (!near(a.box.x + a.box.w, p.vw - wantRight, 2) || a.box.y > top + dip || a.box.y < top - lift - 1.5) out.push(`button A moved: ${fmt(a.box)} (want right edge ${(p.vw - wantRight).toFixed(0)}, top ${(top - lift).toFixed(0)}..${top.toFixed(0)})`);
  return out;
}

// 8. The Captain's D-pad: its buttons never sit on each other nor on anything the screen says or presses (overlay text, how-to tiles,
// the zoom banner), and it holds the same place on every screen it shows.
export function remoteClear(p: Probe): string[] {
  const out: string[] = [];
  const rb = all(p, '#remote .rb'), crown = all(p, '#remote .crown');
  if (!rb.length) return out;
  const parts = [...rb, ...crown];
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) if (rectsHit(parts[a]!.box, parts[b]!.box)) out.push(`${nm(parts[a]!)} overlaps ${nm(parts[b]!)}`);
  if (rb.length !== 7) out.push(`the D-pad has ${rb.length} buttons, want 7 (up, down, left, right, OK, Atrás, ?)`);
  const others = p.items.filter((i) => !i.sel.startsWith('#remote'));
  for (const r of parts) for (const o of others) {
    const ob = o.text ?? o.box;
    if (['#zone', '#howto .steps'].includes(o.sel)) continue; // containers: their children are measured one by one
    if (rectsHit(r.box, ob)) out.push(`${nm(r)} ${fmt(r.box)} overlaps ${nm(o)} ${fmt(ob)}`);
  }
  return out;
}

export const RULES: [string, (p: Probe) => string[]][] = [
  ['touch size >= 44px', touchSize], ['labels inside their control', insideControl], ['text inside its box', textInBox],
  ['safe area', safeArea], ['pad parts do not overlap', padOverlaps], ['stacked text does not collide', stacked], ['touch zones unchanged', touchZones], ["Captain's D-pad is clear", remoteClear],
];
export const violations = (p: Probe): string[] => RULES.flatMap(([n, f]) => f(p).map((v) => `${n}: ${v}`));
export type { Insets };
