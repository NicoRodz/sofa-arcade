// Pure data: the match themes. Each one is a point between the tarantela (modal melody over a chord loop) and the tribal beat
// (boom/kick/toms/conga/hat/shaker on a 16-step bar). music.ts turns a theme into notes.
export type LeadVoice = 'mandolin' | 'marimba' | 'flute';
export type DrumVoice = 'boom' | 'kick' | 'tomHi' | 'tomMid' | 'conga' | 'hat';
export type ChordName = 'Am' | 'E7' | 'Dm' | 'G' | 'C' | 'D' | 'Em' | 'Bb' | 'Gm' | 'A' | 'B';

export const CHORD: Record<ChordName, { pad: string[]; bass: [string, string] }> = {
  Am: { pad: ['A3', 'C4', 'E4'], bass: ['A2', 'E3'] },
  E7: { pad: ['E3', 'G#3', 'B3', 'D4'], bass: ['E2', 'B2'] },
  Dm: { pad: ['D3', 'F3', 'A3'], bass: ['D2', 'A2'] },
  G: { pad: ['G3', 'B3', 'D4'], bass: ['G2', 'D3'] },
  C: { pad: ['C4', 'E4', 'G4'], bass: ['C3', 'G3'] },
  D: { pad: ['D3', 'F#3', 'A3'], bass: ['D2', 'A2'] },
  Em: { pad: ['E3', 'G3', 'B3'], bass: ['E2', 'B2'] },
  Bb: { pad: ['A#3', 'D4', 'F4'], bass: ['A#2', 'F3'] },
  Gm: { pad: ['G3', 'A#3', 'D4'], bass: ['G2', 'D3'] },
  A: { pad: ['A3', 'C#4', 'E4'], bass: ['A2', 'E3'] },
  B: { pad: ['B3', 'D#4', 'F#4'], bass: ['B2', 'F#3'] },
};

export interface Theme {
  id: string;
  name: string;
  perBeat: 3 | 4; // steps per beat: 3 = eighths of a 6/8 or 12/8, 4 = sixteenths of a 4/4
  barSteps: number;
  bpm: { lobby: number; game: number; rush: number }; // beats per minute
  bars: { chord: ChordName; mel: string }[]; // mel: barSteps tokens; note name, '-' hold, '_' rest
  lead: LeadVoice;
  leadLobby: LeadVoice;
  restrike: boolean; // held lead notes are re-struck in sixteenths (the mandolin tremolo)
  bass: number[]; // bar steps; even positions play the root, odd the fifth
  pad: number[];
  padLen: number; // steps
  drums: Record<DrumVoice, number[]>;
  fills: Partial<Record<DrumVoice, number[]>>; // extra hits on the last bar of every four
  shaker: { accent: number[]; skip: number[]; ghost: number; body: number }; // gains relative to the accent
  cadence: [ChordName, ChordName]; // results: long chord, then the resolution
}

const bars = (rows: [ChordName, string][]) => rows.map(([chord, mel]) => ({ chord, mel }));

// 6/8, 12 bars: the original tarantela with the tribal low end and toms under it.
const tarantela: Theme = {
  id: 'tarantela',
  name: 'Tarantela tribal',
  perBeat: 3,
  barSteps: 6,
  bpm: { lobby: 80, game: 100, rush: 128 },
  bars: bars([
    ['Am', 'A4 C5 E5 A5 E5 C5'],
    ['Am', 'B4 C5 D5 E5 - -'],
    ['E7', 'G#4 B4 E5 G#5 E5 B4'],
    ['E7', 'D5 C5 B4 B4 - -'],
    ['E7', 'B4 D5 E5 G#5 E5 D5'],
    ['E7', 'C5 B4 A4 G#4 B4 E5'],
    ['Am', 'A4 C5 E5 A5 G#5 A5'],
    ['Am', 'E5 C5 B4 A4 - -'],
    ['Dm', 'D5 F5 A5 F5 D5 F5'],
    ['Am', 'E5 C5 E5 A5 - -'],
    ['E7', 'G#5 E5 B4 D5 C5 B4'],
    ['Am', 'A4 E4 A4 A4 - -'],
  ]),
  lead: 'mandolin',
  leadLobby: 'mandolin',
  restrike: true,
  bass: [0, 3],
  pad: [1, 4],
  padLen: 2,
  drums: { boom: [0], kick: [3], tomHi: [5], tomMid: [], conga: [], hat: [] },
  fills: { tomMid: [2, 4], conga: [1] },
  shaker: { accent: [0, 3], skip: [], ghost: 1, body: 1 },
  cadence: ['E7', 'Am'],
};

