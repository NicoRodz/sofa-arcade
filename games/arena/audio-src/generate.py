#!/usr/bin/env python3
"""Manchazo audio suite: tribal house by code.

Usage:  python3 generate.py [outdir]      (needs numpy, scipy, ffmpeg with libvorbis)
Everything is synthesized here (kick, bass, stabs, pad, shouts, SFX) except the percussion,
which uses TR-808 samples by Michael Fischer (CC0) from ./samples. Deterministic (fixed seeds).
"""
import json, re, subprocess, sys, warnings, tempfile, os
from pathlib import Path
import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d, uniform_filter1d

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE
SR = 44100
BPM = 120
STEP = 60 / BPM / 4          # 16th note = 0.125 s
BAR = STEP * 16              # 2.0 s
SWING = 0.10                 # odd 16ths delayed by 10 % of a step (~55 % swing)
KEY = "A minor"
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- basics
_cache = {}
def smp(name, semis=0.0, gain=1.0):
    key = (name, semis)
    if key not in _cache:
        _, d = wavfile.read(HERE / "samples" / f"{name}.WAV")
        d = d.astype(np.float64) / 32768.0
        if d.ndim > 1: d = d.mean(axis=1)
        if semis:
            r = 2 ** (semis / 12)
            d = np.interp(np.arange(0, len(d) - 1, r), np.arange(len(d)), d)
        d = d * np.minimum(np.arange(len(d)) / 30.0, 1.0)   # 0.7 ms onset ramp: no sample-1 steps at the loop seam
        _cache[key] = d
    return _cache[key] * gain

def mt(n): return 440.0 * 2 ** ((n - 69) / 12)
def tt(n): return np.arange(int(n)) / SR
def secs(x): return int(round(x * SR))

def put(buf, sig, t, gain=1.0, pan=0.0):
    """Add mono sig at time t (s). pan -1..1 constant power. Writes beyond the end are dropped."""
    i = secs(t)
    if i >= buf.shape[1] or i < 0: return
    n = min(len(sig), buf.shape[1] - i)
    a = (pan + 1) * np.pi / 4
    buf[0, i:i + n] += sig[:n] * gain * np.cos(a)
    buf[1, i:i + n] += sig[:n] * gain * np.sin(a)

def stereo(sig, pan=0.0):
    a = (pan + 1) * np.pi / 4
    return np.stack([sig * np.cos(a), sig * np.sin(a)])

def saw(f, n, maxf=9000):
    t = tt(n); y = np.zeros(n)
    for k in range(1, int(maxf // f) + 1):
        y += np.sin(2 * np.pi * f * k * t) / k
    return y * (2 / np.pi)

def lp(x, fc, order=2):
    return signal.lfilter(*signal.butter(order, fc / (SR / 2), "low"), x)
def hp(x, fc, order=2):
    return signal.lfilter(*signal.butter(order, fc / (SR / 2), "high"), x)
def bp(x, lo, hi, order=2):
    return signal.lfilter(*signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], "band"), x)

def adsr(n, a, d, s, r_start, r):
    """n samples; attack a s, decay d s to level s, release starts at r_start s over r s."""
    t = tt(n); e = np.minimum(t / max(a, 1e-4), 1.0)
    e = e * (s + (1 - s) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-4)))
    e *= np.clip(1 - (t - r_start) / max(r, 1e-4), 0, 1)
    return e

def exp_env(n, tau): return np.exp(-tt(n) / tau)

def reverb_ir(length=1.6, tau=0.45, seed=0):
    r = np.random.default_rng(seed)
    n = secs(length); t = tt(n)
    ir = r.standard_normal((2, n)) * np.exp(-t / tau)
    ir[:, :secs(0.012)] *= np.linspace(0, 1, secs(0.012))
    ir = np.stack([lp(ir[0], 6000), lp(ir[1], 6000)])
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True)) * 0.35
IR = reverb_ir()
def reverb(x):
    """x: (2, n) -> wet (2, n + len(IR))."""
    return np.stack([signal.fftconvolve(x[c], IR[c]) for c in range(2)])

def circ_hp(x, fc):
    """High-pass applied circularly (3 tiled copies, middle one kept) so the filter state is continuous at the loop seam."""
    n = x.shape[1]
    return np.stack([hp(np.tile(c, 3), fc)[n:2 * n] for c in x])

def fold(x, n):
    """Wrap an (2, m) buffer onto length n (circular overlap-add of the tail)."""
    out = np.zeros((2, n))
    for s in range(0, x.shape[1], n):
        seg = x[:, s:s + n]; out[:, :seg.shape[1]] += seg
    return out

def pad_to(x, n):
    out = np.zeros((2, max(n, x.shape[1]))); out[:, :x.shape[1]] = x; return out

