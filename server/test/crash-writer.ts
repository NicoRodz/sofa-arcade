// A child process for expeditions.test.ts: writes to an expedition and kills ITSELF (SIGKILL: no handlers, no finally, no flush) right before the named step.
// usage: node --import tsx crash-writer.ts <dir> <id> <step|none> <levels>
import { ExpeditionStore, type StepName } from '../src/expeditions';
import { LEGACY_CATALOG, applyResult } from '@party/shared/obstaculos/campaign';

const [dir, id, step, levels] = process.argv.slice(2) as [string, string, StepName | 'none', string];
const store = new ExpeditionStore({ dir, onStep: (s) => { if (s === step) process.kill(process.pid, 'SIGKILL'); } });
const cur = store.get(id)!;
const next = applyResult(cur, LEGACY_CATALOG, { levelId: levels, cleared: true, timeMs: 1000, collectiblesMask: 0, deaths: 0 }, cur.updatedAt + 1);
store.merge(id, next);
console.log('survived');
