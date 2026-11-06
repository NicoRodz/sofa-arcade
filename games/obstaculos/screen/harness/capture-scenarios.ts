// Capture scenarios of the Obstaculos renderer on the harness sessions (`window.obst.start`): each saves PNGs through `cdp.shot` and logs what the camera did.
import { sleep, start, stateOf, type Ctx } from './capture-cdp';

export async function shotsL12({ cdp }: Ctx) {
  await cdp.eval(start({ level: 1, n: 2, mode: 'chain', bots: true }));
  await sleep(400);
  await cdp.eval('window.obst.ff(1.5)');
  await cdp.shot('l1-2p-start');
  await cdp.eval('window.obst.ff(6)');
  await sleep(200);
  await cdp.shot('l1-2p-run');
  console.log(JSON.stringify(await cdp.eval(stateOf)));
}

export async function shotsL18({ cdp }: Ctx) {
  await cdp.eval(start({ level: 1, n: 8, mode: 'chain', bots: true }));
  await sleep(400);
  await cdp.eval('window.obst.ff(2.5)');
  await sleep(200);
  await cdp.shot('l1-8p-start');
  await cdp.eval('window.obst.ff(7)');
  await sleep(200);
  await cdp.shot('l1-8p-run');
  console.log(JSON.stringify(await cdp.eval(stateOf)));
  await cdp.eval('window.obst.ff(10)');
  await sleep(200);
  await cdp.shot('l1-8p-wall');
  console.log(JSON.stringify(await cdp.eval(stateOf)));
}

export async function shotsStraggler({ cdp }: Ctx) {
  await cdp.eval(start({ level: 1, n: 4, mode: 'free', bots: true, idle: [3], long: true }));
  await sleep(400);
  // the idle player stays at the start; the three others run ahead and the picture follows them
  let got = false;
  for (let i = 0; i < 400 && !got; i++) {
    await cdp.eval('window.obst.ff(0.1)');
    got = await cdp.eval<boolean>('window.obst.scene.view.camera.result.offscreen.length > 0');
  }
  await sleep(150);
  await cdp.shot('straggler-arrow');
  console.log(JSON.stringify(await cdp.eval(stateOf)));
  await cdp.eval('window.obst.ff(1.2)');
  await sleep(120);
  await cdp.shot('straggler-arrow-urgent');
  let fly = false;
  for (let i = 0; i < 100 && !fly; i++) {
    await cdp.eval('window.obst.ff(0.1)');
    fly = await cdp.eval<boolean>('window.obst.world().players[3].bubble !== null');
  }
  for (let i = 0; i < 200; i++) {
    await cdp.eval('window.obst.ff(0.1)');
    if (
      await cdp.eval<boolean>(
        '(() => { const w = window.obst.world(), r = window.obst.scene.view.camera.result.rect, p = w.players[3]; return p.bubble && p.x > r.x + 150 && p.x < r.x + r.w - 150; })()',
      )
    )
      break;
  }
  await sleep(120);
  await cdp.shot('straggler-bubble');
  console.log(JSON.stringify(await cdp.eval(stateOf)));
}

export async function shotsRig({ cdp }: Ctx) {
  await cdp.eval(start({ level: 1, n: 8, mode: 'chain', bots: true, idle: [0, 1, 2, 3, 4, 5, 6, 7] }));
  await sleep(400);
  await cdp.eval('window.obst.ff(1.2)');
  await sleep(300);
  const c = await cdp.eval<{ x: number; y: number }>(
    '(() => { const r = window.obst.scene.view.camera.result; const f = window.obst.scene.view.feet.get(3); return { x: (f.x - r.rect.x) * r.state.zoom, y: (f.y - r.rect.y) * r.state.zoom }; })()',
  );
  await cdp.shot('rig-idle8', { x: c.x - 160, y: c.y - 110, width: 320, height: 150, scale: 4 });
  await cdp.eval(start({ level: 1, n: 3, mode: 'chain', bots: true }));
  await sleep(300);
  await cdp.eval('window.obst.ff(2.0)');
  await sleep(100);
  const d = await cdp.eval<{ x: number; y: number }>(
    '(() => { const r = window.obst.scene.view.camera.result; const f = window.obst.scene.view.feet.get(1); return { x: (f.x - r.rect.x) * r.state.zoom, y: (f.y - r.rect.y) * r.state.zoom }; })()',
  );
  await cdp.shot('rig-run3', { x: d.x - 160, y: d.y - 110, width: 320, height: 150, scale: 4 });
}

