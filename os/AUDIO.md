# IRN OS — system-wide audio EQ

A free, configurable equalizer for **all** audio (radio, media, the browser),
via **EasyEffects** on PipeWire — the same pipeline the OS already uses
(`wireplumber` + `pipewire-pulse`).

## What ships

- `easyeffects` (package) — a parametric/graphic EQ (and more) that inserts into
  the PipeWire output.
- A starter preset at `/etc/skel/.config/easyeffects/output/IRN.json` — a gentle
  10-band curve (slight low-end + presence/air lift, small ~500 Hz dip).
- Autostart (labwc): EasyEffects runs **headless** as a service and loads the
  `IRN` preset:
  ```
  easyeffects --gapplication-service &
  ( sleep 2; easyeffects -l IRN ) &
  ```

## Configure it

- **Edit the preset file** directly: `~/.config/easyeffects/output/IRN.json`
  (per-band `gain`/`frequency`/`q`). Re-load with `easyeffects -l IRN`.
- **Or the GUI** (desktop profile only — the sealed kiosk has no launcher):
  open EasyEffects, adjust the Equalizer, and save the preset as `IRN` to keep
  the autoload working. Add other effects (limiter, bass enhancer, convolver)
  from the same window; they persist in the preset.

## Notes

- The preset **name** must stay `IRN` for `easyeffects -l IRN` to find it (the
  name is the filename without `.json`).
- This is the local-EQ half of the Reading-Room radio split: the public site
  radio has no EQ (cross-origin media is silenced by `createMediaElementSource`);
  a system EQ like this shapes the *local* playback instead, no proxy needed.
- **Unverified:** never built or booted — confirm the preset loads via the
  EasyEffects GUI on a real boot before relying on the curve.
