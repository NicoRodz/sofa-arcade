import { describe, expect, it } from 'vitest';
import { ClockSync, applyDeadzone, parseClientMessage } from './protocol';

describe('protocol', () => {
  it('rejects malformed messages and clamps input', () => {
    expect(parseClientMessage('nope')).toBeNull();
    expect(parseClientMessage('{"t":"input","seq":1}')).toBeNull();
    const m = parseClientMessage('{"t":"input","seq":1,"x":5,"y":-5,"btn":1,"presses":[70000],"ts":1}');
    expect(m).toMatchObject({ x: 1, y: -1, presses: [70000 % 65536] });
  });
  it('deadzone zeroes small vectors', () => {
    expect(applyDeadzone(0.1, 0.1)).toEqual([0, 0]);
    expect(applyDeadzone(1, 0)).toEqual([1, 0]);
  });
  it('clock sync picks the lowest-RTT sample', () => {
    const c = new ClockSync();
    c.add(100, 1000, 1550); // off = 500
    c.add(10, 2000, 2105); // off = 100
    expect(c.offset).toBe(100);
  });
});
