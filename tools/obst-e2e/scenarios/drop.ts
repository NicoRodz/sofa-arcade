import { N, sleep } from '../config';
import { Phone } from '../phone';
import type { Ctx } from '../setup';

export async function runDrop(c: Ctx) {
  const { cdp, phones, room, names, state } = c;
  // a phone loses its connection in the middle of the level and comes back: the level goes on, the slot is kept
  for (let i = 0; i < 80 && ((await state())?.tick ?? 0) < 240; i++) await sleep(100);
  const victim = phones[1]!;
  victim.ws.close();
  await sleep(1500);
  const away = await state();
  console.log('while away: player 1 connected =', away?.players.find((p: any) => p.slot === 1)?.connected, ' level still', away?.world);
  await cdp.shot('drop-away');
  const back = new Phone(1, names[1]!, room, false);
  phones[1] = back;
  back.level = victim.level;
  back.bot = victim.bot;
  back.startSending();
  await sleep(1500);
  const again = await state();
  console.log('after rejoining: player 1 connected =', again?.players.find((p: any) => p.slot === 1)?.connected);
  await cdp.shot('drop-back');
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 120_000 && !ok) {
    await sleep(500);
    const st = await state();
    ok = !!st && (st.world === 'cleared' || st.levelIndex > 0);
  }
  console.log(
    `RESULT drop n=${N}: away connected=${away?.players.find((p: any) => p.slot === 1)?.connected}, back connected=${again?.players.find((p: any) => p.slot === 1)?.connected}, level cleared after the drop: ${ok}`,
  );
  if (
    !ok ||
    away?.players.find((p: any) => p.slot === 1)?.connected !== false ||
    again?.players.find((p: any) => p.slot === 1)?.connected !== true
  )
    c.code = 1;
}
