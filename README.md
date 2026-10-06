# Reel Captioner

Desktop app (Windows / macOS) that turns a vertical talking-head video and a
script into an on-brand Instagram Reel: word-by-word Arabic + French captions,
product pop-ins, zooms, end card and sound effects. Brands are folders under
`brands/` (see `brands/redjem/brand.json`).

Placeholder files are listed in [PLACEHOLDERS.md](PLACEHOLDERS.md).

## Get the app (no programming needed)

Every push builds installers automatically:

1. Open the repository on GitHub → **Actions** tab → latest **Build installers** run.
2. Scroll to **Artifacts** and download **Reel-Captioner-Windows** or **Reel-Captioner-Mac**.
3. Unzip it and run the installer.
   - Windows: if SmartScreen warns, click **More info → Run anyway** (the app isn't code-signed yet).
   - Mac (Apple Silicon): right-click the app → **Open** the first time (not signed yet).

## Status

| Phase | | |
|---|---|---|
| 0 | Setup, placeholder assets | ✅ |
| 1 | Open video, preview, play/scrub, dead-tail detection, trim | ✅ |
| 2 | Captions | next |
| 3 | Tap-to-time + timeline | |
| 4 | Export MP4 | |
| 5 | Events, end card, SFX, v1 acceptance test | |
| 6 | Brands + wizard | |
| 7 | SRT, ProRes overlay, presets | |

## Keyboard (Phase 1)

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Previous / next frame (hold Shift for 1 s) |
| I / O | Set in / out point at the playhead |
| Home / End | Jump to in / out point |

## For developers

```
npm install
npm run dev        # run the app with hot reload
npm test           # unit tests
npm run typecheck
npm run dist       # build an installer for this OS into dist/
```

Layout: `src/core` is pure shared logic (including `drawFrame`, used by both
preview and export), `src/main` is the Electron main process (ffmpeg, files),
`src/preload` is the IPC bridge, `src/renderer` is the React UI.

Test hooks: `electron . --open <video>` loads a video on start;
`RC_SCREENSHOT=out.png` saves a screenshot and quits (`RC_TIME`, `RC_PLAY` set
the start time / start playback).
