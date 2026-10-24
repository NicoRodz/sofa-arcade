// Chef parts drawn on a canvas. Origin is the chef's feet; the head centre is (0, -68). Used for textures and DOM portraits.
import { C, chefOf, hairOf, skinOf } from './tokens';
import { circle, drawOutlined, ellipse, mix, rr, shade, shine, vgrad, type Ctx } from './gfx';

export const HEAD_Y = -68;
export const MOUTH_DY = 15;
const SHIRT_A = '#FFFFFF', SHIRT_B = '#E7DFD1';

function skinGrad(c: Ctx, skin: string) {
  const g = c.createRadialGradient(-8, HEAD_Y - 9, 3, 0, HEAD_Y, 26);
  g.addColorStop(0, shade(skin, 0.28)); g.addColorStop(0.55, skin); g.addColorStop(1, shade(skin, -0.12));
  return g;
}

export function drawShadow(c: Ctx) {
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 30);
  g.addColorStop(0, 'rgba(0,0,0,0.30)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
  c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, 30, 10, 0, 0, Math.PI * 2); c.fill();
}

export function drawShoe(c: Ctx) {
  drawOutlined(c, ellipse(c, 0, 0, 8, 5), '#3B2A22', { lw: 2.5 });
  c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.ellipse(-2, -1.8, 3.5, 1.3, 0, 0, Math.PI * 2); c.fill();
}

export function drawArm(c: Ctx, skin: string) {
  // anchor = shoulder; arm hangs down
  drawOutlined(c, () => rr(c, -5, 8, 10, 18, 5), skinGrad2(c, skin), { lw: 2.5 });
  drawOutlined(c, () => rr(c, -6.5, -4, 13, 17, 6), vgrad(c, -4, 13, SHIRT_A, SHIRT_B), { lw: 2.5 });
  drawOutlined(c, circle(c, 0, 27, 5.6), skin, { lw: 2.5 });
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(-1.6, 25.4, 1.8, 1.2, 0, 0, Math.PI * 2); c.fill();
}
function skinGrad2(c: Ctx, skin: string) {
  const g = c.createLinearGradient(-5, 0, 5, 0); g.addColorStop(0, shade(skin, 0.15)); g.addColorStop(1, shade(skin, -0.1)); return g;
}

export function drawBody(c: Ctx, slot: number) {
  const ch = chefOf(slot);
  drawOutlined(c, () => rr(c, -24, -49, 48, 46, 18), vgrad(c, -49, -3, SHIRT_A, SHIRT_B), { lw: 3 });
  // coat buttons peek out on both sides of the apron
  c.fillStyle = C.ink;
  for (const sx of [-1, 1]) for (const y of [-42, -33, -24]) { c.beginPath(); c.arc(sx * 20.5, y, 1.5, 0, Math.PI * 2); c.fill(); }
  // apron
  c.strokeStyle = C.ink; c.lineWidth = 7; c.beginPath(); c.moveTo(-9, -35); c.lineTo(-6, -47); c.moveTo(9, -35); c.lineTo(6, -47); c.stroke();
  c.strokeStyle = ch.dark; c.lineWidth = 3.6; c.stroke();
  drawOutlined(c, () => rr(c, -17, -35, 34, 31, 8), vgrad(c, -35, -4, ch.color, ch.dark), { lw: 3 });
  drawOutlined(c, () => rr(c, -8, -24, 16, 11, 3), mix(ch.dark, '#000000', 0.12), { lw: 2 });
  c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.ellipse(-8, -31, 6, 2.2, -0.3, 0, Math.PI * 2); c.fill();
  if (ch.accessory === 'scarf') {
    drawOutlined(c, () => { c.beginPath(); c.moveTo(-15, -50); c.lineTo(15, -50); c.lineTo(0, -31); c.closePath(); }, vgrad(c, -50, -31, '#F0463A', '#C42D22'), { lw: 2.5 });
    c.fillStyle = C.cream;
    for (const [x, y] of [[-7, -46], [6, -46], [0, -39]] as const) { c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill(); }
  }
}

