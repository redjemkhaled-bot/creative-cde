# Placeholder files: replace these with your real ones

The app works with these stand-in files. They only change how things *look*;
timings, sizes and positions are already the real v1 values.

| File | What it is now | Replace with |
|---|---|---|
| `brands/redjem/logo_vertical.svg` | Simple navy "R" + REDJEM STUDIO | Your real vertical logo (SVG or PNG) |
| `brands/redjem/pattern.png` | Generated green gradient with faint R letters | Your green R-pattern background |
| `brands/redjem/products/products-11.png` … `products-17.png` | Drawn shapes labelled "PLACEHOLDER 11" etc. | Your transparent product mockups (PNG) |
| `test/Younes_Cadeaux_.mp4` | Colour bars, 25.2 s + 3 s of black and silence | The real Younes video |
| `reference/screenshots/` | empty | The 10 style-reference frames (optional) |

Already real: `brand.json` (colours, fonts, handle, phone, taglines, services),
the fonts (Poppins + Cairo from Google Fonts, licence in `fonts/OFL.txt`) and
`reference/render.py`.

## Easiest way, inside the installed app

1. Brand menu (top right) → **＋ New brand…** → *Copy of Redjem Studio*.
2. Choose your real **logo**, **background pattern** and **product images**
   (keep the names `products-11.png` … `products-17.png` so the v1 demo uses them).
3. Name it, for example "Redjem Studio", and click **Create brand**. It's saved in
   your user folder and stays when you update the app.

## Or in the repository

Replace each file above with one of the **same name in the same folder** and
push. The next installer build will include them.