# ---------------------------------------------------------------- instruments
def kick(dur=0.45, f0=58.0):
    n = secs(dur); t = tt(n)
    f = f0 + 140 * np.exp(-t / 0.018) + 30 * np.exp(-t / 0.06)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t / 0.20)
    y += 0.5 * np.sin(ph * 2) * np.exp(-t / 0.05) * 0.3
    y += 0.35 * hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.004)   # click
    y *= np.minimum(t / 0.0015, 1)
    return np.tanh(1.6 * y) * 0.95

def bass_note(midi, dur, vel=1.0, bright=1.0):
    """Mono groove bass: sub + filtered saw whose brightness decays, then saturated."""
    n = secs(dur + 0.08); f = mt(midi)
    s = saw(f, n, 5000)
    env_f = np.exp(-tt(n) / 0.09)
    dark = lp(s, 220); light = lp(s, 1400 * bright + 300)
    body = dark * (1 - env_f) + light * env_f
    sub = np.sin(2 * np.pi * f * tt(n))
    y = 0.75 * sub + 0.7 * body
    y *= adsr(n, 0.004, 0.25, 0.8, dur, 0.06)
    return np.tanh(2.2 * y * vel) / 1.3

def stab_chord(notes, dur=0.22, bright=1.0):
    n = secs(dur + 0.25); y = np.zeros(n)
    for m in notes:
        for det in (-0.12, 0.0, 0.12):
            y += saw(mt(m + det), n, 7000) / 3
    e = np.exp(-tt(n) / 0.06)
    y = lp(y, 900 * bright) * (1 - e) * 0.0 + (lp(y, 700) * (1 - e) + lp(y, 3800 * bright) * e)
    y *= adsr(n, 0.003, 0.09, 0.25, dur, 0.18)
    return np.tanh(1.5 * y) * 0.5

def pad_chord(notes, dur):
    n = secs(dur); y = np.zeros(n)
    for m in notes:
        for det in (-0.18, 0.18):
            y += saw(mt(m + det), n, 3500) / 2
    y = lp(y, 1100)
    return y * adsr(n, 0.35, 0.5, 0.9, dur - 0.5, 0.5) * 0.5

FORMANTS = {  # vowel -> (freq, gain) triplets
    "e": [(530, 1.0), (1840, 0.6), (2480, 0.35)],
    "i": [(300, 1.0), (2290, 0.5), (3010, 0.3)],
    "a": [(730, 1.0), (1090, 0.7), (2440, 0.3)],
    "o": [(570, 1.0), (840, 0.6), (2410, 0.2)],
    "u": [(325, 1.0), (700, 0.4), (2530, 0.15)],
}
def vowel(v, src):
    y = 0
    for f, g in FORMANTS[v]:
        y = y + g * bp(src, f * 0.93, f * 1.07, 2)
    return y

def shout(v1, v2, dur=0.35, f0a=230, f0b=190, breath=True, grit=3.0, seed=1):
    """Synthesized formant 'shout' (glottal saw through vowel formants, v1 -> v2)."""
    r = np.random.default_rng(seed)
    n = secs(dur); t = tt(n)
    f0 = np.linspace(f0a, f0b, n) * (1 + 0.012 * np.sin(2 * np.pi * 6 * t))
    ph = np.cumsum(f0) / SR
    src = (2 * (ph % 1) - 1) + 0.08 * r.standard_normal(n)
    a, b = vowel(v1, src), vowel(v2, src)
    w = np.clip((t - 0.12 * dur) / (0.5 * dur), 0, 1)
    y = a * (1 - w) + b * w
    y = np.tanh(grit * y / (np.abs(y).max() + 1e-9)) * adsr(n, 0.012, 0.3, 0.7, dur * 0.7, dur * 0.3)
    if breath:
        h = bp(r.standard_normal(n), 1500, 5500) * np.exp(-t / 0.035) * 0.5
        y = y + h
    return y / (np.abs(y).max() + 1e-9) * 0.9

def noise_riser(dur, f_start=300, f_end=9000, seed=3):
    r = np.random.default_rng(seed); n = secs(dur)
    x = r.standard_normal(n); blk = 512
    # stateful block filtering
    zi = None; out = np.zeros(n)
    for i in range(0, n, blk):
        fc = f_start * (f_end / f_start) ** (i / n)
        b, a = signal.butter(2, [fc * 0.7 / (SR / 2), min(fc * 1.4, 20000) / (SR / 2)], "band")
        if zi is None: zi = signal.lfilter_zi(b, a) * 0
        o, zi = signal.lfilter(b, a, x[i:i + blk], zi=zi)
        out[i:i + blk] = o
    return out * (np.linspace(0, 1, n) ** 2) * np.clip((n - np.arange(n)) / secs(0.06), 0, 1)   # 60 ms fade = the 'stop' before the drop

def crash(dur=1.6, seed=5):
    r = np.random.default_rng(seed); n = secs(dur)
    y = hp(r.standard_normal(n), 3500) * np.exp(-tt(n) / 0.45)
    return y / np.abs(y).max() * np.minimum(tt(n) / 0.004, 1)

