// Runs in headless Chrome with a real AudioContext: gesture unlock, hint, mute key and bus -> sound wiring.
import { Emitter, type GameEvents } from '../../shared/events';
import { initAudio } from '../../screen/src/audio';

const w = window as unknown as Record<string, unknown>;
const Orig = window.AudioContext;
let created = 0;
w.AudioContext = class extends Orig {
  constructor() {
    super();
    w.__ctx = this;
    const osc = this.createOscillator.bind(this);
    this.createOscillator = () => { created++; return osc(); };
  }
};
const bus = new Emitter<GameEvents>();
let snap = { phase: 'lobby' as 'lobby' | 'playing' | 'results', started: false, timeLeftMs: null as number | null };
const audio = initAudio(bus, () => snap);
w.__smoke = {
  state: () => (w.__ctx as AudioContext).state,
  hint: () => { const d = [...document.body.children].find((e) => (e as HTMLElement).style.position === 'fixed') as HTMLElement | undefined; return d ? (d.style.display === 'none' ? '' : d.textContent) : null; },
  oscillators: () => created,
  emit: (name: keyof GameEvents, payload: never) => bus.emit(name, payload),
  play: () => { snap = { phase: 'playing', started: true, timeLeftMs: 120000 }; },
  joined: () => audio.playerJoined(),
  muted: () => localStorage.getItem('pg.muted'),
};
document.title = 'ready';
