import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { versusMap } from '@pichi/game-pizzas/sim/versus/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

export async function runAssist({ cdp, bots, timers, open, join, click, snap, waitFor }: Ctx) {
  // Ayudante on the REAL screen and relay: 4 bot phones, two of them switch it on from their lobby. The lobby lists them (badge + "Ayudante"), versus shows the k it
  // costs, the round gives them the propeller, the sim flags exactly those chefs, and every phone hears its contextual buttons (labels + glyphs) through the relay.
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const rows = fixedMap('6')!.rows;
  await open('ASST');
  await join('ASST', 4, rows);
  for (const i of [0, 2]) bots[i]!.ws.send(JSON.stringify({ t: 'assist', on: true }));
  await sleep(700);
  await cdp.shot('assist-lobby');
  bots[2]!.ws.send(JSON.stringify({ t: 'assist', on: false }));
  await sleep(400); // one Ayudante only: its team is the one that gets the k
  await click('[data-mode="versus"]');
  await sleep(900);
  await cdp.shot('assist-lobby-versus');
  console.log(
    'versus team headers:',
    JSON.stringify(await cdp.eval(`[0, 1].map((i) => document.getElementById('th' + i).textContent)`)),
    '| hint:',
    JSON.stringify(await cdp.eval(`document.getElementById('teamhint').textContent`)),
  );
  bots[2]!.ws.send(JSON.stringify({ t: 'assist', on: true }));
  await sleep(400);
  await click('[data-mode="coop"]');
  await sleep(500);
  await click('[data-map="6"]');
  await click('[data-diff="easy"]');
  await sleep(300);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1000, 20_000);
  bots.forEach((b) => b.startSending());
  timers.push(
    setInterval(async () => {
      try {
        const s = await snap();
        bots.forEach((b) => b.decide(s));
      } catch {
        /* page navigating */
      }
    }, 100),
  );
  await waitFor((s) => s.time > 12_000, 40_000);
  const sn: any = await snap();
  console.log(
    'chefs on Ayudante in the sim:',
    JSON.stringify(sn.players.map((p: any) => [p.id, !!p.assist])),
    '| bot ids',
    JSON.stringify(bots.map((b) => b.id)),
  );
  await cdp.shot('assist-play');
  for (const p of sn.players.filter((q: any) => q.assist).slice(0, 2)) {
    const cx = 96 + p.x * 108,
      cy = 106 + p.y * 108;
    await cdp.shot(`assist-chef-${p.id}`, { x: cx - 150, y: cy - 230, width: 300, height: 300, scale: 2 });
  }
  for (const b of bots) {
    const labels = [...new Set(b.hints.map((h: any) => `${h.a ?? '-'}|${h.b ?? '-'}`))];
    console.log(
      `phone ${b.id}: ${b.hints.length} hint messages, ${labels.length} different; icons seen: ${[...new Set(b.hints.flatMap((h: any) => [h.aIcon, h.bIcon]).filter(Boolean))].join(',')}; some greyed: ${b.hints.some((h: any) => h.aOff || h.bOff)}; sample: ${labels.slice(0, 6).join(' ; ')}`,
    );
  }
  timers.splice(0).forEach(clearInterval);
  bots.splice(0).forEach((b) => b.close());
}

