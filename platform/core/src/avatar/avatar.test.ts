import { describe, expect, it } from 'vitest';
import { Canvas2DPainter, PhaserGraphicsPainter, parseColor, type GraphicsLike } from './index';
import { ANCHORS, armPose, eyeLook, facing, gait, itemAnchor } from './rig-math';
import { RecordingPainter } from './recording-painter';

describe('RecordingPainter', () => {
  it('logs calls in order with stable rounded coordinates', () => {
    const p = new RecordingPainter();
    p.fillStyle = '#fff';
    p.beginPath();
    p.moveTo(1 / 3, 2);
    p.arc(0, 0, 5, 0, Math.PI * 2);
    p.fill();
    expect(p.log).toEqual(['fillStyle=#fff', 'beginPath()', 'moveTo(0.333,2)', 'arc(0,0,5,0,6.283)', 'fill()']);
  });
});

describe('Canvas2DPainter', () => {
  it('forwards calls and style writes to the context untouched', () => {
    const log: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k: string) => t[k] ?? ((...a: unknown[]) => log.push(`${k}(${a.join(',')})`)),
      set: (t, k: string, v) => {
        t[k] = v;
        log.push(`${k}=${v}`);
        return true;
      },
    });
    const p = new Canvas2DPainter(ctx as never);
    p.lineWidth = 3;
    p.translate(2, 4);
    p.ellipse(0, 0, 1, 2, 0, 0, 6);
    expect(log).toEqual(['lineWidth=3', 'translate(2,4)', 'ellipse(0,0,1,2,0,0,6,)']);
    expect(p.lineWidth).toBe(3);
  });
});

describe('PhaserGraphicsPainter', () => {
  const fake = () => {
    const log: string[] = [];
    const g: GraphicsLike = {
      fillStyle: (c, a) => log.push(`fillStyle(${c.toString(16)},${a})`),
      lineStyle: (w, c, a) => log.push(`lineStyle(${w},${c.toString(16)},${a})`),
      beginPath: () => log.push('begin'),
      moveTo: (x, y) => log.push(`M${x},${y}`),
      lineTo: (x, y) => log.push(`L${x},${y}`),
      closePath: () => log.push('close'),
      fillPath: () => log.push('fill'),
      strokePath: () => log.push('stroke'),
    };
    return { log, p: new PhaserGraphicsPainter(g) };
  };
  it('applies the transform stack and fills a rect', () => {
    const { log, p } = fake();
    p.save();
    p.translate(10, 20);
    p.scale(2, 2);
    p.fillStyle = '#ff0000';
    p.beginPath();
    p.rect(1, 1, 2, 3);
    p.fill();
    p.restore();
    expect(log).toEqual(['fillStyle(ff0000,1)', 'begin', 'M12,22', 'L16,22', 'L16,28', 'L12,28', 'close', 'fill']);
  });
  it('strokes with the scaled width, flattens curves and uses the middle gradient stop', () => {
    const { log, p } = fake();
    p.scale(2, 2);
    const g = p.createLinearGradient();
    g.addColorStop(0, '#000000');
    g.addColorStop(0.5, '#00ff00');
    g.addColorStop(1, '#ffffff');
    p.strokeStyle = g;
    p.lineWidth = 3;
    p.beginPath();
    p.moveTo(0, 0);
    p.quadraticCurveTo(1, 1, 2, 0);
    p.stroke();
    expect(log[0]).toBe('lineStyle(6,ff00,1)');
    expect(log.filter((l) => l.startsWith('L'))).toHaveLength(10);
    expect(log.at(-2)).toBe('L4,0');
  });
  it('is deterministic for the same calls', () => {
    const run = () => {
      const { log, p } = fake();
      p.beginPath();
      p.ellipse(0, 0, 10, 5, 0.3, 0, Math.PI * 2);
      p.arcTo(20, 0, 20, 10, 4);
      p.fill();
      return log.join('|');
    };
    expect(run()).toBe(run());
  });
  it('parses css colours', () => {
    expect(parseColor('#fff')).toEqual({ rgb: 0xffffff, a: 1 });
    expect(parseColor('rgba(255,154,162,0.5)')).toEqual({ rgb: 0xff9aa2, a: 0.5 });
    expect(parseColor('rgb(1,2,3)')).toEqual({ rgb: 0x010203, a: 1 });
  });
});

describe('rig-math', () => {
  it('picks the view from the aim vector and keeps the flip near zero', () => {
    expect(facing(0, -1, 1)).toEqual({ face: 'up', flip: 1 });
    expect(facing(0, 1, -1)).toEqual({ face: 'down', flip: -1 });
    expect(facing(-1, 0, 1)).toEqual({ face: 'side', flip: -1 });
    expect(facing(0.01, 0, -1)).toEqual({ face: 'side', flip: -1 });
  });
  it('gait: still, walking and skating', () => {
    expect(gait(0, false, false, 1)).toEqual({ bounce: 0, lean: 0, footL: -3, footR: -3 });
    const w = gait(Math.PI / 2, true, false, 1);
    expect(w.bounce).toBeCloseTo(4);
    expect(w.footL).toBeCloseTo(-3 + Math.sin(Math.PI / 4) * 3);
    expect(gait(1, true, true, -1)).toMatchObject({ bounce: 0, lean: -0.14 });
  });
  it('arm poses', () => {
    const base = { action: 'none', hitT: 0, carrying: false, face: 'down', moving: false, skating: false, phase: 0 } as const;
    expect(armPose(base)).toEqual({ a: 0.14, b: -0.14, lenA: 1, lenB: 1 });
    expect(armPose({ ...base, carrying: true })).toEqual({ a: -1.2, b: 1.2, lenA: 0.62, lenB: 0.62 });
    expect(armPose({ ...base, carrying: true, face: 'side' })).toEqual({ a: -1.05, b: -1.3, lenA: 0.7, lenB: 0.55 });
    expect(armPose({ ...base, action: 'chop', hitT: 120 }).b).toBeCloseTo(-0.4);
    expect(armPose({ ...base, action: 'chop', hitT: 0, carrying: true })).toEqual({ a: -1.1, b: -2.3, lenA: 0.7, lenB: 1 });
    expect(armPose({ ...base, action: 'stretch', hitT: 180 }).a).toBeCloseTo(-1.2);
    expect(armPose({ ...base, skating: true, moving: true, phase: Math.PI }).a).toBeCloseTo(0.84);
  });
  it('look and item anchors', () => {
    expect(eyeLook('side', 1, 0, -1)).toEqual({ look: 4, lookY: 0 });
    expect(eyeLook('down', 0.5, 0.5, 1).lookY).toBe(1.5);
    expect(eyeLook('up', 1, 0, 1)).toEqual({ look: 0, lookY: 0 });
    expect(itemAnchor('up')).toEqual({ x: 20, y: -46 });
    expect(itemAnchor('down')).toEqual({ x: 0, y: -43 });
    expect(ANCHORS.mouthY).toBe(-53);
  });
});