export function drawBodyBack(c: Ctx, slot: number) {
  const ch = chefOf(slot);
  drawOutlined(c, () => rr(c, -24, -49, 48, 46, 18), vgrad(c, -49, -3, SHIRT_A, SHIRT_B), { lw: 3 });
  c.strokeStyle = C.ink; c.lineWidth = 7; c.beginPath(); c.moveTo(-17, -22); c.lineTo(17, -30); c.stroke();
  c.strokeStyle = ch.color; c.lineWidth = 3.6; c.stroke();
  // apron bow
  drawOutlined(c, () => { c.beginPath(); c.moveTo(0, -26); c.lineTo(-11, -33); c.lineTo(-11, -19); c.closePath(); c.moveTo(0, -26); c.lineTo(11, -33); c.lineTo(11, -19); c.closePath(); }, ch.color, { lw: 2.5 });
  drawOutlined(c, circle(c, 0, -26, 3.4), ch.dark, { lw: 2 });
  if (ch.accessory === 'scarf') {
    drawOutlined(c, () => { c.beginPath(); c.moveTo(-14, -49); c.lineTo(14, -49); c.lineTo(0, -37); c.closePath(); }, '#E63B2E', { lw: 2.5 });
  }
}

function backHair(c: Ctx, slot: number) {
  const ch = chefOf(slot), hair = hairOf(slot);
  if (ch.accessory === 'pigtails') {
    for (const sx of [-1, 1]) {
      drawOutlined(c, circle(c, sx * 27, HEAD_Y + 6, 9.5), vgrad(c, HEAD_Y - 4, HEAD_Y + 16, shade(hair, 0.15), hair), { lw: 2.5 });
    }
  }
}

function ears(c: Ctx, skin: string) {
  for (const sx of [-1, 1]) drawOutlined(c, circle(c, sx * 21.5, HEAD_Y + 2, 5.2), shade(skin, -0.04), { lw: 2.5 });
}

export function drawHead(c: Ctx, slot: number) {
  const skin = skinOf(slot), ch = chefOf(slot), hair = hairOf(slot);
  backHair(c, slot);
  ears(c, skin);
  drawOutlined(c, circle(c, 0, HEAD_Y, 22), skinGrad(c, skin), { lw: 3 });
  // hair at the temples, mostly hidden under the hat
  c.fillStyle = hair;
  for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * 19, HEAD_Y - 11, 5, 8, sx * -0.4, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = 'rgba(255,154,162,0.5)';
  for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * 13.5, HEAD_Y + 6, 5.2, 3.2, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = shade(skin, -0.14); c.beginPath(); c.ellipse(0, HEAD_Y + 3, 2.3, 1.7, 0, 0, Math.PI * 2); c.fill();
  if (ch.accessory === 'pigtails') {
    for (const sx of [-1, 1]) drawOutlined(c, () => rr(c, sx * 22 - 3, HEAD_Y - 8, 6, 9, 2), ch.color, { lw: 2 });
  }
}

export function drawHeadBack(c: Ctx, slot: number) {
  const skin = skinOf(slot), hair = hairOf(slot);
  backHair(c, slot);
  ears(c, skin);
  drawOutlined(c, circle(c, 0, HEAD_Y, 22), vgrad(c, HEAD_Y - 22, HEAD_Y + 22, shade(hair, 0.22), hair), { lw: 3 });
  if (chefOf(slot).accessory === 'pigtails') for (const sx of [-1, 1]) drawOutlined(c, () => rr(c, sx * 22 - 3, HEAD_Y - 8, 6, 9, 2), chefOf(slot).color, { lw: 2 });
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(-7, HEAD_Y - 9, 8, 4, -0.5, 0, Math.PI * 2); c.fill();
}

// Layer under the mouth: the beard.
export function drawFaceA(c: Ctx, slot: number) {
  if (chefOf(slot).accessory !== 'beard') return;
  const skin = skinOf(slot);
  c.beginPath(); c.arc(0, HEAD_Y, 23.5, Math.PI * 0.1, Math.PI * 0.9, false);
  c.quadraticCurveTo(-15, HEAD_Y + 6, -9, HEAD_Y + 7); c.quadraticCurveTo(0, HEAD_Y + 4, 9, HEAD_Y + 7); c.quadraticCurveTo(15, HEAD_Y + 6, 22.4, HEAD_Y + 7);
  c.closePath();
  c.fillStyle = vgrad(c, HEAD_Y + 4, HEAD_Y + 28, '#8A5A33', '#5E3A1F'); c.fill(); c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke();
  c.fillStyle = skin; c.beginPath(); c.ellipse(0, HEAD_Y + 15, 8.5, 4.6, 0, 0, Math.PI * 2); c.fill();
}

