# F0 results: latency spike

Date: ____ · Router/band: ____ · Phones: iPhone ____ (iOS __), Android ____ · Players: 2

## How to run

1. `npm run dev` (prints the screen URL, the controller URL and a QR).
2. Open the screen URL in Chrome on the Mac, foreground tab.
3. On each phone scan the QR (or type the controller URL), enter a name, join.
4. Play 2+ minutes. Press "Export CSV" on the screen, then `npm run report -- <file.csv>` for p50/p95/p99/max.

Metrics: `rtt` = phone to server and back (ping every 1 s). `lag` = touch (button press) to the frame drawn on the Mac, using a clock offset estimated from the pings (lowest-RTT sample of the last 10, assumes symmetric paths; error is roughly half the path asymmetry).

## Checklist

| # | Check | Result (ok / fail) | Notes |
|---|---|---|---|
| 1 | Phones connect (Mac firewall, router client isolation) | | |
| 2 | Multitouch: joystick and button at once; no scroll/zoom on iPhone | | |
| 3 | iPhone screen stays on for 10 min playing over HTTP | | |
| 4 | Reconnect: lock/unlock the phone; does it recover its circle? | | |

## Measurements (2 min per player)

| Player | Device | rtt p50 | rtt p95 | rtt max | spikes > 150 ms | lag p50 | lag p95 | lag max |
|---|---|---|---|---|---|---|---|---|
| 1 | iPhone | | | | | | | |
| 2 | Android | | | | | | | |

Feel test (chase, dodge, tap to a metronome): sticky? ____ jumps/teleports? ____ disconnects? ____

## Go / no-go

| Result | Decision | Applies? |
|---|---|---|
| p95 RTT < 50 ms, no spikes > 150 ms in 2 min, feels fluid | **Go**: continue to F1 | |
| p95 between 50 and 100 ms or isolated spikes | **Go with adjustment**: 5 GHz, 500 ms pings, or Mac Internet Sharing as own network | |
| Repeated spikes > 150 ms that persist after adjusting | Try plan B WebRTC/UDP (Geckos.io) in a 2 h spike; if it fails too, **no-go** for real-time action | |

Decision: ____
