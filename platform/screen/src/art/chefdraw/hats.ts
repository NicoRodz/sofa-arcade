// Chef parts drawn on a canvas. Origin is the chef's feet; the head centre is (0, -68). Used for textures and DOM portraits.
import { C, chefOf } from '../tokens';
import { circle, drawOutlined, ellipse, mix, rr, shine, vgrad, type Ctx } from '../gfx';
import { HEAD_Y } from './body';

function cloud(c: Ctx, circles: [number, number, number][], body?: [number, number, number, number]) {
  const all = () => {
    c.beginPath();
    for (const [x, y, r] of circles) {
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, Math.PI * 2);
    }
    if (body) c.rect(...body);
  };
  // ink silhouette first so overlapping puffs merge into a single outline
  c.save();
  all();
  c.lineWidth = 6;
  c.strokeStyle = C.ink;
  c.stroke();
  c.restore();
  all();
  c.fillStyle = '#fff';
  c.fill();
  const top = Math.min(...circles.map(([, y, r]) => y - r)),
    bot = Math.max(...circles.map(([, y]) => y));
  c.save();
  all();
  c.clip();
  c.fillStyle = vgrad(c, top, bot + 6, 'rgba(255,255,255,0)', 'rgba(150,130,110,0.30)');
  c.fillRect(-60, top, 120, bot - top + 12);
  c.strokeStyle = 'rgba(150,130,110,0.28)';
  c.lineWidth = 1.8;
  for (const [x, y, r] of circles) {
    c.beginPath();
    c.arc(x, y + 1, r - 3, Math.PI * 0.2, Math.PI * 0.8);
    c.stroke();
  }
  c.restore();
}

export function drawHat(c: Ctx, slot: number) {
  const ch = chefOf(slot);
  if (ch.accessory === 'cap') {
    // backwards cap: dome, adjuster strap on the forehead, visor sticking out behind
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(-14, -90);
        c.lineTo(-40, -86);
        c.quadraticCurveTo(-42, -80, -34, -79);
        c.lineTo(-14, -83);
        c.closePath();
      },
      ch.dark,
      { lw: 3 },
    );
    const dome = () => {
      c.beginPath();
      c.arc(0, HEAD_Y - 14, 24, Math.PI, 0);
      c.lineTo(24, -82);
      c.quadraticCurveTo(0, -78, -24, -82);
      c.closePath();
    };
    drawOutlined(c, dome, vgrad(c, -106, -80, mix(ch.color, '#FFFFFF', 0.25), ch.color), { lw: 3 });
    c.save();
    dome();
    c.clip();
    c.strokeStyle = 'rgba(120,50,0,0.35)';
    c.lineWidth = 2;
    for (const x of [-12, 0, 12]) {
      c.beginPath();
      c.moveTo(x * 0.3, -106);
      c.quadraticCurveTo(x * 1.1, -95, x * 1.2, -80);
      c.stroke();
    }
    c.restore();
    drawOutlined(c, () => rr(c, -13, -88, 26, 6, 3), ch.dark, { lw: 2 });
    drawOutlined(c, circle(c, 0, -106.5, 3), ch.dark, { lw: 2 });
    shine(c, 0, -94, 18, 0.4, 3);
    return;
  }
  if (ch.accessory === 'tallhat') {
    cloud(
      c,
      [
        [-13, -104, 12],
        [13, -104, 12],
        [-8, -121, 12],
        [8, -121, 12],
        [0, -134, 12],
      ],
      [-14, -104, 28, 14],
    );
    c.fillStyle = '#fff';
    c.fillRect(-13, -108, 26, 18);
  } else {
    cloud(
      c,
      [
        [-13, -97, 13],
        [0, -104, 14],
        [13, -97, 13],
      ],
      [-14, -100, 28, 10],
    );
  }
  drawOutlined(c, () => rr(c, -21, -94, 42, 11, 3.5), vgrad(c, -94, -83, mix(ch.color, '#FFFFFF', 0.25), ch.dark), { lw: 3 });
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.fillRect(-17, -92, 20, 2);
  if (ch.accessory === 'bow') {
    const bx = 15,
      by = -114;
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx - 14, by - 9);
        c.lineTo(bx - 14, by + 9);
        c.closePath();
        c.moveTo(bx, by);
        c.lineTo(bx + 14, by - 9);
        c.lineTo(bx + 14, by + 9);
        c.closePath();
      },
      ch.color,
      { lw: 2.5 },
    );
    drawOutlined(c, circle(c, bx, by, 4.2), ch.dark, { lw: 2 });
  }
}

// Ayudante (assist.ts): a propeller beanie perched on top of the chef's hat, big and bright so the whole table SEES who plays with help (from the couch, at 3 m).
// The beanie + stalk + hub is one texture per hat (the hats are not equally tall), the blades another that the chef spins (squash in x) while it is on screen.
export const hatTop = (slot: number) => {
  const a = chefOf(slot).accessory;
  return a === 'cap' ? -109 : a === 'tallhat' ? -148 : a === 'bow' ? -120 : -115;
};

export const PROP_Y = 38; // the hub sits this far above the hat

export function drawPropStem(c: Ctx, slot: number) {
  const y = hatTop(slot);
  drawOutlined(c, () => rr(c, -3, y - PROP_Y + 4, 6, PROP_Y - 14, 2.5), '#F1E9D8', { lw: 3 }); // stalk
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-19, y + 3);
      c.quadraticCurveTo(-20, y - 20, 0, y - 20);
      c.quadraticCurveTo(20, y - 20, 19, y + 3);
      c.closePath();
    },
    vgrad(c, y - 20, y + 3, '#7FE3FF', '#1FA9E0'),
    { lw: 3.5 },
  ); // the beanie
  drawOutlined(c, () => rr(c, -20, y - 4, 40, 8, 4), '#FFE14A', { lw: 3 }); // its band
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.beginPath();
  c.ellipse(-7, y - 13, 5, 2.2, -0.5, 0, Math.PI * 2);
  c.fill();
  drawOutlined(c, circle(c, 0, y - PROP_Y, 6.5), '#E2338C', { lw: 3 });
}

export function drawPropBlades(c: Ctx) {
  drawOutlined(c, ellipse(c, -19, 0, 19, 7.5), '#35D0FF', { lw: 3.5 });
  drawOutlined(c, ellipse(c, 19, 0, 19, 7.5), '#FFE14A', { lw: 3.5 });
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath();
  c.ellipse(-23, -2.5, 8, 1.8, 0, 0, Math.PI * 2);
  c.ellipse(15, -2.5, 8, 1.8, 0, 0, Math.PI * 2);
  c.fill();
  drawOutlined(c, circle(c, 0, 0, 6), '#E2338C', { lw: 3 });
}