# ---------------------------------------------------------------- music engine
CHORDS = [  # per bar of a 4-bar phrase: (bass root midi, third semitones, chord notes)
    (33, 3, [57, 60, 64]),   # Am
    (33, 3, [57, 60, 64]),   # Am
    (29, 4, [53, 57, 60]),   # F
    (31, 4, [55, 59, 62]),   # G
]
def stept(bar, step, swing=True):
    off = SWING * STEP if (swing and step % 2 == 1) else 0.0
    return bar * BAR + step * STEP + off

def sidechain(n, times, depth, tau=0.13):
    duck = np.ones(n)
    L = secs(0.5); t = tt(L)
    shape = 1 - depth * np.exp(-t / tau) * np.minimum(t / 0.004, 1) * 1.0
    shape = np.minimum(shape, 1.0)
    for tm in times:
        i = secs(tm)
        for k in range(L):  # vector assignment w/ wrap
            pass
        idx = (i + np.arange(L)) % n
        duck[idx] = np.minimum(duck[idx], shape)
    return duck

def round_layer(level, nbars=16):
    """level 0 = base, 1 = 30s, 2 = final10. Same loop, tempo, key; intensity grows."""
    N = secs(nbars * BAR); EXT = N + secs(2.5)
    D = np.zeros((2, EXT))     # drums (not ducked)
    P = np.zeros((2, EXT))     # percussion tops
    B = np.zeros((2, EXT))     # bass
    M = np.zeros((2, EXT))     # stabs / pad (reverb send source)
    V = np.zeros((2, EXT))     # shouts / fx
    K = kick()
    ktimes = []
    for b in range(nbars):
        root, third, chord = CHORDS[b % 4]
        ph8 = b % 8; last_of_phrase = (b % 4 == 3)
        for s in range(0, 16, 4):                      # four on the floor
            put(D, K, stept(b, s), 1.0); ktimes.append(stept(b, s))
        # --- hats / shaker
        for s in range(16):
            sw = stept(b, s)
            acc = 1.0 if s % 4 == 2 else (0.55 if s % 2 == 0 else 0.35)
            if level == 0 and s % 2 == 0:
                put(P, smp("MA", 0, 0.5), sw, 0.28 * acc, -0.3)
            if level >= 1:
                put(P, smp("MA", 2 if s % 2 else 0, 0.5), sw, (0.26 + 0.07 * level) * acc, 0.3 if s % 2 else -0.3)
            if level == 2 and s % 2 == 1:
                put(P, smp("CH", 0, 0.5), sw, 0.20, 0.15)
        for s in (2, 6, 10, 14):                       # offbeat hat
            put(P, smp("OH10", 0, 0.8) if level == 0 else smp("OH25", 0, 0.7), stept(b, s), 0.22 + 0.12 * level, 0.1)
            if level == 0: put(P, smp("CH", 0, 0.9), stept(b, s), 0.18, 0.1)
        # --- clap
        if level >= 1:
            for s in (4, 12):
                put(D, smp("CP", 0, 0.9), stept(b, s), 0.55 + 0.1 * (level - 1))
            if level == 2: put(D, smp("CP", 0, 0.6), stept(b, 15), 0.22)
        # --- congas (tumbao-ish, denser each level)
        cong = {0: [(3, "HC", .55), (7, "MC", .5), (10, "LC", .6), (14, "HC", .5)],
                1: [(2, "HC", .55), (3, "MC", .5), (5, "LC", .65), (7, "MC", .5), (10, "HC", .55), (11, "MC", .5), (13, "LC", .65), (15, "HC", .5)],
                2: [(1, "HC", .35), (2, "HC", .6), (3, "MC", .55), (5, "LC", .7), (7, "MC", .55), (9, "HC", .35), (10, "HC", .6),
                    (11, "MC", .55), (13, "LC", .7), (14, "MC", .4), (15, "HC", .6)]}[level]
        for s, nm, v in cong:
            put(P, smp(nm + "50", 0, 0.9), stept(b, s), v, {"HC": 0.45, "MC": -0.1, "LC": -0.45}[nm])
        # --- toms: tribal 3-3-3-3-4 pattern
        if level >= 1:
            pat = [(0, "LT", 0), (3, "MT", 0), (6, "LT", -2), (9, "HT", 0), (12, "MT", -2)] if level == 2 else \
                  [(6, "LT", 0), (9, "MT", 0), (13, "HT", 0)] if b % 2 == 1 else [(10, "MT", 0)]
            for s, nm, semi in pat:
                put(P, smp(nm + "50", semi, 0.9), stept(b, s), 0.42 + 0.1 * (level - 1),
                    {"LT": -0.5, "MT": 0.0, "HT": 0.5}[nm])
        if level >= 1 and ph8 in (3, 7):  # extra rim
            put(P, smp("RS", 0, 0.8), stept(b, 7), 0.35, 0.4)
        # --- fills on the last bar of each phrase
        if last_of_phrase:
            if level == 0:
                for j, nm in enumerate(("HC", "MC", "LC")):
                    put(P, smp(nm + "50", 0, 0.9), stept(b, 13 + j, False), 0.5)
            elif level == 1:
                for j, nm in enumerate(("HT", "MT", "LT", "LT")):
                    put(P, smp(nm + "50", 0, 0.9), stept(b, 12 + j, False), 0.5 + 0.08 * j, 0.5 - 0.35 * j)
            else:
                for j in range(8):   # clap roll accelerating
                    put(D, smp("CP", 0, 0.9), b * BAR + (8 + j) * STEP * 1.0 - 0 + 0, 0.15 + 0.07 * j)
        # --- bass
        bass = {0: [(2, 0, 2.0), (6, 0, 2.0), (10, 0, 2.0), (14, 0, 1.0)],
                1: [(2, 0, 1.0), (3, 12, 0.6), (6, 0, 1.0), (7, 0, 0.6), (10, 0, 1.0), (11, 7, 0.6), (14, 0, 1.0), (15, 12, 0.5)],
                2: [(2, 0, 1.0), (3, 12, 0.5), (5, 0, 0.6), (6, 0, 1.0), (7, 7, 0.5), (10, 0, 1.0), (11, 12, 0.5), (13, 0, 0.6),
                    (14, 0, 1.0), (15, third, 0.5)]}[level]
        for s, semi, dstep in bass:
            put(B, bass_note(root + 12 + semi, dstep * STEP * 0.9, 1.0, 1.0 + 0.4 * level), stept(b, s), 0.85)
        # --- stabs
        if level >= 1:
            ss = [(3, 1.0), (10, 0.9)] if level == 1 else [(3, 1.0), (6, 0.8), (10, 1.0), (11, 0.7), (14, 0.8)]
            if not (level == 1 and b % 4 == 3):
                for s, v in ss:
                    put(M, stab_chord(chord, 0.18, 1.0 + 0.3 * level), stept(b, s), 0.45 * v, 0.0)
        # --- pad (one chord per bar, overlapped)
        put(M, pad_chord(chord, BAR + 0.5) * (0.5 + 0.12 * level), b * BAR, 0.35 if level == 0 else 0.5)
        # --- shouts
        if level >= 1 and ph8 == 7 and b % 8 == 7:
            put(V, shout("o", "a", 0.32, 210, 170, seed=2), stept(b, 14, False), 0.5 if level == 1 else 0.7, 0.0)
        if level == 2:
            if ph8 == 0: put(V, shout("e", "i", 0.30, 250, 220, seed=4), stept(b, 0), 0.7)   # "HEY"
            if ph8 == 4: put(V, shout("a", "a", 0.22, 200, 180, seed=5), stept(b, 10), 0.6)  # "HA"
            if b % 4 == 3: put(V, shout("u", "a", 0.22, 190, 220, seed=6), stept(b, 15, False), 0.45)
    # risers
    if level == 2:
        put(V, noise_riser(2 * BAR, 300, 10000), (nbars - 2) * BAR, 0.4)
        put(V, crash(), 0.0, 0.18)
    if level == 1:
        put(V, noise_riser(BAR, 500, 8000, seed=8), (nbars - 1) * BAR, 0.25)
    put(V, crash(), 8 * BAR, 0.10 + 0.08 * level)

    # --- fold tails onto the loop (circular), then sidechain & reverb
    d, p, bas = fold(D, N), fold(P, N), fold(B, N)
    m = fold(M, N); v = fold(V, N)
    wet = fold(reverb(M * 0.6 + V * 0.5 + D * 0.12 + P * 0.1), N) * (0.8 + 0.15 * level)
    duck = sidechain(N, ktimes, 0.55 - 0.0 * level)
    mix = d * 0.8 + p * 2.4 + bas * 0.9 * 0.40 + (m * 0.8 + wet) * duck + v * 0.9
    return circ_hp(mix, 28)

