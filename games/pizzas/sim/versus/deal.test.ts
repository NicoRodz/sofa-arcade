// QA versus 31-oct M5: the chef who plays alone in 2 contra 1 got the suggestion "masa+horno" (two puestos on a phone that must do everything).
import { describe, expect, it } from 'vitest';
import { dealVersusPuestos } from './deal';

const f = { cheese: true, sink: true };
describe('puesto suggestions in versus', () => {
  it('2 contra 1: the pair gets a puesto each, the chef alone gets none', () => {
    const m = dealVersusPuestos([{ playerIds: [1, 2] }, { playerIds: [3] }], f);
    expect(m.assign.map((a) => a.id)).toEqual([1, 2]);
    expect(m.assign.find((a) => a.id === 3)).toBeUndefined();
    expect(m).toMatchObject({ cheese: true, sink: true });
  });
  it('2 contra 2 and 3 contra 2: every chef gets one, the same table in both kitchens', () => {
    const a = dealVersusPuestos([{ playerIds: [1, 2] }, { playerIds: [3, 4] }], f).assign;
    expect(a.map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(a[0]!.puestos).toEqual(a[2]!.puestos);
    expect(dealVersusPuestos([{ playerIds: [1, 2, 3] }, { playerIds: [4, 5] }], f).assign).toHaveLength(5);
  });
});
