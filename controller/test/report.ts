// Prints the layout violations grouped by state (same checks as layout.test.ts). usage: npx tsx controller/test/report.ts [scenarioFilter] [landscape|portrait|both]
import { violations } from './checks';
import { ORIENTATIONS, SCENARIOS, insetsName, openSession } from './harness';

const only = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : undefined;
const orient = process.argv[3] ?? 'both';
const dog = setTimeout(() => { console.error('watchdog fired'); process.exit(2); }, 280_000);
const s = await openSession();
try {
  const groups = new Map<string, Set<string>>();
  for (const sc of SCENARIOS) {
    if ((only && !sc.name.includes(only))) continue;
    await s.load(sc);
    for (const v of Object.entries(ORIENTATIONS).filter(([o]) => orient === 'both' || o === orient).flatMap(([, x]) => x)) for (const ins of v.insets) {
      await s.setViewport(v, ins);
      for (const msg of violations(await s.probe())) {
        const k = `${sc.name} | ${msg.replace(/\[[^\]]*\]/g, '[]').replace(/-?\d+(\.\d+)?px/g, 'Npx').replace(/\d+x\d+ \(/, 'WxH (')}`;
        (groups.get(k) ?? groups.set(k, new Set()).get(k)!).add(`${v.name}${insetsName(ins) === 'noinset' ? '' : '+i'}`);
      }
    }
  }
  for (const [k, vs] of groups) console.log(`${k}\n      @ ${[...vs].join(' ')}`);
  console.log(`${groups.size} distinct violations`);
} finally { clearTimeout(dog); await s.close(); }
