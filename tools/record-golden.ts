// Re-records the coop golden fixtures (shared/golden/*.json). Only run it on purpose: the fixtures are the safety net for the
// teams refactor of the sim, so a change in them means the coop behaviour changed.
//   npx tsx tools/record-golden.ts
import { writeFileSync } from 'node:fs';
import { MAGNET_SCENARIOS, RULES_SCENARIOS, SCENARIOS, runGolden } from '@pichi/game-pizzas/test/golden/bot';
import { RECIPE_SCENARIOS, runRecipeGolden } from '@pichi/game-pizzas/test/golden/recipe-bot';

for (const sc of [...SCENARIOS, ...RULES_SCENARIOS, ...MAGNET_SCENARIOS]) {
  const run = runGolden(sc);
  const file = new URL(`../games/pizzas/test/golden/fixtures/${sc.name}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(run, null, 1) + '\n');
  console.log(sc.name, 'score', run.score, 'delivered', run.delivered, 'events', run.events.length);
}

// the rounds with a Carta del día (recipes switched on), cooked by the recipe bot
for (const sc of RECIPE_SCENARIOS) {
  const run = runRecipeGolden(sc);
  const file = new URL(`../games/pizzas/test/golden/fixtures/${sc.name}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(run, null, 1) + '\n');
  console.log(sc.name, 'score', run.score, 'delivered', run.delivered, 'events', run.events.length);
}
