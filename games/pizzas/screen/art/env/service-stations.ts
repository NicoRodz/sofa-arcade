import { C, circle, drawOutlined, rr, vgrad, type Ctx } from '@pichi/screen-kit/art';

export function trashCan(c: Ctx, x0: number, y0: number) {
  c.save();
  c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)';
  c.beginPath();
  c.ellipse(60, 104, 40, 8, 0, 0, Math.PI * 2);
  c.fill();
  // can body: slightly tapered steel drum with two ribs
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(30, 46);
      c.lineTo(90, 46);
      c.lineTo(84, 106);
      c.lineTo(36, 106);
      c.closePath();
    },
    vgrad(c, 46, 106, '#D6DFE5', C.steel2),
    { lw: 3 },
  );
  c.strokeStyle = 'rgba(43,27,23,0.3)';
  c.lineWidth = 2.5;
  for (const x of [48, 60, 72]) {
    c.beginPath();
    c.moveTo(x - (60 - x) * 0.1, 56);
    c.lineTo(x + (x - 60) * 0.08, 98);
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.fillRect(35, 50, 5, 40);
  // basil band with a cream cross: "tira aqui lo que no sirve"
  drawOutlined(c, () => rr(c, 34, 66, 52, 18, 5), C.basil, { lw: 2.5 });
  c.strokeStyle = C.cream;
  c.lineWidth = 3.5;
  c.beginPath();
  c.moveTo(54, 70);
  c.lineTo(66, 80);
  c.moveTo(66, 70);
  c.lineTo(54, 80);
  c.stroke();
  // lid and handle
  drawOutlined(c, () => rr(c, 25, 34, 70, 15, 7), vgrad(c, 34, 49, '#EAF0F3', C.steel), { lw: 3 });
  drawOutlined(c, () => rr(c, 50, 24, 20, 11, 5), C.steel2, { lw: 2.5 });
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(32, 39);
  c.lineTo(52, 38);
  c.stroke();
  c.restore();
}

// Sabotage: the catapult. A wooden cart on two wheels with a post and a throwing arm that ends in a bag-shaped cup (the bag itself is a dynamic sprite
// that sits in it while the chef aims). Painted warning stripes on the base say "this one throws".
export function catapult(c: Ctx, x0: number, y0: number) {
  c.save();
  c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.28)';
  c.beginPath();
  c.ellipse(60, 110, 54, 8, 0, 0, Math.PI * 2);
  c.fill();
  // base slab with hazard stripes
  drawOutlined(c, () => rr(c, 8, 74, 104, 30, 8), vgrad(c, 74, 104, '#C98A4B', C.wood2), { lw: 3 });
  c.save();
  rr(c, 8, 74, 104, 30, 8);
  c.clip();
  c.fillStyle = C.cheese;
  for (let i = -2; i < 8; i++) {
    c.beginPath();
    c.moveTo(8 + i * 18, 104);
    c.lineTo(8 + i * 18 + 9, 104);
    c.lineTo(8 + i * 18 + 27, 74);
    c.lineTo(8 + i * 18 + 18, 74);
    c.closePath();
    c.fill();
  }
  c.fillStyle = 'rgba(43,27,23,0.55)';
  c.fillRect(8, 74, 104, 5);
  c.restore();
  rr(c, 8, 74, 104, 30, 8);
  c.lineWidth = 3;
  c.strokeStyle = C.ink;
  c.stroke();
  // wheels
  for (const x of [30, 90]) {
    drawOutlined(c, circle(c, x, 106, 13), vgrad(c, 93, 119, '#6B4528', '#3C2615'), { lw: 3 });
    c.strokeStyle = '#B98A55';
    c.lineWidth = 2.5;
    for (let a = 0; a < 3; a++) {
      c.beginPath();
      c.moveTo(x - Math.cos(a * 1.047) * 10, 106 - Math.sin(a * 1.047) * 10);
      c.lineTo(x + Math.cos(a * 1.047) * 10, 106 + Math.sin(a * 1.047) * 10);
      c.stroke();
    }
    drawOutlined(c, circle(c, x, 106, 3.5), C.steel, { lw: 2 });
  }
  // post and arm
  drawOutlined(c, () => rr(c, 50, 30, 20, 50, 4), vgrad(c, 30, 80, '#B7803F', C.wood2), { lw: 3 });
  c.save();
  c.translate(60, 38);
  c.rotate(-0.62);
  drawOutlined(c, () => rr(c, -22, -7, 84, 14, 5), vgrad(c, -7, 7, '#E0A765', '#B7803F'), { lw: 3 });
  // the cup at the end of the arm
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(48, -5);
      c.lineTo(76, -9);
      c.quadraticCurveTo(72, 16, 54, 14);
      c.closePath();
    },
    vgrad(c, -9, 16, '#59606E', '#2A2E39'),
    { lw: 3 },
  );
  drawOutlined(c, circle(c, 0, 0, 5.5), C.steel2, { lw: 2.5 });
  c.restore();
  // counterweight on the short end
  drawOutlined(c, () => rr(c, 34, 44, 18, 20, 5), vgrad(c, 44, 64, '#8A96A0', '#4D5963'), { lw: 3 });
  c.strokeStyle = 'rgba(255,255,255,0.6)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(14, 82);
  c.lineTo(40, 80);
  c.stroke();
  c.restore();
}