// Layer over the mouth: glasses, moustache.
export function drawFaceB(c: Ctx, slot: number) {
  const a = chefOf(slot).accessory;
  if (a === 'glasses') {
    for (const sx of [-1, 1]) {
      c.fillStyle = 'rgba(190,225,255,0.35)'; c.beginPath(); c.arc(sx * 8.5, HEAD_Y - 2, 8, 0, Math.PI * 2); c.fill();
      c.strokeStyle = C.ink; c.lineWidth = 2.6; c.beginPath(); c.arc(sx * 8.5, HEAD_Y - 2, 8, 0, Math.PI * 2); c.stroke();
    }
    c.lineWidth = 2.4; c.beginPath(); c.moveTo(-1, HEAD_Y - 3); c.quadraticCurveTo(0, HEAD_Y - 5, 1, HEAD_Y - 3); c.stroke();
    c.beginPath(); c.moveTo(-16.5, HEAD_Y - 3); c.lineTo(-21, HEAD_Y - 5); c.moveTo(16.5, HEAD_Y - 3); c.lineTo(21, HEAD_Y - 5); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.6; c.beginPath(); c.arc(-8.5, HEAD_Y - 2, 5.2, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
  } else if (a === 'mustache') {
    c.fillStyle = '#2B1B17'; c.strokeStyle = '#2B1B17'; c.lineWidth = 1.5;
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(0, HEAD_Y + 9);
      c.bezierCurveTo(sx * 4, HEAD_Y + 5, sx * 11, HEAD_Y + 5.5, sx * 14.5, HEAD_Y + 10);
      c.bezierCurveTo(sx * 18, HEAD_Y + 14.5, sx * 14, HEAD_Y + 17.5, sx * 11.5, HEAD_Y + 15);
      c.bezierCurveTo(sx * 10, HEAD_Y + 12.5, sx * 5, HEAD_Y + 12.5, 0, HEAD_Y + 12.5);
      c.closePath(); c.fill(); c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-9, HEAD_Y + 8.4); c.quadraticCurveTo(-5, HEAD_Y + 7.2, -2, HEAD_Y + 8.8); c.stroke();
  }
}

export function drawEye(c: Ctx, kind: 'open' | 'happy' | 'x') {
  if (kind === 'open') {
    c.fillStyle = C.ink; c.beginPath(); c.ellipse(0, 0, 2.9, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0.9, -1.5, 1.2, 0, Math.PI * 2); c.fill();
  } else if (kind === 'happy') {
    c.strokeStyle = C.ink; c.lineWidth = 2.8; c.beginPath(); c.moveTo(-4, 1.6); c.quadraticCurveTo(0, -4.2, 4, 1.6); c.stroke();
  } else {
    c.strokeStyle = C.ink; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-3.4, -3.4); c.lineTo(3.4, 3.4); c.moveTo(3.4, -3.4); c.lineTo(-3.4, 3.4); c.stroke();
  }
}

export function drawMouth(c: Ctx, kind: 'smile' | 'open' | 'worry') {
  c.strokeStyle = C.ink; c.lineWidth = 2.3;
  if (kind === 'smile') { c.beginPath(); c.moveTo(-4, 0); c.quadraticCurveTo(0, 4, 4, 0); c.stroke(); }
  else if (kind === 'open') {
    c.beginPath(); c.moveTo(-6, -1); c.quadraticCurveTo(0, 9, 6, -1); c.closePath();
    c.fillStyle = '#7A1F1F'; c.fill(); c.stroke();
    c.fillStyle = '#FF8A8A'; c.beginPath(); c.ellipse(0, 3.2, 2.6, 1.6, 0, 0, Math.PI * 2); c.fill();
  } else { c.beginPath(); c.moveTo(-4, 2); c.quadraticCurveTo(-2, -1, 0, 1); c.quadraticCurveTo(2, 3, 4, 0); c.stroke(); }
}

export function drawDrop(c: Ctx) {
  c.beginPath(); c.moveTo(0, -7); c.bezierCurveTo(6, 0, 5, 5, 0, 5); c.bezierCurveTo(-5, 5, -6, 0, 0, -7); c.closePath();
  c.fillStyle = '#7EC8F2'; c.fill(); c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(-1.6, 0, 1, 1.8, 0, 0, Math.PI * 2); c.fill();
}