def lobby(nbars=32):
    """Relaxed lobby, 64 s @120 BPM, A minor. Soft kick on 1 & 3, congas, shaker, warm pad, plucks."""
    N = secs(nbars * BAR); EXT = N + secs(2.5)
    D = np.zeros((2, EXT)); P = np.zeros((2, EXT)); B = np.zeros((2, EXT)); M = np.zeros((2, EXT)); L = np.zeros((2, EXT))
    K = kick(0.5, 55) * 0.7
    kt = []
    LOB = [(33, [57, 60, 64, 67]), (29, [53, 57, 60, 64]), (36, [55, 60, 64, 67]), (31, [55, 59, 62, 65])]  # Am7 Fmaj7 C G(add)
    mel = {0: [(0, 72), (3, 76), (6, 79)], 1: [(0, 77), (3, 76), (6, 72)], 2: [(0, 79), (3, 76), (7, 72)], 3: [(0, 74), (4, 71), (8, 67)]}
    for b in range(nbars):
        root, chord = LOB[b % 4]
        sec = b // 8   # 0 intro, 1 groove, 2 full, 3 outro
        put(M, pad_chord(chord, BAR + 0.7) , b * BAR, 0.55)
        if sec >= 1:
            for s in (0, 8):
                put(D, K, stept(b, s), 0.8); kt.append(stept(b, s))
            for s in (3, 10):
                put(B, bass_note(root + 12, 3 * STEP, 0.8, 0.5), stept(b, s), 0.7)
            put(B, bass_note(root + 12, 2 * STEP, 0.8, 0.5), stept(b, 14), 0.6)
        if sec in (1, 2):
            for s in range(0, 16, 2):
                put(P, smp("MA", 0, 0.5), stept(b, s), 0.2 * (1.0 if s % 4 == 2 else 0.6), -0.3)
            put(P, smp("CP", 0, 0.6), stept(b, 12), 0.22)
        for s, nm, v in [(3, "HC", .4), (7, "MC", .35), (10, "LC", .45), (14, "HC", .35)]:
            if sec in (0, 1, 2, 3) and (sec != 3 or b % 2 == 0):
                put(P, smp(nm + "50", 0, 0.9), stept(b, s), v * (0.8 if sec == 0 else 1.0), {"HC": .45, "MC": -.1, "LC": -.45}[nm])
        if sec == 2:   # pluck melody (soft sine/triangle pluck)
            for s, m in mel[b % 4]:
                n = secs(0.9); t = tt(n); f = mt(m)
                y = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t / 0.22)
                put(L, y, stept(b, s * 2 if s < 8 else s), 0.28, 0.35)
            put(P, smp("OH25", 0, 0.5), stept(b, 14), 0.12, 0.2)
        if b % 8 == 7 and sec < 3:
            put(P, smp("CY7575", 0, 0.5), (b + 1) * BAR - 0.0, 0.0)  # placeholder (silent)
        if b % 16 == 0:
            put(L, crash(1.8) * 0.5, b * BAR, 0.10)
    d, p, bas = fold(D, N), fold(P, N), fold(B, N)
    m = fold(M, N); l = fold(L, N)
    wet = fold(reverb(M * 0.5 + L * 0.8 + P * 0.15), N)
    duck = sidechain(N, kt, 0.35, 0.18) if kt else np.ones(N)
    mix = d + p * 1.9 + bas * 0.9 * 0.7 + (m + wet) * duck * 0.9 + l * 0.9
    return circ_hp(mix, 28)

