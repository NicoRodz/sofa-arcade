// The static body of the two stations of tanda 2: the sauce pot on its burner, and the pass-through hatch (a counter with a frame and a sliding shutter).
import { C, drawOutlined, rr, vgrad, type Ctx } from '@pichi/screen-kit/art';

/** The sauce pot: a steel pot with two handles on a little stove, red rim. */
export function saucePot(c: Ctx, x0: number, y0: number) {
  c.save();
  c.translate(x0, y0);
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath();
  c.ellipse(60, 112, 50, 7, 0, 0, Math.PI * 2);
  c.fill();
  // the stove
  drawOutlined(c, () => rr(c, 12, 70, 96, 42, 8), vgrad(c, 70, 112, '#8A8F99', '#5C616B'), { lw: 3 });
  c.fillStyle = C.fire2;
  for (const x of [34, 60, 86]) {
    c.beginPath();
    c.ellipse(x, 104, 6, 3.5, 0, 0, Math.PI * 2);
    c.fill();
  }
  // the handles, then the body of the pot
  c.strokeStyle = C.ink;
  c.lineWidth = 6;
  c.lineCap = 'round';
  for (const [a, b] of [
    [14, 56],
    [106, 56],
  ] as const) {
    c.beginPath();
    c.moveTo(a < 60 ? 24 : 96, 56);
    c.lineTo(b, 56);
    c.stroke();
  }
  drawOutlined(c, () => rr(c, 24, 28, 72, 50, 12), vgrad(c, 28, 78, '#C9CDD6', '#8C919B'), { lw: 3.5 });
  // the rim with the red sauce inside
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.ellipse(60, 32, 36, 11, 0, 0, Math.PI * 2);
    },
    vgrad(c, 21, 43, '#B8292A', '#E2321F'),
    { lw: 3 },
  );
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.beginPath();
  c.ellipse(46, 29, 10, 3, -0.2, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** The pass-through hatch: it sits on a bench, so only the frame, the open window and the sill are drawn. */
export function passHatch(c: Ctx, x0: number, y0: number) {
  c.save();
  c.translate(x0, y0);
  drawOutlined(c, () => rr(c, 8, 10, 104, 88, 6), '#3B2A22', { lw: 4 }); // the frame
  c.fillStyle = vgrad(c, 22, 86, '#22160F', '#3E2A1D');
  rr(c, 18, 22, 84, 62, 3);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.12)'; // light coming through
  c.fillRect(22, 26, 76, 6);
  drawOutlined(c, () => rr(c, 6, 84, 108, 16, 4), vgrad(c, 84, 100, '#E6B980', '#B07A43'), { lw: 3 }); // the sill the plates slide on
  c.strokeStyle = C.ink; // the shutter rail
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(18, 18);
  c.lineTo(102, 18);
  c.stroke();
  c.restore();
}
