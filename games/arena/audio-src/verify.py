#!/usr/bin/env python3
"""Independent verification of the delivered .ogg files (decodes them; does not reuse generate.py code).
Usage: python3 verify.py [dir]  -> prints a markdown table and writes measurements.md"""
import re, subprocess, sys, tempfile, os, warnings
from pathlib import Path
import numpy as np
from scipy.io import wavfile
warnings.filterwarnings("ignore")
D = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent
MUSIC = ["lobby", "round-base", "round-30s", "round-final10"]
OTHER = ["stinger-tiempo-extra", "win", "lose", "pinata-fuse", "pinata-pop", "stained", "pickup", "sabotage-use", "event-alert"]

def ebur(p):
    r = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", str(p), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    t = r.stderr.split("Summary:")[-1]
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", t).group(1)), float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", t).group(1))

def dec(p):
    f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False); f.close()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-c:a", "pcm_f32le", f.name])
    sr, d = wavfile.read(f.name); os.unlink(f.name); return sr, d.T.astype(np.float64)

rows = []; ok = True
for n in MUSIC + OTHER:
    p = D / f"{n}.ogg"; I, tp = ebur(p); sr, x = dec(p)
    peak = 20 * np.log10(np.abs(x).max())
    rng = (-16, -14) if n in MUSIC else ((-13.5, -10.5) if n not in ("win", "lose") else (-16, -13))
    row = dict(n=n, I=I, tp=tp, peak=peak, ns=x.shape[1], dur=x.shape[1] / sr)
    pass_ = rng[0] <= I <= rng[1] and tp <= -1.0
    if n in MUSIC:
        jump = float(np.abs(x[:, 0] - x[:, -1]).max())
        st = np.abs(np.diff(x, axis=1)); p999 = float(np.percentile(st, 99.9)); med = float(np.median(st))
        row.update(jump=jump, p999=p999, med=med)
        pass_ &= jump <= p999
        sp = np.abs(np.fft.rfft(x.mean(axis=0)))
        fr = np.fft.rfftfreq(x.shape[1], 1 / sr)
        row["cent"] = float((sp * fr).sum() / sp.sum())
        row["hi"] = float(100 * (sp[fr > 3000] ** 2).sum() / (sp ** 2).sum())
    row["ok"] = pass_; ok &= pass_; rows.append(row)
layers = [r for r in rows if r["n"].startswith("round-")]
same = len({r["ns"] for r in layers}) == 1
L = ["| File | Type | Integrated LUFS | True peak dBTP | Sample peak dBFS | Duration s (samples) | Seam jump | p99.9 step | Result |", "|---|---|---|---|---|---|---|---|---|"]
for r in rows:
    t = "music loop" if r["n"] in MUSIC else ("stinger" if r["n"] in ("stinger-tiempo-extra", "win", "lose") else "SFX")
    sj = f'{r["jump"]:.4f}' if "jump" in r else "n/a"; sp9 = f'{r["p999"]:.4f}' if "jump" in r else "n/a"
    L.append(f'| {r["n"]}.ogg | {t} | {r["I"]:.1f} | {r["tp"]:.1f} | {r["peak"]:.1f} | {r["dur"]:.3f} ({r["ns"]}) | {sj} | {sp9} | {"PASS" if r["ok"] else "FAIL"} |')
L += ["", f"Round layers identical length: {'PASS' if same else 'FAIL'} ({', '.join(str(r['ns']) for r in layers)} samples).", "",
      "Intensity proxy of the layers (spectral centroid / % energy above 3 kHz):", "", "| Layer | Centroid Hz | Energy >3 kHz % |", "|---|---|---|"]
for r in layers: L.append(f'| {r["n"]} | {r["cent"]:.0f} | {r["hi"]:.2f} |')
out = "\n".join(L); print(out); (D / "measurements.md").write_text(out + "\n")
print("ALL PASS" if ok and same else "SOMETHING FAILED"); sys.exit(0 if ok and same else 1)