// Return window for dirty plates: a grey bus tub with a slot and a "SUCIOS" tag.
export function dirtyReturn(c: Ctx, x0: number, y0: number) {
  c.save();
  c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)';
  c.beginPath();
  c.ellipse(60, 104, 46, 8, 0, 0, Math.PI * 2);
  c.fill();
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(16, 44);
      c.lineTo(104, 44);
      c.lineTo(96, 104);
      c.lineTo(24, 104);
      c.closePath();
    },
    vgrad(c, 44, 104, '#8FA0AB', '#667782'),
    { lw: 3 },
  );
  drawOutlined(c, () => rr(c, 10, 34, 100, 16, 7), vgrad(c, 34, 50, '#C9D4DA', '#93A3AD'), { lw: 3 });
  c.fillStyle = '#2B1B17';
  c.beginPath();
  c.roundRect(24, 38, 72, 7, 3.5);
  c.fill(); // slot
  drawOutlined(c, () => rr(c, 34, 66, 52, 22, 6), C.cream, { lw: 2.5 });
  c.fillStyle = C.tomato2;
  c.font = '800 15px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('SUCIOS', 60, 78);
  c.strokeStyle = 'rgba(255,255,255,0.4)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(22, 56);
  c.lineTo(28, 96);
  c.stroke();
  c.restore();
}

// Sink: steel counter with a recessed basin of soapy water and a tap.
export function sinkStation(c: Ctx, x0: number, y0: number) {
  c.save();
  c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)';
  c.beginPath();
  c.ellipse(60, 108, 52, 8, 0, 0, Math.PI * 2);
  c.fill();
  drawOutlined(c, () => rr(c, 6, 34, 108, 74, 12), vgrad(c, 34, 108, '#DCE5EA', '#9BAAB4'), { lw: 3 });
  drawOutlined(c, () => rr(c, 16, 52, 88, 46, 10), vgrad(c, 52, 98, '#7FD0F2', '#2F86C2'), { lw: 3 });
  c.fillStyle = 'rgba(255,255,255,0.5)';
  for (const [x, y, r] of [
    [34, 66, 5],
    [44, 76, 3.2],
    [72, 70, 6],
    [84, 82, 3.6],
    [60, 86, 2.6],
  ] as const) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.5;
    c.stroke();
  }
  // tap
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(60, 44);
      c.lineTo(60, 20);
      c.quadraticCurveTo(60, 8, 74, 8);
      c.lineTo(86, 8);
      c.lineTo(86, 20);
      c.lineTo(74, 20);
      c.lineTo(72, 44);
      c.closePath();
    },
    vgrad(c, 8, 44, '#F2F6F8', C.steel2),
    { lw: 2.5 },
  );
  drawOutlined(c, circle(c, 40, 40, 6), C.tomato, { lw: 2 });
  drawOutlined(c, circle(c, 80, 40, 6), '#2F7DE1', { lw: 2 });
  c.restore();
}

export function windowStation(c: Ctx, x0: number, y0: number) {
  c.save();
  c.translate(x0, y0);
  // cream service pad on the counter
  drawOutlined(c, () => rr(c, 14, 44, 92, 52, 12), vgrad(c, 44, 96, '#FFF8EA', '#F1DFC0'), { lw: 2.5 });
  c.strokeStyle = 'rgba(230,59,46,0.5)';
  c.lineWidth = 2.5;
  c.setLineDash([8, 6]);
  rr(c, 20, 50, 80, 40, 8);
  c.stroke();
  c.setLineDash([]);
  // awning
  c.save();
  const n = 6,
    sw = 120 / n;
  const awning = () => {
    c.beginPath();
    c.moveTo(-2, -4);
    c.lineTo(122, -4);
    c.lineTo(122, 30);
    for (let i = n - 1; i >= 0; i--) {
      c.arc(i * sw + sw / 2, 30, sw / 2, 0, Math.PI, false);
    }
    c.closePath();
  };
  c.fillStyle = C.cream;
  awning();
  c.fill();
  c.save();
  awning();
  c.clip();
  for (let i = 0; i < n; i += 2) {
    c.fillStyle = C.tomato;
    c.fillRect(i * sw, -6, sw, 60);
  }
  c.fillStyle = vgrad(c, -4, 40, 'rgba(255,255,255,0.28)', 'rgba(0,0,0,0.12)');
  c.fillRect(0, -6, 120, 60);
  c.restore();
  awning();
  c.lineWidth = 3;
  c.strokeStyle = C.ink;
  c.stroke();
  c.restore();
  c.restore();
}