// 4/4 at 125: the measured tribal groove (boom 0/8, kick 4/12, tom 3/11, hat on 2/6/10/14) under a mandolin pentatonic line.
const conga: Theme = {
  id: 'conga-mandolina',
  name: 'Conga mandolina',
  perBeat: 4,
  barSteps: 16,
  bpm: { lobby: 96, game: 125, rush: 142 },
  bars: bars([
    ['Am', 'A4 _ C5 _ E5 _ A5 E5 C5 _ E5 _ A4 _ _ _'],
    ['Am', 'C5 E5 A5 - G5 E5 C5 _ D5 C5 A4 _ E5 - - _'],
    ['G', 'B4 _ D5 _ G5 _ D5 B4 G4 _ B4 _ D5 - - _'],
    ['G', 'D5 B4 G4 B4 D5 B4 G4 _ A4 _ B4 _ D5 - - _'],
    ['Am', 'A4 C5 E5 A5 E5 C5 E5 A5 G5 E5 C5 E5 A4 - - _'],
    ['Am', 'E5 - - C5 A4 - - E4 A4 C5 E5 - D5 C5 A4 _'],
    ['E7', 'G#4 _ B4 _ E5 _ G#5 E5 B4 _ D5 _ B4 G#4 B4 _'],
    ['Am', 'A4 _ _ E4 A4 _ C5 _ E5 - - _ A4 - - -'],
  ]),
  lead: 'mandolin',
  leadLobby: 'marimba',
  restrike: false,
  bass: [0, 3, 6, 8, 11, 14],
  pad: [6, 14],
  padLen: 2,
  drums: { boom: [0, 8], kick: [4, 12], tomHi: [3, 11], tomMid: [], conga: [], hat: [2, 6, 10, 14] },
  fills: { tomMid: [10, 14, 15], conga: [7, 13] },
  shaker: { accent: [0, 8], skip: [1, 9], ghost: 0.35, body: 0.7 },
  cadence: ['E7', 'Am'],
};

// D harmonic minor, flute over accordion stabs and a conga tumbao.
const selva: Theme = {
  id: 'acordeon-selva',
  name: 'Acordeon selva',
  perBeat: 4,
  barSteps: 16,
  bpm: { lobby: 92, game: 118, rush: 134 },
  bars: bars([
    ['Dm', 'D5 _ F5 _ A5 - - F5 D5 _ F5 - A4 _ _ _'],
    ['Dm', 'G5 F5 D5 _ F5 - - _ A5 G5 F5 D5 C5 - - _'],
    ['Bb', 'D5 _ F5 _ A#5 - - F5 D5 _ A#4 - D5 - - _'],
    ['C', 'E5 _ G5 _ C6 - - G5 E5 _ C5 - E5 G5 - _'],
    ['Dm', 'D5 F5 A5 - A5 G5 F5 _ D5 _ F5 _ A5 - - _'],
    ['Dm', 'A5 - F5 - D5 - A4 _ D5 F5 A5 F5 D5 - - _'],
    ['Gm', 'G5 _ A#5 _ D6 - - A#5 G5 _ D5 - G5 - - _'],
    ['A', 'E5 _ A5 _ C#6 - - A5 E5 _ C#5 - E5 - D5 C#5'],
  ]),
  lead: 'flute',
  leadLobby: 'flute',
  restrike: false,
  bass: [0, 6, 8, 14],
  pad: [2, 5, 10, 13],
  padLen: 2,
  drums: { boom: [0, 8], kick: [6, 14], tomHi: [3, 11], tomMid: [9], conga: [2, 5, 13], hat: [4, 12] },
  fills: { tomMid: [10, 11, 15], tomHi: [14] },
  shaker: { accent: [2, 6, 10, 14], skip: [], ghost: 0.3, body: 0.6 },
  cadence: ['A', 'Dm'],
};

