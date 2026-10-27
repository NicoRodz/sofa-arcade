// Static validator of 'raft' (design section 3, "Balsa ="). Implemented by T1c. A raft is one '=' in a straight lane of ~; it ferries between two shores, so both ends of the lane must touch
// land, one lane holds one raft, and the kitchen must be playable with every = turned into ~ (the raft is a shortcut).
import type { MechValidator } from '../../mech/types';
import { at, find, playableWithout } from '../../mech/grid';

const wet = (c: string | undefined) => c === '~' || c === '=';
const land = (c: string | undefined) => c !== undefined && c !== '#' && c !== '~' && c !== '=';

export const raftValidate: MechValidator = (rows) => {
  const R = find(rows, '=');
  if (!R.length) return [];
  const out: string[] = [];
  for (const [x, y] of R) {
    const horizontal = wet(at(rows, x - 1, y)) || wet(at(rows, x + 1, y));
    if (!horizontal && !wet(at(rows, x, y - 1)) && !wet(at(rows, x, y + 1))) {
      out.push(`raft: = at (${x}, ${y}) has no water lane`);
      continue;
    }
    const [dx, dy] = horizontal ? [1, 0] : [0, 1];
    let a = 0,
      b = 0;
    while (wet(at(rows, x - dx * (a + 1), y - dy * (a + 1)))) a++;
    while (wet(at(rows, x + dx * (b + 1), y + dy * (b + 1)))) b++;
    if (!land(at(rows, x - dx * (a + 1), y - dy * (a + 1))) || !land(at(rows, x + dx * (b + 1), y + dy * (b + 1))))
      out.push(`raft: the lane of = at (${x}, ${y}) does not reach land at both ends`);
    for (let i = -a; i <= b; i++) if (i && at(rows, x + dx * i, y + dy * i) === '=') out.push(`raft: two = share the lane at (${x}, ${y})`);
  }
  return [...out, ...playableWithout(rows, '=', 'raft')];
};
