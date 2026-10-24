// Re-records the coop golden fixtures (shared/golden/*.json). Only run it on purpose: the fixtures are the safety net for the
// teams refactor of the sim, so a change in them means the coop behaviour changed.
//   npx tsx tools/record-golden.ts
import { writeFileSync } from 'node:fs';
import { SCENARIOS, runGolden } from '../shared/golden/bot';

for (const sc of SCENARIOS) {
  const run = runGolden(sc);
  const file = new URL(`../shared/golden/${sc.name}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(run, null, 1) + '\n');
  console.log(sc.name, 'score', run.score, 'delivered', run.delivered, 'events', run.events.length);
}
