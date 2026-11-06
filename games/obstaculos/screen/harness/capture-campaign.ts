// Capture scenarios of the Obstaculos campaign on the real session (`window.obst.startSim`): A5 mechanics, A6 dynamics and the layer for 2.
import { sleep, type Ctx } from './capture-cdp';

export async function shotsA5({ cdp }: Ctx) {
  // campaign A5 on the real session: [scenario, seconds into the level to look at, name]
  const shots: [string, number, string][] = [
    ['balance', 5.2, 'a5-balance'],
    ['target', 5.8, 'a5-target-open'],
    ['enemies', 6.5, 'a5-enemies'],
    ['ice', 7, 'a5-ice'],
    ['wind', 5.6, 'a5-wind-gust'],
    ['pickaxe', 3.8, 'a5-pick-take'],
    ['pickaxe', 7.5, 'a5-pick-climb'],
    ['pickaxe', 10.5, 'a5-pick-top'],
    ['throw', 4.9, 'a5-throw-flight'],
  ];
  let cur = '',
    at = 0;
  for (const [id, t, name] of shots) {
    if (id !== cur || t < at) {
      await cdp.eval(`window.obst.startSim(${JSON.stringify(id)})`);
      await sleep(500);
      cur = id;
      at = 0;
    }
    await cdp.eval(`window.obst.ff(${t - at})`);
    at = t;
    await sleep(250);
    await cdp.shot(name);
    console.log(
      name,
      JSON.stringify(
        await cdp.eval(
          '(() => { const w = window.obst.sim().session.world; return { tick: w.tick, status: w.status, p0: [Math.round(w.players[0].body.x), Math.round(w.players[0].body.y)], p1: [Math.round(w.players[1].body.x), Math.round(w.players[1].body.y)] }; })()',
        ),
      ),
    );
  }
}

export async function shotsA6OrLayer({ cdp }: Ctx, set: 'a6' | 'layer') {
  const shots: [string, number, string, string?][] =
    set === 'a6'
      ? [
          ['lantern', 4.2, 'a6-lantern-take'],
          ['lantern', 6.2, 'a6-lantern-bridge'],
          ['lantern', 7.6, 'a6-lantern-cross'],
          ['bungee', 5.3, 'a6-bungee-stretch'],
          ['bungee', 6.6, 'a6-bungee-bounce'],
          ['sinkers', 5.4, 'a6-sinker'],
          ['geyser', 5.2, 'a6-geyser-warn'],
          ['geyser', 5.85, 'a6-geyser-gush'],
          ['geyser', 6.4, 'a6-geyser-air'],
        ]
      : [
          ['layer', 4, 'layer-rope'],
          [
            'layer',
            4.4,
            'layer-signal',
            `(() => { const r = window.obst.sim(); r.receive(0, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'arrowR', seq: 0 } }); r.receive(0, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'arrowR', seq: 1 } }); })()`,
          ],
          [
            'layer',
            4.9,
            'layer-signal-wait',
            `(() => { const r = window.obst.sim(); r.receive(1, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'wait', seq: 0 } }); r.receive(1, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'wait', seq: 1 } }); })()`,
          ],
          ['layer', 8.6, 'layer-death-bubble'],
          ['layer', 10.2, 'layer-hearts-after'],
        ];
  let cur = '',
    at = 0;
  for (const [id, t, name, pre] of shots) {
    if (id !== cur || t < at) {
      await cdp.eval(`window.obst.startSim(${JSON.stringify(id)})`);
      await sleep(500);
      cur = id;
      at = 0;
    }
    await cdp.eval(`window.obst.ff(${t - at})`);
    at = t;
    if (pre) {
      await cdp.eval(pre);
      await cdp.eval('window.obst.ff(0.15)');
      at += 0.15;
    }
    await sleep(250);
    await cdp.shot(name);
    console.log(
      name,
      JSON.stringify(
        await cdp.eval(
          '(() => { const w = window.obst.sim().session.world; return { tick: w.tick, status: w.status, lives: w.lives, p0: [Math.round(w.players[0].body.x), Math.round(w.players[0].body.y), w.players[0].mode], p1: [Math.round(w.players[1].body.x), Math.round(w.players[1].body.y), w.players[1].mode] }; })()',
        ),
      ),
    );
  }
}