# ---------------------------------------------------------------- stingers
def stinger_extra():
    """~2 s: accelerating tom roll + riser, impact and a shout on the last beat. A minor."""
    dur = 2.3; B = np.zeros((2, secs(dur))); V = np.zeros_like(B)
    t = 0.0; k = 0
    gaps = np.linspace(0.20, 0.055, 12)
    for g in gaps:
        put(B, smp(["HT", "MT", "LT"][k % 3] + "50", 0, 0.9), t, 0.4 + 0.5 * t / 1.5, [-.4, 0, .4][k % 3]); t += g; k += 1
    put(V, noise_riser(1.5, 400, 9000, seed=11), 0.0, 0.45)
    ti = 1.5
    put(B, kick(0.6, 50) * 1.1, ti, 1.0); put(B, smp("CP", 0, 1.0), ti, 0.8)
    put(V, crash(0.9), ti, 0.35)
    for m, c in [(57, 0), (60, 0), (64, 0)]:
        put(V, stab_chord([57, 60, 64, 69], 0.3, 1.6), ti, 0.8)
    put(V, shout("e", "i", 0.34, 260, 230, seed=21), ti - 0.02, 0.9)
    wet = reverb(V * 0.6)[:, :B.shape[1]]
    return B + V + wet * 0.5

