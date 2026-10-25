// Screenshots of every phone state x viewport x safe-area inset, plus a contact sheet per state.
// usage: npx tsx controller/test/capture.ts [outDir] [scenarioFilter] [landscape|portrait|both]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ORIENTATIONS, SCENARIOS, insetsName, openSession } from './harness';

const out = path.resolve(process.argv[2] ?? 'docs/phone-layout');
const only = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : undefined;
const orient = process.argv[4] ?? 'both';
mkdirSync(out, { recursive: true });
const dog = setTimeout(() => {
  console.error('watchdog fired');
  process.exit(2);
}, 280_000);
const s = await openSession();
try {
  for (const sc of SCENARIOS) {
    if (only && !sc.name.includes(only)) continue;
    await s.load(sc);
    for (const v of Object.entries(ORIENTATIONS)
      .filter(([o]) => orient === 'both' || o === orient)
      .flatMap(([, x]) => x))
      for (const ins of v.insets) {
        await s.setViewport(v, ins);
        await s.shot(path.join(out, `${sc.name}__${v.name}__${insetsName(ins)}.png`));
      }
  }
  // one contact sheet per scenario (PNG at CSS-pixel size, 2 columns) to review a whole matrix at once
  const names = [
    ...new Set(
      readdirSync(out)
        .filter((f) => f.includes('__'))
        .map((f) => f.split('__')[0]!),
    ),
  ];
  for (const n of names) {
    const files = readdirSync(out).filter((f) => f.startsWith(`${n}__`) && f.endsWith('.png'));
    const html = `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(2,max-content);gap:10px;padding:10px;font:12px monospace;color:#fff">${files.map((f) => `<figure style="margin:0"><img src="${f}" style="width:calc(var(--w) * 1px)" onload="this.style.setProperty('--w', this.naturalWidth / 2)">${f.replace('.png', '')}</figure>`).join('')}</body>`;
    writeFileSync(path.join(out, `sheet-${n}.html`), html);
    const rows = Math.ceil(files.length / 2);
    execFileSync(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        `--screenshot=${path.join(out, `sheet-${n}.png`)}`,
        `--window-size=2100,${rows * 470 + 40}`,
        '--virtual-time-budget=3000',
        `file://${path.join(out, `sheet-${n}.html`)}`,
      ],
      { stdio: 'ignore', timeout: 30_000 },
    );
  }
  if (s.pageErrors().length) console.error('PAGE ERRORS', s.pageErrors());
  console.log('captures in', out);
} finally {
  clearTimeout(dog);
  await s.close();
}