export async function runSabotage({ cdp, bots, open, join, click, snap, waitFor }: Ctx) {
  // Sabotage: a round on V1 (Suave, Normal) with 6 chefs; the sim is driven by hand (window.__pg.sab) to frame the throw: the loaded catapult with its reticle,
  // the bag in the air with its shadow, the impact, a rival chef slipping on the rubbish, and the cleaning. The chefs of team 1 are moved and pushed by their bots.
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const rows = versusMap('V1')!.rows;
  await open('SABO');
  await join('SABO', 6, rows);
  await click('[data-mode="versus"]');
  await click('[data-map="V1"]');
  await click('[data-diff="normal"]');
  await sleep(500);
  await cdp.shot('sab-lobby');
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
  bots.forEach((b) => b.startSending());
  const pg = (expr: string) => cdp.eval<any>(`window.__pg.sab.${expr}`);
  const team1 = ((await snap()) as any).players.filter((p: any) => p.team === 1).map((p: any) => p.id as number);
  await pg('give(0, 1)');
  const aimer = await pg('aim(0)');
  await sleep(1100);
  await cdp.shot('sab-aim');
  await pg(`throw(${aimer})`);
  await sleep(330);
  await cdp.shot('sab-flight');
  await sleep(500);
  await cdp.shot('sab-impact');
  const st = await pg('state()');
  const trash = st.floor.find((f: any) => f.kind === 'trash');
  console.log('rubbish on the floor:', JSON.stringify(trash), '| bags/desechos team 0:', st.sab.teams[0].bags, st.sab.teams[0].desechos);
  // a chef of team 1 walks over it carrying a pizza
  const floorAt = (x: number, y: number) => rows[y]?.[x] === '.' || rows[y]?.[x] === 'S';
  const dir = floorAt(trash.tx - 2, trash.ty) ? 1 : -1;
  const walker = team1[0]!,
    helper = team1[1]!;
  await pg(`place(${walker}, ${trash.tx + 0.5 - dir * 1.8}, ${trash.ty + 0.5}, ${dir}, 0)`);
  await pg(`item(${walker}, 'dishQ')`);
  const bw = bots.find((b) => b.id === walker)!,
    bh = bots.find((b) => b.id === helper)!;
  bw.vec = { x: dir, y: 0 };
  await sleep(330);
  await cdp.shot('sab-slip');
  await sleep(260);
  await cdp.shot('sab-slip-spin');
  bw.vec = { x: 0, y: 0 };
  await sleep(900);
  await cdp.shot('sab-dropped');
  // the helper cleans: the dropped pizza first, then the rubbish
  const st2 = await pg('state()');
  const dropped = st2.floor.find((f: any) => f.kind === 'dropped');
  if (dropped) {
    await pg(`place(${helper}, ${dropped.tx + 0.5 - dir * 0.9}, ${dropped.ty + 0.5}, ${dir}, 0)`);
    await sleep(150);
    bh.a++;
    await sleep(350);
  }
  await cdp.shot('sab-clean');
  console.log('final state:', JSON.stringify((await pg('state()')).floor));
  bots.splice(0).forEach((b) => b.close());
}

export async function runBurn({ cdp, bots, open, join, click, snap, waitFor }: Ctx) {
  // The oven that burns: map 1 (open kitchen, ovens with counters beside them), Normal, 2 chefs. The sim is driven by hand (window.__pg.kit) to frame each stage:
  // a ready pizza with its grace ring, the warning, the burnt pizza smoking, the fire, the fire jumping, a chef putting it out with the extinguisher, and the results.
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const rows = fixedMap('1')!.rows;
  await open('BURN');
  await join('BURN', 2, rows);
  await click('[data-diff="normal"]');
  await click('[data-map="1"]');
  await sleep(400);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
  const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
  const cs = await kit('counters()');
  const ovens = cs.filter((c: any) => c.kind === 'pot');
  const [o1, o2] = [ovens[0].i, ovens[1].i];
  const ids = (await snap()).players.map((p) => p.id);
  await kit(`bake(${o1})`);
  await kit(`bake(${o2})`);
  await sleep(900);
  await cdp.shot('burn-1-ready');
  await kit(`age(${o1}, 5300)`);
  await kit(`age(${o2}, 3000)`);
  await sleep(400);
  await cdp.shot('burn-2-warn');
  await kit(`age(${o1}, 8200)`);
  await kit(`age(${o2}, 8200)`);
  await sleep(900);
  await cdp.shot('burn-3-burnt');
  await kit(`age(${o1}, 13100)`);
  await sleep(700);
  await cdp.shot('burn-4-fire');
  await sleep(3200);
  await cdp.shot('burn-5-spread');
  // chef 1 puts the oven out: stands in front of it and holds B (the bot sends the button; the sim does the rest)
  const b1 = bots.find((b) => b.id === ids[0])!;
  b1.startSending();
  await kit(`stand(${ids[0]}, ${o1})`);
  const st = (await snap()).stations[o1]!;
  const face = (await snap()).players.find((p) => p.id === ids[0])!;
  b1.vec = { x: st.tx + 0.5 - face.x, y: st.ty + 0.5 - face.y };
  b1.btn = 2;
  await sleep(1500);
  await cdp.shot('burn-6-extinguish');
  await sleep(1900);
  await cdp.shot('burn-7-out');
  b1.btn = 0;
  b1.vec = { x: 0, y: 0 };
  // results with the kudos line
  await cdp.eval('window.__pg.fastForward(800)');
  await waitFor((s) => (s as any).over === true, 8000);
  await sleep(3500);
  await cdp.shot('burn-8-results');
  bots.splice(0).forEach((b) => b.close());
}
