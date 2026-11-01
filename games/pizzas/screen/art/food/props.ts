import { C, circle, contactShadow, drawOutlined, vgrad, type Ctx } from '@pichi/screen-kit/art';

export function box(c: Ctx) {
  contactShadow(c, 2, 28, 30, 6);
  const g = c.createLinearGradient(0, -30, 0, 30);
  g.addColorStop(0, '#F1D6AE');
  g.addColorStop(1, C.cardboard);
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(-30, -30, 60, 60, 5);
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = C.ink;
  c.stroke();
  c.strokeStyle = C.cardboard2;
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(-30, -18);
  c.lineTo(30, -18);
  c.stroke();
  drawOutlined(c, circle(c, 0, 4, 14), C.tomato, { lw: 2 });
  c.fillStyle = C.cream;
  c.font = '800 18px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('P', 0, 5);
}

// Sabotage: the banana-skin that makes chefs slip (yellow, three petals around a core, brown tips), and the black bag that is thrown.
export function peel(c: Ctx) {
  contactShadow(c, 2, 18, 34, 7);
  // a banana skin laid on the floor: the curved skin with its brown stalk, and the two flaps that peeled off and fell open
  c.save();
  c.rotate(-0.12);
  const flap = (x: number, y: number, rot: number, len: number) => {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(0, -8);
        c.bezierCurveTo(len * 0.4, -16, len * 0.9, -12, len, 0);
        c.bezierCurveTo(len * 0.8, 14, len * 0.3, 14, 0, 8);
        c.closePath();
      },
      vgrad(c, -14, 14, '#FFEE70', '#F2B51E'),
      { lw: 2.8 },
    );
    c.strokeStyle = 'rgba(190,120,10,0.5)';
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(6, 0);
    c.quadraticCurveTo(len * 0.5, -3, len * 0.85, 1);
    c.stroke();
    c.restore();
  };
  flap(8, 2, 0.95, 34);
  flap(8, 2, 2.2, 31);
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-40, 4);
      c.quadraticCurveTo(-28, -22, 8, -14);
      c.quadraticCurveTo(34, -8, 40, 8);
      c.quadraticCurveTo(14, -2, -6, 4);
      c.quadraticCurveTo(-24, 14, -40, 4);
      c.closePath();
    },
    vgrad(c, -22, 14, '#FFF07C', '#F5B91F'),
    { lw: 3 },
  );
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-40, 4);
      c.quadraticCurveTo(-48, 2, -50, -6);
      c.lineTo(-44, -8);
      c.quadraticCurveTo(-42, -2, -35, 0);
      c.closePath();
    },
    '#6B3F1A',
    { lw: 2.4 },
  );
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-26, -6);
  c.quadraticCurveTo(-10, -15, 6, -11);
  c.stroke();
  c.fillStyle = '#7A4A1E';
  for (const [x, y] of [
    [-8, -4],
    [12, -3],
    [22, 0],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, 1.9, 1.3, 0.3, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

export function bag(c: Ctx) {
  contactShadow(c, 1, 26, 26, 6);
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-8, -18);
      c.bezierCurveTo(-30, -12, -34, 18, -16, 26);
      c.quadraticCurveTo(0, 31, 16, 26);
      c.bezierCurveTo(34, 18, 30, -12, 8, -18);
      c.closePath();
    },
    vgrad(c, -18, 28, '#4A4F5C', '#1D2029'),
    { lw: 3 },
  );
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-8, -18);
      c.quadraticCurveTo(-18, -30, -9, -34);
      c.quadraticCurveTo(-3, -26, 0, -22);
      c.quadraticCurveTo(3, -26, 9, -34);
      c.quadraticCurveTo(18, -30, 8, -18);
      c.closePath();
    },
    '#2A2E39',
    { lw: 2.5 },
  );
  c.strokeStyle = 'rgba(255,255,255,0.28)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-20, -2);
  c.quadraticCurveTo(-24, 8, -17, 16);
  c.stroke();
  c.fillStyle = '#7FBF3A';
  c.beginPath();
  c.ellipse(8, 6, 6, 4, 0.5, 0, Math.PI * 2);
  c.fill();
}
