import { readFileSync } from 'node:fs';
import { percentile } from '@pichi/core';

// CSV: kind,player,t_ms,value_ms  (kind = rtt | lag)
const file = process.argv[2];
if (!file) {
  console.error('usage: npm run report -- <file.csv>');
  process.exit(1);
}
const groups = new Map<string, number[]>();
for (const line of readFileSync(file, 'utf8').split('\n').slice(1)) {
  const [kind, player, , value] = line.split(',');
  const v = Number(value);
  if (!kind || !player || !Number.isFinite(v)) continue;
  const k = `${kind}\t${player}`;
  (groups.get(k) ?? groups.set(k, []).get(k)!).push(v);
}
const f = (n: number) => n.toFixed(1);
console.log('kind\tplayer\tn\tp50\tp95\tp99\tmax');
for (const [k, vals] of [...groups].sort()) {
  const p = (q: number) => f(percentile(vals, q));
  console.log(`${k}\t${vals.length}\t${p(50)}\t${p(95)}\t${p(99)}\t${f(Math.max(...vals))}`);
}