def win_jingle():
    """~4 s: bright C-A fanfare resolving to A major, congas flourish, cheers."""
    dur = 4.3; B = np.zeros((2, secs(dur))); M = np.zeros_like(B)
    put(B, kick(0.5, 55), 0.0, 1.0); put(B, smp("CP", 0, 1), 0.0, 0.6)
    q = 0.25   # sixteenth-ish
    runs = [(0.0, 69), (0.25, 72), (0.5, 76), (0.75, 81)]  # A4 C5 E5 A5 arpeggio
    for t0, m in runs:
        n = secs(0.5); t = tt(n); f = mt(m)
        y = (saw(f, n, 8000) * 0.6 + np.sin(2 * np.pi * f * t)) * adsr(n, 0.004, 0.18, 0.4, 0.3, 0.2)
        put(M, np.tanh(y), t0, 0.35)
    # final chord: A major (C# for the happy resolution), arrives on beat 2 (1.0 s)
    put(M, stab_chord([57, 61, 64, 69, 73], 1.4, 1.6) * 1.2, 1.0, 0.55)
    put(M, pad_chord([57, 61, 64, 69], 3.2), 1.0, 0.5)
    put(B, bass_note(45, 0.5, 1.0, 1.0), 1.0, 0.9); put(B, kick(0.5, 55), 1.0, 1.0)
    for j, (nm, st) in enumerate([("HC", 0), ("MC", 0), ("HC", 0), ("LC", 0), ("MC", 0), ("HC", 0)]):
        put(B, smp(nm + "50", 0, 0.9), 1.0 + j * 0.125 + (0.0 if j % 2 == 0 else 0.0), 0.5, [-.4, 0, .4][j % 3])
    for j in range(8):
        put(B, smp("MA", 0, 0.5), 1.0 + j * 0.25, 0.25, 0.3)
    put(B, kick(0.5, 55), 2.0, 0.9); put(B, smp("CP", 0, 1), 2.0, 0.6); put(B, kick(0.5, 55), 3.0, 0.8)
    put(M, shout("e", "a", 0.45, 240, 260, seed=31), 1.0, 0.8, -0.2)
    put(M, shout("o", "u", 0.40, 200, 230, seed=32), 1.25, 0.6, 0.25)
    put(M, crash(2.5), 1.0, 0.3)
    wet = reverb(M * 0.8)[:, :B.shape[1]]
    out = B + M + wet * 0.6
    return out * np.minimum(1, (dur - tt(out.shape[1])) / 0.4)   # tail fade

def lose_jingle():
    """~4 s: falling A minor line, detuned slide and slow toms, deflating."""
    dur = 4.3; B = np.zeros((2, secs(dur))); M = np.zeros_like(B)
    notes = [(0.0, 76, 0.45), (0.5, 72, 0.45), (1.0, 69, 0.45), (1.5, 64, 1.9)]   # E5 C5 A4 E4
    for t0, m, d in notes:
        n = secs(d + 0.4); t = tt(n)
        f = mt(m) * (1 - 0.02 * np.clip((t - d + 0.3) * 3, 0, 1) * (t0 == 1.5))
        f = mt(m) * np.ones(n)
        if t0 == 1.5: f = mt(m) * 2 ** (-np.clip(t - 0.6, 0, None) * 0.18 / 1.0)   # sagging pitch
        ph = 2 * np.pi * np.cumsum(f) / SR
        y = (np.sign(np.sin(ph)) * 0.4 + np.sin(ph) * 0.8 + 0.4 * np.sin(ph * 1.005))
        wah = 600 + 900 * np.exp(-t / 0.4) * (1 - 0.0)
        y = lp(y, 1200) * adsr(n, 0.01, 0.3, 0.6, d, 0.4)
        put(M, np.tanh(y), t0, 0.5)
    put(M, pad_chord([45, 52, 57, 60], 4.0) * 0.8, 0.0, 0.5)
    for j, (t0, nm) in enumerate([(0.0, "LT"), (1.0, "LT"), (2.0, "LT"), (3.0, "LT")]):
        put(B, smp(nm + "50", -4 - 2 * j, 0.9), t0, 0.7 - 0.1 * j)
    put(B, kick(0.8, 45), 0.0, 0.9)
    put(B, bass_note(33, 1.8, 1.0, 0.4), 1.5, 0.8)
    put(M, shout("o", "u", 0.8, 180, 120, seed=41, grit=1.5) , 1.5, 0.45)
    wet = reverb(M * 0.8)[:, :B.shape[1]]
    out = B + M + wet * 0.6
    return out * np.minimum(1, (dur - tt(out.shape[1])) / 0.7)

# ---------------------------------------------------------------- SFX
def sfx_fuse():
    """Burning fuse: crackle + hiss + rising ticking whine, 1.6 s, loop-friendly (steady)."""
    dur = 1.6; n = secs(dur); t = tt(n); r = np.random.default_rng(51)
    hiss = bp(r.standard_normal(n), 2500, 9000) * 0.5 * (0.7 + 0.3 * np.sin(2 * np.pi * 9 * t))
    crack = np.zeros(n)
    for ti in r.uniform(0, dur - 0.05, 40):
        i = secs(ti); L = secs(0.012 + r.uniform(0, 0.01))
        crack[i:i + L] += r.standard_normal(L) * np.exp(-tt(L) / 0.003) * r.uniform(0.4, 1.0)
    whine = np.sin(2 * np.pi * np.cumsum(700 + 1200 * (t / dur) ** 2 + 40 * np.sin(2 * np.pi * 18 * t)) / SR) * 0.2
    y = hiss + 1.4 * hp(crack, 1200) + whine
    return stereo(y * np.minimum(t / 0.03, 1) * np.minimum((dur - t) / 0.05, 1))