export async function shotsSpread8({ cdp }: Ctx) {
  await cdp.eval(start({ level: 1, n: 8, mode: 'free', bots: true, idle: [0, 1, 2, 3, 4, 5, 6, 7] }));
  await sleep(300);
  const spots = [
    [3, 11],
    [10, 11],
    [17, 11],
    [22, 11],
    [36, 8],
    [40, 8],
    [46, 11],
    [54, 7],
  ];
  await cdp.eval(`(() => { const w = window.obst.world(); ${JSON.stringify(spots)}.forEach(([c, r], i) => w.teleport(i, c, r)); })()`);
  await cdp.eval('window.obst.ff(4)');
  await sleep(250);
  await cdp.shot('l1-8p-spread');
  console.log(JSON.stringify(await cdp.eval(stateOf)));
  // one of them goes far away: only the others are framed
  await cdp.eval(start({ level: 1, n: 8, mode: 'free', bots: true, idle: [0, 1, 2, 3, 4, 5, 6, 7], long: true }));
  await sleep(300);
  const far = [
    [3, 11],
    [6, 11],
    [9, 11],
    [12, 11],
    [60, 11],
    [62, 11],
    [64, 11],
    [66, 11],
  ];
  await cdp.eval(`(() => { const w = window.obst.world(); ${JSON.stringify(far)}.forEach(([c, r], i) => w.teleport(i, c, r)); })()`);
  await cdp.eval('window.obst.ff(3)');
  await sleep(250);
  await cdp.shot('l1-8p-two-groups');
  console.log(JSON.stringify(await cdp.eval(stateOf)));
}

export async function shotsPoses({ cdp }: Ctx) {
  await cdp.eval(start({ level: 1, n: 8, mode: 'free', bots: true, idle: [0, 1, 2, 3, 4, 5, 6, 7] }));
  await sleep(300);
  await cdp.eval(`(() => { const w = window.obst.world(); [[4, 11], [6, 11], [6, 11], [8, 11], [10, 11], [12, 11], [14, 11], [16, 11]].forEach(([c, r], i) => w.teleport(i, c, r));
    w.forced[0] = { planted: true }; w.forced[1] = { holding: 'player' }; w.forced[2] = { carriedBy: 1 }; w.forced[3] = { thrown: true, vx: 300 }; w.forced[4] = { hanging: true, grounded: false };
    w.forced[5] = { anchored: true, grounded: false }; w.forced[6] = { inGoal: true }; w.forced[7] = { holding: 'box', hint: 'throw' }; })()`);
  await cdp.eval('window.obst.ff(0.5)');
  await sleep(200);
  const c = await cdp.eval<{ x: number; y: number }>(
    '(() => { const r = window.obst.scene.view.camera.result; const f = window.obst.scene.view.feet.get(3); return { x: (f.x - r.rect.x) * r.state.zoom, y: (f.y - r.rect.y) * r.state.zoom }; })()',
  );
  await cdp.shot('poses', { x: c.x - 240, y: c.y - 130, width: 480, height: 170, scale: 3 });
  await cdp.eval(start({ level: 1, n: 3, mode: 'free', bots: true, idle: [0, 1, 2] }));
  await sleep(300);
  await cdp.eval('window.obst.world().teleport(0, 32, 11)');
  let dead = false;
  for (let i = 0; i < 120 && !dead; i++) {
    await cdp.eval('window.obst.ff(1/60)');
    dead = await cdp.eval<boolean>('window.obst.world().players[0].dead');
  }
  await sleep(60);
  await cdp.shot('death-burst');
}

export async function shotsBiomes({ cdp }: Ctx) {
  for (const b of ['beach', 'forest', 'mine', 'glacier', 'volcano']) {
    await cdp.eval(start({ level: 1, n: 3, mode: 'chain', bots: true, biome: b }));
    await sleep(300);
    await cdp.eval('window.obst.ff(9)');
    await sleep(200);
    await cdp.shot(`biome-${b}`);
  }
}

export async function shotsEnts({ cdp }: Ctx) {
  for (const [lv, name] of [
    [4, 'l4'],
    [8, 'l8'],
  ] as const) {
    await cdp.eval(start({ level: lv, n: 4, mode: lv === 8 ? 'free' : 'chain', bots: false }));
    await sleep(300);
    await cdp.eval('window.obst.ff(0.5)');
    await sleep(200);
    await cdp.shot(`ents-${name}`);
  }
}

export async function measureFps({ cdp }: Ctx) {
  for (const [n, long, label] of [
    [2, false, '2p'],
    [8, false, '8p'],
    [8, true, '8p long level, camera zooming'],
  ] as const) {
    await cdp.eval(start({ level: 1, n, mode: long ? 'free' : 'chain', bots: true, long, idle: long ? [6, 7] : [] }));
    await sleep(800);
    await cdp.eval('window.obst.resetStats()');
    await sleep(8000);
    const r = await cdp.eval<{ frames: number; cpuMs: number; updMs: number; dts: number[] }>(
      '({ ...window.obst.stats(), dts: window.obst.frameDts() })',
    );
    const dts = r.dts.slice(5).sort((a, b) => a - b);
    const avg = dts.reduce((s, v) => s + v, 0) / dts.length;
    console.log(
      `fps ${label}: frames=${r.frames} avgFrame=${avg.toFixed(2)}ms (${(1000 / avg).toFixed(1)} fps) p95=${dts[Math.floor(dts.length * 0.95)]!.toFixed(1)}ms max=${dts[dts.length - 1]!.toFixed(1)}ms update(world+view)=${(r.updMs / r.frames).toFixed(2)}ms render-submit=${(r.cpuMs / r.frames).toFixed(2)}ms`,
    );
    console.log(JSON.stringify(await cdp.eval(stateOf)));
  }
}
