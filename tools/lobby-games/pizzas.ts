// Pizzas' lobby, coop then versus: the map panel (band, fold, pick, difficulty), the pills, the team bar and the player cards inside the team columns.
import { sleep } from '../capture/config';
import type { Ctx } from '../capture/session';
import { Captain } from './captain';
import { check, LABEL } from './check';
import { dump } from './dump';

const PIZZAS_IDS = ['maps', 'teams', 'teambar', 'sabs', 'evs', 'muts', 'modes', 'diffs', 'mapfor'];

export async function pizzas({ cdp, bots, open, join, click }: Ctx) {
  const ev = <T>(s: string) => cdp.eval<T>(s);
  const room = 'L2PZ';
  await open(room);
  const cap = new Captain(room);
  await sleep(500);
  await join(room, 8, [], { from: 1 });
  for (let i = 0; i < 40 && !cap.rows.length; i++) await sleep(100);
  check(cap.rows.length > 0, "the Captain's phone got the lobby form");
  const shot = (n: string) => cdp.shot(`lobby2-${LABEL}-${n}`);
  const mapsHas = (q: string) => ev<boolean>(`!!document.querySelector('#maps ${q}')`);
  const waitFor = async (expr: string, ms = 4000) => {
    for (let t = 0; t < ms; t += 100) {
      if (await ev<boolean>(expr)) return true;
      await sleep(100);
    }
    return false;
  };
  const others = `[data-to="others"]`;
  for (const [mode, tag] of [
    ['coop', 'coop8'],
    ['versus', 'versus8'],
  ] as const) {
    if (mode === 'versus') {
      cap.act('mode', 'versus');
      check(await waitFor(`!document.getElementById('teams').classList.contains('off')`), 'versus: the team columns show');
    }
    await sleep(500);
    await dump({ cdp } as Ctx, `${tag}-default`, PIZZAS_IDS);
    await shot(`${tag}-default`);
    if (mode === 'coop') {
      check(
        await mapsHas('.band .grp'),
        'coop 8: the "Recomendados para N" band is there',
        await ev<string>(`document.querySelector('#maps .grp')?.textContent ?? ''`),
      );
      check(await mapsHas('.mc.sel'), 'coop 8: a map is selected');
      const before = await ev<number>(`document.querySelectorAll('#maps .mc').length`);
      if (await mapsHas(others)) {
        await click(`#maps ${others}`);
        await sleep(300);
        const after = await ev<number>(`document.querySelectorAll('#maps .mc').length`);
        check(after > before, '"Otros mapas" unfolds', `${before} -> ${after} cards`);
        check(
          (await ev<string>(`document.querySelector('#maps ${others}').textContent`)).includes('Ocultar'),
          'the fold button now says "Ocultar otros"',
        );
        await shot(`${tag}-others`);
        await dump({ cdp } as Ctx, `${tag}-others`, ['maps']);
      } else check(true, 'coop 8: no folded maps with 8 players (nothing to unfold)');
    }
    const pick = cap.otherMap();
    check(!!pick, `${mode}: the Captain has a map to pick`, String(pick));
    if (pick) {
      cap.act('map', pick);
      check(
        await waitFor(`!!document.querySelector('#maps .mc.sel[data-map="${pick}"]')`),
        `${mode}: the Captain's pick is the selected card`,
        pick,
      );
      check((await ev<number>(`document.querySelectorAll('#maps .mc.sel').length`)) === 1, `${mode}: exactly one selected card`);
    }
    if (mode === 'coop' && (await mapsHas(others))) {
      check(
        (await ev<string>(`document.querySelector('#maps ${others}').textContent`)).includes('Ocultar'),
        'coop: "Otros mapas" stays unfolded after the pick',
      );
    }
    await shot(`${tag}-picked`);
    await dump({ cdp } as Ctx, `${tag}-picked`, PIZZAS_IDS);
    cap.act('difficulty', 'hard');
    check(await waitFor(`!!document.querySelector('#diffs [data-diff="hard"].sel')`), `${mode}: difficulty changes to Difícil`);
    check(
      (await ev<number>(`document.querySelectorAll('#maps .mc.sel').length`)) <= 1,
      `${mode}: at most one selected card after the difficulty change`,
    );
    if (mode === 'coop' && (await mapsHas(others)))
      check(
        (await ev<string>(`document.querySelector('#maps ${others}').textContent`)).includes('Ocultar'),
        'coop: "Otros mapas" stays unfolded after the difficulty change',
      );
    await shot(`${tag}-hard`);
    await click(`#evs [data-ev="false"]`);
    check(
      await waitFor(`!!document.querySelector('#evs [data-ev="false"].sel') && !document.querySelector('#evs [data-ev="true"].sel')`),
      `${mode}: Eventos No is the only selected pill`,
    );
    await click(`#evs [data-ev="true"]`);
    check(
      await waitFor(`!!document.querySelector('#evs [data-ev="true"].sel') && !document.querySelector('#evs [data-ev="false"].sel')`),
      `${mode}: Eventos Sí back`,
    );
    if (mode === 'versus') {
      await click(`#sabs [data-sab="soft"]`);
      check(
        await waitFor(`!!document.querySelector('#sabs [data-sab="soft"].sel') && document.querySelectorAll('#sabs .sel').length === 1`),
        'versus: Sabotaje Suave is the only selected pill',
      );
      await click(`#sabs [data-sab="off"]`);
      check(
        await waitFor(`!!document.querySelector('#sabs [data-sab="off"].sel') && document.querySelectorAll('#sabs .sel').length === 1`),
        'versus: Sabotaje Apagado',
      );
      const lockText = () => ev<string>(`document.getElementById('lock').textContent`);
      await click('#lock');
      check(
        await waitFor(
          `document.getElementById('lock').textContent === 'Desbloquear equipos' && document.getElementById('lock').classList.contains('sel')`,
        ),
        'versus: Bloquear equipos -> "Desbloquear equipos", selected',
        await lockText(),
      );
      check(await waitFor(`document.getElementById('teams').classList.contains('teams-locked')`), 'versus: the columns are locked');
      await click('#lock');
      check(
        await waitFor(
          `document.getElementById('lock').textContent === 'Bloquear equipos' && !document.getElementById('lock').classList.contains('sel')`,
        ),
        'versus: unlocked again',
      );
      const on0 = await ev<boolean>(`document.getElementById('opt-hiddenScore').classList.contains('on')`);
      await click('#opt-hiddenScore');
      check(
        await waitFor(
          `document.getElementById('opt-hiddenScore').classList.contains('on') === ${!on0} && document.getElementById('opt-hiddenScore').classList.contains('sel') === ${!on0}`,
        ),
        `versus: the Marcador oculto pill flips (was ${on0 ? 'on' : 'off'})`,
      );
      await click('#opt-hiddenScore');
      check(await waitFor(`document.getElementById('opt-hiddenScore').classList.contains('on') === ${on0}`), 'versus: and flips back');
      // the shell of every card travels to a team column: what lit rendered inside it has to keep updating there
      const inLists = `document.querySelectorAll('#teams .tlist .chip').length`;
      check((await ev<number>(inLists)) === 8, 'versus: all 8 cards are inside the team columns', String(await ev<number>(inLists)));
      const names = await ev<string[]>(`[...document.querySelectorAll('#teams .tlist .chip .nm')].map((e) => e.textContent)`);
      check(
        names.length === 8 && names.every((n) => n && n !== 'Esperando…'),
        'versus: each card in a column shows its player',
        names.join(','),
      );
      const crowned = await ev<number>(
        `[...document.querySelectorAll('#teams .tlist .chip .nm')].filter((e) => e.textContent.startsWith('👑')).length`,
      );
      check(crowned === 1, 'versus: the Captain wears the crown inside the column', String(crowned));
      await shot(`${tag}-pills`);
      await click('#tc0 .tlist .chip');
      await sleep(500);
      check((await ev<number>(inLists)) === 8, 'versus: a click on a card moves it and none is lost');
      bots[bots.length - 1]!.ws.close(); // a phone that leaves: its card goes back to "Esperando…" and the other cards keep their place
      check(
        await waitFor(`document.querySelectorAll('#teams .tlist .chip:not(.empty)').length === 7`, 6000),
        'versus: a phone that leaves empties its card inside the column',
        String(await ev<number>(`document.querySelectorAll('#teams .tlist .chip:not(.empty)').length`)),
      );
      await shot(`${tag}-gone`);
    }
    if (mode === 'coop') {
      cap.act('mode', 'coop');
      await sleep(0);
    }
  }
  cap.act('mode', 'coop');
  check(await waitFor(`document.getElementById('teams').classList.contains('off')`), 'back to coop: the columns hide');
  check((await ev<number>(`document.querySelectorAll('#maps .mc.sel').length`)) <= 1, 'back to coop: at most one selected card');
  await shot('back-coop');
  cap.ws.close();
}