function cloud(c: Ctx, circles: [number, number, number][], body?: [number, number, number, number]) {
  const all = () => {
    c.beginPath();
    for (const [x, y, r] of circles) { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); }
    if (body) c.rect(...body);
  };
  // ink silhouette first so overlapping puffs merge into a single outline
  c.save(); all(); c.lineWidth = 6; c.strokeStyle = C.ink; c.stroke(); c.restore();
  all(); c.fillStyle = '#fff'; c.fill();
  const top = Math.min(...circles.map(([, y, r]) => y - r)), bot = Math.max(...circles.map(([, y]) => y));
  c.save(); all(); c.clip();
  c.fillStyle = vgrad(c, top, bot + 6, 'rgba(255,255,255,0)', 'rgba(150,130,110,0.30)'); c.fillRect(-60, top, 120, bot - top + 12);
  c.strokeStyle = 'rgba(150,130,110,0.28)'; c.lineWidth = 1.8;
  for (const [x, y, r] of circles) { c.beginPath(); c.arc(x, y + 1, r - 3, Math.PI * 0.2, Math.PI * 0.8); c.stroke(); }
  c.restore();
}

export function drawHat(c: Ctx, slot: number) {
  const ch = chefOf(slot);
  if (ch.accessory === 'cap') {
    // backwards cap: dome, adjuster strap on the forehead, visor sticking out behind
    drawOutlined(c, () => { c.beginPath(); c.moveTo(-14, -90); c.lineTo(-40, -86); c.quadraticCurveTo(-42, -80, -34, -79); c.lineTo(-14, -83); c.closePath(); }, ch.dark, { lw: 3 });
    const dome = () => { c.beginPath(); c.arc(0, HEAD_Y - 14, 24, Math.PI, 0); c.lineTo(24, -82); c.quadraticCurveTo(0, -78, -24, -82); c.closePath(); };
    drawOutlined(c, dome, vgrad(c, -106, -80, mix(ch.color, '#FFFFFF', 0.25), ch.color), { lw: 3 });
    c.save(); dome(); c.clip();
    c.strokeStyle = 'rgba(120,50,0,0.35)'; c.lineWidth = 2;
    for (const x of [-12, 0, 12]) { c.beginPath(); c.moveTo(x * 0.3, -106); c.quadraticCurveTo(x * 1.1, -95, x * 1.2, -80); c.stroke(); }
    c.restore();
    drawOutlined(c, () => rr(c, -13, -88, 26, 6, 3), ch.dark, { lw: 2 });
    drawOutlined(c, circle(c, 0, -106.5, 3), ch.dark, { lw: 2 });
    shine(c, 0, -94, 18, 0.4, 3);
    return;
  }
  if (ch.accessory === 'tallhat') {
    cloud(c, [[-13, -104, 12], [13, -104, 12], [-8, -121, 12], [8, -121, 12], [0, -134, 12]], [-14, -104, 28, 14]);
    c.fillStyle = '#fff'; c.fillRect(-13, -108, 26, 18);
  } else {
    cloud(c, [[-13, -97, 13], [0, -104, 14], [13, -97, 13]], [-14, -100, 28, 10]);
  }
  drawOutlined(c, () => rr(c, -21, -94, 42, 11, 3.5), vgrad(c, -94, -83, mix(ch.color, '#FFFFFF', 0.25), ch.dark), { lw: 3 });
  c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(-17, -92, 20, 2);
  if (ch.accessory === 'bow') {
    const bx = 15, by = -114;
    drawOutlined(c, () => { c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - 14, by - 9); c.lineTo(bx - 14, by + 9); c.closePath(); c.moveTo(bx, by); c.lineTo(bx + 14, by - 9); c.lineTo(bx + 14, by + 9); c.closePath(); }, ch.color, { lw: 2.5 });
    drawOutlined(c, circle(c, bx, by, 4.2), ch.dark, { lw: 2 });
  }
}

// Whole chef standing still: lobby chips and results podium.
export function drawChefStatic(c: Ctx, slot: number, mood: 'idle' | 'happy' = 'idle') {
  drawShadow(c);
  for (const sx of [-1, 1]) { c.save(); c.translate(sx * 10, -3); drawShoe(c); c.restore(); }
  for (const sx of [-1, 1]) { c.save(); c.translate(sx * 25, -41); c.rotate(sx * -0.1); drawArm(c, skinOf(slot)); c.restore(); }
  drawBody(c, slot);
  drawHead(c, slot);
  drawFaceA(c, slot);
  for (const sx of [-1, 1]) { c.save(); c.translate(sx * 7, HEAD_Y - 2); drawEye(c, mood === 'happy' ? 'happy' : 'open'); c.restore(); }
  c.save(); c.translate(0, HEAD_Y + MOUTH_DY); drawMouth(c, mood === 'happy' ? 'open' : 'smile'); c.restore();
  drawFaceB(c, slot);
  drawHat(c, slot);
}