def sfx_pop():
    """Pinata pop + paint splash, 1.2 s."""
    dur = 1.2; n = secs(dur); t = tt(n); r = np.random.default_rng(52)
    thump = np.sin(2 * np.pi * np.cumsum(70 + 220 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.10)
    burst = bp(r.standard_normal(n), 400, 7000) * np.exp(-t / 0.05)
    splash = np.zeros(n)
    for ti, a in zip(np.sort(r.uniform(0.02, 0.45, 18)), r.uniform(0.3, 1.0, 18)):
        i = secs(ti); L = secs(0.10); tl = tt(L)
        f = r.uniform(500, 1500) + 1500 * np.exp(-tl / 0.03)
        splash[i:i + L] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tl / 0.025) * a * 0.4   # bubble blips
    wetn = lp(r.standard_normal(n), 1800) * np.exp(-t / 0.22) * 0.6
    conf = hp(r.standard_normal(n), 6000) * np.exp(-t / 0.3) * 0.18
    y = np.tanh(1.5 * (thump * 1.1 + burst * 0.9 + wetn + splash + conf))
    yl = y; yr = np.roll(y, 40) * 0.9 + 0.1 * conf
    return np.stack([yl, yr]) * np.minimum(t / 0.001, 1)

def sfx_stained():
    """Wet splat/blob when a player is hit by paint, 0.9 s."""
    dur = 0.9; n = secs(dur); t = tt(n); r = np.random.default_rng(53)
    f = 420 * np.exp(-t / 0.07) + 120
    blob = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
    sq = lp(r.standard_normal(n), 2400) * np.exp(-t / 0.06) * (1 + np.sin(2 * np.pi * 55 * t))
    drips = np.zeros(n)
    for ti in (0.22, 0.38, 0.5):
        i = secs(ti); L = secs(0.12); tl = tt(L)
        drips[i:i + L] += np.sin(2 * np.pi * np.cumsum(900 - 5000 * tl * 0 + 800 * np.exp(-tl / 0.02)) / SR) * np.exp(-tl / 0.03) * 0.5
    y = np.tanh(1.8 * (blob * 1.2 + sq * 0.8 + drips))
    return stereo(y)

def sfx_pickup():
    """Bright rising two-note blip A5 -> E6 with sparkle, 0.7 s."""
    dur = 0.7; n = secs(dur); out = np.zeros(n)
    for t0, m in [(0.0, 81), (0.09, 88), (0.18, 93)]:
        L = secs(0.45); tl = tt(L); f = mt(m)
        y = (np.sin(2 * np.pi * f * tl) + 0.4 * np.sin(4 * np.pi * f * tl) + 0.15 * np.sin(6 * np.pi * f * tl)) * np.exp(-tl / 0.12)
        i = secs(t0); out[i:i + L] += y[: n - i] if i + L > n else y
    return stereo(out * 0.8) + reverb(stereo(out * 0.3))[:, :n] * 0.3

def sfx_sabotage():
    """Dirty descending zap + tritone buzz + low hit, 1.0 s."""
    dur = 1.0; n = secs(dur); t = tt(n); r = np.random.default_rng(54)
    f = 1600 * np.exp(-t / 0.18) + 110
    ph = 2 * np.pi * np.cumsum(f) / SR
    zap = np.sign(np.sin(ph)) * 0.5 + np.sin(ph) * 0.5
    buzz = (saw(110, n, 3000) + saw(110 * 2 ** 0.5, n, 3000)) * 0.4 * np.exp(-t / 0.3)   # tritone
    thump = np.sin(2 * np.pi * np.cumsum(60 + 120 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.12)
    y = np.tanh(1.5 * (zap * np.exp(-t / 0.35) * 0.9 + buzz + thump + bp(r.standard_normal(n), 800, 5000) * np.exp(-t / 0.04) * 0.5))
    return stereo(y)

def sfx_alert():
    """Two-tone alert (E5/A5 x2) over a tom hit, 1.2 s."""
    dur = 1.2; n = secs(dur); out = np.zeros(n)
    for t0, m in [(0.0, 76), (0.18, 81), (0.40, 76), (0.58, 81)]:
        L = secs(0.22); tl = tt(L); f = mt(m)
        y = (np.sign(np.sin(2 * np.pi * f * tl)) * 0.35 + np.sin(2 * np.pi * f * tl)) * adsr(L, 0.004, 0.2, 0.7, 0.16, 0.06)
        i = secs(t0); out[i:i + L] += y
    out = np.tanh(out)
    b = stereo(out * 0.7)
    put(b, smp("MT50", 0, 1.0), 0.0, 0.6); put(b, smp("MT50", 0, 1.0), 0.40, 0.6)
    put(b, shout("a", "a", 0.2, 300, 300, breath=False, seed=61) * 0.0, 0.8, 0.0)
    return b + reverb(b * 0.3)[:, :n] * 0.25

# ---------------------------------------------------------------- loudness / limiter / encode
def limiter(x, ceil_db, loop=False, look=0.003, rel=0.08):
    ceil = 10 ** (ceil_db / 20); L = secs(look)
    pre = np.concatenate([x[:, -4 * L:], x, x[:, :4 * L]], axis=1) if loop else np.pad(x, ((0, 0), (4 * L, 4 * L)))
    os_ = signal.resample_poly(pre, 4, 1, axis=1)
    pk = np.abs(os_).max(axis=0)
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    need = need.reshape(-1, 4).min(axis=1) if len(need) % 4 == 0 else np.minimum.reduceat(need, np.arange(0, len(need), 4))
    g = minimum_filter1d(need, size=2 * L + 1)
    g = uniform_filter1d(g, size=2 * L + 1)
    g = np.minimum(g, need) if False else g
    # release smoothing (fast attack already via window)
    out = pre * g[None, :len(pre[0])]
    return out[:, 4 * L:-4 * L]

def run(cmd): return subprocess.run(cmd, capture_output=True, text=True)

def ebur(path):
    r = run(["ffmpeg", "-nostats", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"])
    txt = r.stderr.split("Summary:")[-1]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", txt).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", txt).group(1))
    return I, tp

def wav_tmp(x):
    f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False); f.close()
    wavfile.write(f.name, SR, x.T.astype(np.float32)); return f.name