// 12/8 shuffle in E minor: marimba triplets, the tribal pulse on the dotted beats.
const carnaval: Theme = {
  id: 'marimba-carnaval',
  name: 'Marimba carnaval',
  perBeat: 3,
  barSteps: 12,
  bpm: { lobby: 84, game: 104, rush: 128 },
  bars: bars([
    ['Em', 'E5 _ G5 B5 _ G5 E5 _ G5 B5 - -'],
    ['Em', 'D6 - B5 G5 _ B5 E5 - G5 E5 _ _'],
    ['C', 'E5 _ G5 C6 _ G5 E5 _ C5 E5 - -'],
    ['D', 'F#5 _ A5 D6 _ A5 F#5 _ D5 F#5 - -'],
    ['Em', 'G5 B5 E6 - B5 G5 B5 - G5 E5 - -'],
    ['Em', 'E5 _ B4 E5 _ G5 B5 _ G5 E5 _ B4'],
    ['Am', 'A5 _ E5 A5 _ C6 A5 _ E5 C5 _ A4'],
    ['B', 'B5 _ F#5 B5 _ D#6 B5 _ F#5 D#5 B4 -'],
  ]),
  lead: 'marimba',
  leadLobby: 'marimba',
  restrike: false,
  bass: [0, 3, 6, 9],
  pad: [4, 10],
  padLen: 2,
  drums: { boom: [0, 6], kick: [3, 9], tomHi: [2, 8], tomMid: [], conga: [], hat: [1, 4, 7, 10] },
  fills: { tomMid: [8, 10, 11], conga: [5, 7] },
  shaker: { accent: [0, 3, 6, 9], skip: [], ghost: 0.4, body: 0.4 },
  cadence: ['B', 'Em'],
};

// A phrygian (Bb as the passing tone), fast mandolin runs over a 3+3+2 tom pattern.
const frigia: Theme = {
  id: 'pizzeria-frigia',
  name: 'Pizzeria frigia',
  perBeat: 4,
  barSteps: 16,
  bpm: { lobby: 100, game: 130, rush: 146 },
  bars: bars([
    ['Am', 'A4 A#4 A4 _ C5 _ E5 _ A5 - - E5 C5 _ A#4 A4'],
    ['Am', 'E5 _ E5 F5 E5 C5 A4 _ C5 E5 A5 - G5 E5 C5 _'],
    ['Bb', 'D5 _ F5 _ A#5 - - F5 D5 _ A#4 _ D5 F5 - _'],
    ['Bb', 'A#5 - F5 D5 A#4 _ D5 F5 A#5 - A5 F5 D5 - A#4 -'],
    ['Dm', 'A5 - F5 - D5 - A4 _ D5 F5 A5 - G5 F5 E5 _'],
    ['Bb', 'F5 _ D5 F5 A#5 _ F5 D5 A#4 _ D5 _ F5 - - _'],
    ['E7', 'G#5 _ E5 B4 G#4 _ B4 E5 G#5 - B5 G#5 E5 - D5 _'],
    ['Am', 'C5 B4 A4 G#4 A4 _ E5 _ A4 - - E4 A4 - - -'],
  ]),
  lead: 'mandolin',
  leadLobby: 'flute',
  restrike: false,
  bass: [0, 3, 6, 8, 11, 14],
  pad: [4, 12],
  padLen: 3,
  drums: { boom: [0, 8], kick: [4, 12, 15], tomHi: [3, 6, 11, 14], tomMid: [], conga: [], hat: [2, 10] },
  fills: { tomMid: [9, 10, 13], conga: [7, 15] },
  shaker: { accent: [0, 6, 8, 14], skip: [1, 9], ghost: 0.3, body: 0.6 },
  cadence: ['E7', 'Am'],
};

export const THEMES: readonly Theme[] = [tarantela, conga, selva, carnaval, frigia];
