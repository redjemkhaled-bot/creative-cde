# Reel Captioner

Desktop app (Windows / macOS) that turns a vertical talking-head video and a
script into a finished, on-brand Instagram Reel: word-by-word Arabic (Darija) +
French captions, floating product mockups, zoom punches, UI cards, service
pills, sparkles, logo card, watermark, a branded end card and sound effects.

The look is a faithful port of the approved v1 renderer
([reference/render.py](reference/render.py)). Brands are folders with a
`brand.json`; switching brand re-skins everything.

## Install

Every push builds installers automatically:

1. GitHub → **Actions** tab → latest **Build installers** run → **Artifacts**.
2. Download **Reel-Captioner-Windows** (or **-Mac**), unzip, run the installer.
   - Windows: if SmartScreen warns, click **More info → Run anyway** (not code-signed yet).
   - Mac (Apple Silicon): right-click the app → **Open** the first time.

## Making a reel, step by step

1. **Open video…** (or drag the file onto the window). A black + silent ending is
   detected and cut automatically; drag the yellow handles to change in/out.
2. **Script** (left): paste the script.
   - `*word*` or `*several words*` → keyword (gold, bigger, glowing)
   - new line or `|` → new caption screen
   - commas and periods are hidden; French is shown in CAPITALS (brand setting)
3. **Timing**:
   - Quick: type a start → end time for each screen; words are spread automatically.
   - Exact: press **⏺ Tap to time** (or `T`). The video plays (choose 0.5× / 0.75× / 1×);
     press **Space** at the start of every word, **Backspace** to undo the last tap,
     **Esc** to stop. Press Tap to time again to continue where you stopped.
   - Fine-tune on the **timeline**: drag a word block to nudge it (it snaps to the
     speech; hold **Alt** to stop snapping), drag the white edge of a screen's last
     word to change when it ends, double-click a word to make it automatic again.
4. **Events** tab (right): add products, zoom punches/holds, the UI card, pills
   (or **Service pills** for all brand services), sparkles and the logo card at the
   playhead. Drag them on the timeline to change timing, drag their edges to change
   length, and drag them on the preview to move them. The **End card** and
   **Watermark** are set up at the bottom of the same tab.
5. **Sound** tab: pop / whoosh volumes, or your own WAV/MP3 files.
6. **Export…** (`Ctrl+E`):
   - **Finished reel (MP4)**: 1080×1920, 30 fps, H.264 + AAC, saved as `<name>_vN.mp4`
   - **Overlay only (ProRes 4444 .mov)**: transparent, for DaVinci Resolve / Premiere
   - **Captions only (SRT)**

**Load v1 demo** (Script panel) fills in the whole approved Younes reel. The same
project is in [test/younes_v1.project.json](test/younes_v1.project.json): use
**Open project…** and keep it next to `Younes_Cadeaux_.mp4`.

Projects save as `.reel.json` (**Save**, `Ctrl+S`), autosave every couple of
seconds, and the last session reopens on start. Undo/redo: `Ctrl+Z` / `Ctrl+Shift+Z`.

## Keyboard

| Key | Action |
|---|---|
| Space | Play / pause (stamps the next word while tapping) |
| T | Start / continue tap-to-time |
| Backspace / Esc | (tapping) undo last tap / stop |
| ← / → | Previous / next frame (Shift = 1 s) |
| I / O | Set in / out point |
| Delete | Delete the selected event |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S / Ctrl+O / Ctrl+E | Save / open project / export |
| Ctrl + mouse wheel | Zoom the timeline |

## Brands

Brand menu (top right) → **＋ New brand…**: start from a copy of the current brand
(only replace what you choose: logo, pattern, fonts, product PNGs, colours,
handle, phone, taglines, services) or from blank. New brands live in your user
folder (**Open brands folder** in the same menu), so they survive app updates. A
brand with the same id as a bundled one replaces it. Any `.ttf`/`.otf` font works.

Placeholder files that ship with the Redjem brand are listed in
[PLACEHOLDERS.md](PLACEHOLDERS.md).

## For developers

```
npm install
npm run dev        # run with hot reload
npm test           # unit tests (markup, layout, timing, zoom, SFX, SRT, v1 project)
npm run typecheck
npm run dist       # build an installer for this OS into dist/
```

- `src/core`: pure shared logic. `drawFrame()` is the one drawing function used by
  both preview and export; effects and captions are ports of `render.py`.
- `src/main`: Electron main process: ffmpeg probe / dead-tail detection, export
  pipeline (ffmpeg decode → renderer `drawFrame` → ffmpeg encode), projects, brands.
- `src/preload`: IPC bridge. `src/renderer`: React UI.

Test hooks: `electron . --open <video>` / `--project <file>`;
`RC_SCREENSHOT=out.png` (+ `RC_FRAME`, `RC_TIME`, `RC_PLAY`, `RC_DEMO`, `RC_EVAL`)
saves a screenshot and quits; `RC_EXPORT=out.mp4` (`RC_EXPORT_KIND=overlay`)
exports headless.