def decode(path):
    f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False); f.close()
    run(["ffmpeg", "-y", "-v", "error", "-i", str(path), "-ar", str(SR), "-c:a", "pcm_f32le", f.name])
    _, d = wavfile.read(f.name); os.unlink(f.name)
    return d.T.astype(np.float64)

def finalize(x, name, target, loop=False, ceil=-1.6):
    """Iterate gain until the encoded+decoded ogg hits the target LUFS with TP <= -1.2 dBTP.
    Measuring the ogg itself (not the wav) matters: lossy coding shifts LUFS up to ~1 dB on short files."""
    ogg = OUT / f"{name}.ogg"
    gdb = 0.0; best = None
    for it in range(12):
        y = limiter(x * 10 ** (gdb / 20), ceil, loop)
        tmp = wav_tmp(y)
        run(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-c:a", "libvorbis", "-q:a", "6", str(ogg)])
        os.unlink(tmp)
        I, tp = ebur(ogg)
        if tp > -1.2:
            ceil -= max(0.3, tp + 1.2 + 0.1)
            continue
        best = (I, tp, y)
        if abs(I - target) < 0.15: break
        gdb += target - I
    I2, tp2 = ebur(ogg)
    d = decode(ogg)
    return dict(file=f"{name}.ogg", lufs=I2, tp=tp2, samples=d.shape[1], dur=d.shape[1] / SR, dec=d, src=y)

def seam(d):
    """Join test: jump between last and first sample vs typical sample-to-sample step."""
    jump = float(np.abs(d[:, 0] - d[:, -1]).max())
    steps = np.abs(np.diff(d, axis=1))
    return jump, float(np.median(steps)), float(np.percentile(steps, 99.9)), float(steps.max())

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("lobby", lobby(), -15.0, True, "music"),
        ("round-base", round_layer(0), -15.7, True, "music"),
        ("round-30s", round_layer(1), -15.0, True, "music"),
        ("round-final10", round_layer(2), -14.3, True, "music"),
        ("stinger-tiempo-extra", stinger_extra(), -12.0, False, "stinger"),
        ("win", win_jingle(), -14.5, False, "stinger"),
        ("lose", lose_jingle(), -14.5, False, "stinger"),
        ("pinata-fuse", sfx_fuse(), -12.0, False, "sfx"),
        ("pinata-pop", sfx_pop(), -12.0, False, "sfx"),
        ("stained", sfx_stained(), -12.0, False, "sfx"),
        ("pickup", sfx_pickup(), -12.0, False, "sfx"),
        ("sabotage-use", sfx_sabotage(), -12.0, False, "sfx"),
        ("event-alert", sfx_alert(), -12.0, False, "sfx"),
    ]
    res = []
    for name, x, tgt, loop, kind in jobs:
        m = finalize(x, name, tgt, loop)
        row = dict(name=name, kind=kind, target=tgt, lufs=round(m["lufs"], 2), tp=round(m["tp"], 2),
                   samples=m["samples"], dur=round(m["dur"], 3))
        if loop:
            j, med, p999, mx = seam(m["dec"]); js, _, p999s, _ = seam(m["src"])
            row.update(seam_jump=j, seam_median_step=med, seam_p999_step=p999, seam_max_step=mx,
                       seam_ratio=j / p999, seam_src_jump=js)
        res.append(row); print(row, flush=True)
    (OUT / "measurements.json").write_text(json.dumps(res, indent=1))
    return res

if __name__ == "__main__":
    main()
