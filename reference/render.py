import sys, math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
SRC = "/mnt/user-data/uploads/Younes_Cadeaux_.mp4"
UP = "/mnt/user-data/uploads/"
CUT = 25.2          # end of real content
END_CARD = 24.10    # end card starts
TOTAL = 26.2        # with end-card hold
NAVY = (17, 35, 53); MINT = (135, 201, 183); GOLD = (242, 200, 63); WHITE = (255, 255, 255)

F_AR = "/home/claude/fonts/Cairo.ttf"
F_LAT = "/home/claude/fonts/Poppins-ExtraBold.ttf"
F_LAT2 = "/home/claude/fonts/Poppins-SemiBold.ttf"

def font_ar(sz):
    f = ImageFont.truetype(F_AR, sz); f.set_variation_by_name('Black'); return f

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out_back(t):
    c1 = 1.70158; c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
def ease_out_cubic(t): return 1 - (1 - t) ** 3
def ease_in_out(t): return 0.5 - 0.5 * math.cos(math.pi * t)

def is_arabic(s): return any('\u0600' <= c <= '\u06FF' for c in s)

# ---------------------------------------------------------------- captions
# (t0, t1, [(token, keyword)])  timings estimated from the speech envelope
CHUNKS = [
    (0.40, 2.05, [("سلعة", 0), ("من", 0), ("طرف", 0), ("لطرف", 0)]),
    (2.15, 3.45, [("حاب", 0), ("تبان", 0), ("في", 0), ("LA FOIRE", 1), ("تاعك", 0)]),
    (3.50, 4.54, [("تبان", 0), ("QUALITÉ", 1), ("مليحة", 0)]),
    (4.87, 6.10, [("LES SACS", 1), ("LES DÉPLIANTS", 1)]),
    (6.31, 8.14, [("LES CARTES VISITE", 1), ("LES STYLOS", 1)]),
    (8.30, 9.40, [("وعفايس", 0), ("بزاف", 0), ("وحد", 0), ("أخرين", 0)]),
    (9.56, 10.85, [("عندك", 0), ("حتى", 0), ("LES AGENDAS", 1)]),
    (11.05, 12.23, [("وعندك", 0), ("CONCEPTION", 1), ("ولا", 0), ("ما", 0), ("عندكش؟", 0)]),
    (12.36, 13.20, [("ما", 0), ("تحيرش", 0), ("روحك", 0)]),
    (13.29, 14.56, [("L'ÉQUIPE INFOGRAPHIE", 1), ("تاعنا", 0), ("راهم", 0), ("في", 0), ("الخدمة", 0)]),
    (14.70, 15.20, [("يخدمولك", 0), ("LA CONCEPTION", 1)]),
    (15.43, 16.34, [("ما", 0), ("شاء", 0), ("الله", 0)]),
    (16.63, 18.13, [("تبريزونتي", 0), ("فيها", 0), ("المنتجات", 0), ("تاعك", 0)]),
    (18.22, 19.61, [("ولا", 0), ("الخدمات", 0), ("تاعك", 0), ("بأحسن", 1), ("صورة", 1)]),
    (19.96, 20.80, [("مرحبا", 0), ("بكم", 0), ("خاوتي", 0)]),
    (20.87, 22.15, [("عند", 0), ("REDJEM STUDIO", 1)]),
    (22.25, 23.15, [("MEILLEURE QUALITÉ", 1)]),
    (23.20, 24.10, [("MEILLEUR PRIX", 1)]),
]
CAP_Y = 1330
MAXW = 960

def render_token(text, kw):
    ar = is_arabic(text)
    scale = 1.12 if kw else 1.0
    if ar:
        f = font_ar(int(84 * scale)); kwargs = dict(direction='rtl', language='ar')
    else:
        f = ImageFont.truetype(F_LAT, int(70 * scale)); kwargs = {}
    col = GOLD if kw else WHITE
    l, t, r, b = f.getbbox(text, stroke_width=4, **kwargs)
    pad = 40
    w, h = r - l + 2 * pad, b - t + 2 * pad
    base = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.text((pad - l, pad - t), text, font=f, fill=col + (255,), stroke_width=4, stroke_fill=NAVY + (255,), **kwargs)
    # soft shadow + glow
    a = base.getchannel("A")
    sh = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sh.putalpha(a.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.85)))
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(sh, (0, 6))
    if kw:
        glow = Image.new("RGBA", (w, h), GOLD + (0,))
        glow.putalpha(a.filter(ImageFilter.GaussianBlur(18)).point(lambda v: int(v * 0.55)))
        out.alpha_composite(glow)
    out.alpha_composite(base)
    return out, pad

def layout_chunk(chunk):
    t0, t1, toks = chunk
    rtl = any(is_arabic(t) for t, _ in toks)
    sprites = [render_token(t, k) for t, k in toks]
    widths = [s.width - 2 * p for s, p in sprites]
    gap = 26
    total = sum(widths) + gap * (len(widths) - 1)
    # split into lines if needed
    lines = [list(range(len(toks)))]
    if total > MAXW and len(toks) > 1:
        best = None
        for k in range(1, len(toks)):
            a = sum(widths[:k]) + gap * (k - 1); b = sum(widths[k:]) + gap * (len(toks) - k - 1)
            sc = max(a, b)
            if best is None or sc < best[0]: best = (sc, k)
        k = best[1]; lines = [list(range(k)), list(range(k, len(toks)))]
    # word timing ∝ length
    lens = [max(2, len(t)) for t, _ in toks]
    span = (t1 - t0) * 0.9
    times, acc = [], t0
    for L in lens:
        times.append(acc); acc += span * L / sum(lens)
    placed = []
    lh = 118
    y0 = CAP_Y - (len(lines) - 1) * lh / 2
    for li, idxs in enumerate(lines):
        lw = sum(widths[i] for i in idxs) + gap * (len(idxs) - 1)
        x = W / 2 + lw / 2 if rtl else W / 2 - lw / 2
        for i in idxs:
            cx = x - widths[i] / 2 if rtl else x + widths[i] / 2
            x = x - widths[i] - gap if rtl else x + widths[i] + gap
            placed.append(dict(spr=sprites[i][0], cx=cx, cy=y0 + li * lh, t=times[i]))
    return placed

CAPS = []
for i, c in enumerate(CHUNKS):
    nxt = CHUNKS[i + 1][0] if i + 1 < len(CHUNKS) else END_CARD
    CAPS.append(dict(t0=c[0], end=min(nxt - 0.02, c[1] + 0.35), words=layout_chunk(c)))

def paste_scaled(canvas, spr, cx, cy, s, alpha=1.0, rot=0.0):
    if s <= 0.02 or alpha <= 0.01: return
    w, h = max(1, int(spr.width * s)), max(1, int(spr.height * s))
    im = spr.resize((w, h), Image.BILINEAR) if (w, h) != spr.size else spr
    if rot: im = im.rotate(rot, resample=Image.BILINEAR, expand=True)
    if alpha < 1:
        im = im.copy(); im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2))) if (
        0 <= int(cx - im.width / 2) and 0 <= int(cy - im.height / 2) and
        int(cx - im.width / 2) + im.width <= W and int(cy - im.height / 2) + im.height <= H) else safe_paste(canvas, im, int(cx - im.width / 2), int(cy - im.height / 2))

def safe_paste(canvas, im, x, y):
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + im.width), min(H, y + im.height)
    if x1 <= x0 or y1 <= y0: return
    canvas.alpha_composite(im.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))

def draw_captions(canvas, t):
    for c in CAPS:
        if not (c["t0"] - 0.05 <= t < c["end"] + 0.12): continue
        fade = 1.0 if t < c["end"] else clamp(1 - (t - c["end"]) / 0.12)
        for wd in c["words"]:
            dt = t - wd["t"]
            if dt < 0: continue
            p = clamp(dt / 0.2)
            s = 0.55 + 0.45 * ease_out_back(p)
            paste_scaled(canvas, wd["spr"], wd["cx"], wd["cy"] + (1 - ease_out_cubic(p)) * 25, s, alpha=clamp(p * 3) * fade)

# ---------------------------------------------------------------- products
def load_product(n, width):
    im = Image.open(f"{UP}products-{n}.png").convert("RGBA")
    bb = im.getchannel("A").getbbox(); im = im.crop(bb)
    im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
    pad = 40
    out = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0))
    a = Image.new("L", out.size, 0); a.paste(im.getchannel("A"), (pad, pad))
    sh.putalpha(a.filter(ImageFilter.GaussianBlur(16)).point(lambda v: int(v * 0.55)))
    out.alpha_composite(sh, (8, 18)); out.alpha_composite(im, (pad, pad))
    return out

# (product, width, t_in, t_out, x, y, side, base_rot)
PRODS = [
    (11, 380, 0.25, 1.80, 200, 1010, -1, -8),
    (13, 300, 0.40, 1.80, 880, 960, 1, 6),
    (13, 320, 4.87, 6.20, 880, 990, 1, 5),
    (14, 340, 6.31, 7.45, 200, 1000, -1, -6),
    (15, 380, 7.36, 8.40, 870, 1000, 1, 4),
    (16, 360, 8.30, 9.50, 210, 980, -1, -5),
    (17, 360, 8.45, 9.50, 870, 1060, 1, 5),
    (11, 420, 9.56, 10.95, 215, 1010, -1, -7),
    (12, 400, 9.70, 10.95, 865, 990, 1, 7),
]
PROD_SPR = {}
for p in PRODS:
    key = (p[0], p[1])
    if key not in PROD_SPR: PROD_SPR[key] = load_product(*key)

def anim_in_out(t, t_in, t_out, din=0.38, dout=0.25):
    if t < t_in or t > t_out + dout: return None
    if t < t_in + din: return ("in", (t - t_in) / din)
    if t > t_out: return ("out", (t - t_out) / dout)
    return ("hold", 1.0)

def draw_products(canvas, t):
    for (n, w, ti, to, x, y, side, rot) in PRODS:
        st = anim_in_out(t, ti, to)
        if not st: continue
        spr = PROD_SPR[(n, w)]
        ph, p = st
        bob = 14 * math.sin(2 * math.pi * (t - ti) / 1.7)
        sway = 3 * math.sin(2 * math.pi * (t - ti) / 2.3)
        if ph == "in":
            e = ease_out_back(p); s = 0.25 + 0.75 * e
            xx = x + side * (1 - ease_out_cubic(p)) * 260; a = clamp(p * 2.5)
            paste_scaled(canvas, spr, xx, y + bob, s, a, rot + sway + side * (1 - p) * 25)
        elif ph == "out":
            paste_scaled(canvas, spr, x, y + bob, 1 - 0.6 * p, 1 - p, rot + sway)
        else:
            paste_scaled(canvas, spr, x, y + bob, 1.0, 1.0, rot + sway)

# ---------------------------------------------------------------- UI card (conception)
def rounded(size, r, fill):
    im = Image.new("RGBA", size, (0, 0, 0, 0)); ImageDraw.Draw(im).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], r, fill=fill); return im

def with_shadow(im, blur=22, op=0.45, off=(0, 16)):
    pad = 60
    out = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    a = Image.new("L", out.size, 0); a.paste(im.getchannel("A"), (pad, pad))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0)); sh.putalpha(a.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * op)))
    out.alpha_composite(sh, off); out.alpha_composite(im, (pad, pad)); return out

PATTERN = Image.open("/home/claude/fig/a1.png").convert("RGBA")

def build_card():
    cw, ch = 800, 360
    card = rounded((cw, ch), 44, (255, 255, 255, 250))
    tile_w, tile_h = 228, 270
    for i, n in enumerate([11, 14, 16]):
        tile = PATTERN.resize((tile_w, tile_h), Image.LANCZOS).copy()
        m = rounded((tile_w, tile_h), 26, (0, 0, 0, 255)).getchannel("A"); tile.putalpha(m)
        pr = Image.open(f"{UP}products-{n}.png").convert("RGBA"); pr = pr.crop(pr.getchannel("A").getbbox())
        sc = min((tile_w - 30) / pr.width, (tile_h - 40) / pr.height); pr = pr.resize((int(pr.width * sc), int(pr.height * sc)), Image.LANCZOS)
        tile.alpha_composite(pr, ((tile_w - pr.width) // 2, (tile_h - pr.height) // 2))
        ImageDraw.Draw(tile).rounded_rectangle([0, 0, tile_w - 1, tile_h - 1], 26, outline=NAVY + (255,), width=4)
        card.alpha_composite(tile, (34 + i * (tile_w + 25), 56))
    card = with_shadow(card)
    # badge
    f = ImageFont.truetype(F_LAT, 40); txt = "CONCEPTION"
    bw = int(f.getlength(txt)) + 110
    badge = rounded((bw, 78), 39, NAVY + (255,))
    d = ImageDraw.Draw(badge); d.ellipse([22, 25, 50, 53], fill=GOLD + (255,))
    d.text((66, 39), txt, font=f, fill=WHITE + (255,), anchor="lm")
    return card, with_shadow(badge, 12, 0.4, (0, 8))

CARD, BADGE = build_card()
CARD_T = (13.25, 15.30); CARD_POS = (540, 880)

def draw_card(canvas, t):
    st = anim_in_out(t, *CARD_T, din=0.4, dout=0.25)
    if not st: return
    ph, p = st
    s = 0.5 + 0.5 * ease_out_back(p) if ph == "in" else (1 - 0.3 * p if ph == "out" else 1)
    a = clamp(p * 2.5) if ph == "in" else (1 - p if ph == "out" else 1)
    fl = 8 * math.sin(2 * math.pi * (t - CARD_T[0]) / 2.0)
    paste_scaled(canvas, CARD, CARD_POS[0], CARD_POS[1] + fl, s, a)
    tb = t - 0.15
    st2 = anim_in_out(tb, CARD_T[0], CARD_T[1] - 0.15, din=0.35, dout=0.2)
    if st2:
        ph2, p2 = st2
        s2 = 0.3 + 0.7 * ease_out_back(p2) if ph2 == "in" else (1 - 0.4 * p2 if ph2 == "out" else 1)
        a2 = clamp(p2 * 3) if ph2 == "in" else (1 - p2 if ph2 == "out" else 1)
        paste_scaled(canvas, BADGE, CARD_POS[0], CARD_POS[1] - 200 * s + fl, s2, a2)

# ---------------------------------------------------------------- service pills
def build_pill(txt):
    f = ImageFont.truetype(F_LAT2, 40)
    w = int(f.getlength(txt)) + 100
    p = rounded((w, 82), 18, (20, 30, 40, 235))
    d = ImageDraw.Draw(p); d.ellipse([24, 27, 52, 55], fill=MINT + (255,))
    d.text((68, 41), txt, font=f, fill=WHITE + (255,), anchor="lm")
    ImageDraw.Draw(p).rounded_rectangle([0, 0, w - 1, 81], 18, outline=(255, 255, 255, 60), width=2)
    return with_shadow(p, 14, 0.5, (0, 10))

PILLS = [("Advertising", 16.70, 330, 860), ("Photography", 17.25, 760, 860),
         ("Interior Design", 18.10, 330, 975), ("Web Development", 18.65, 750, 975)]
PILL_SPR = [build_pill(p[0]) for p in PILLS]
PILL_OUT = 19.62

def draw_pills(canvas, t):
    for spr, (txt, ti, x, y) in zip(PILL_SPR, PILLS):
        st = anim_in_out(t, ti, PILL_OUT, din=0.3, dout=0.22)
        if not st: continue
        ph, p = st
        s = 0.4 + 0.6 * ease_out_back(p) if ph == "in" else (1 - 0.3 * p if ph == "out" else 1)
        a = clamp(p * 3) if ph == "in" else (1 - p if ph == "out" else 1)
        paste_scaled(canvas, spr, x, y + 5 * math.sin(2 * math.pi * (t - ti) / 1.9), s, a)

# ---------------------------------------------------------------- sparkles
def build_sparkle(sz, col):
    S = sz * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = S / 2; r = S / 2 - 2; k = S * 0.09
    d.polygon([(c, c - r), (c + k, c - k), (c + r, c), (c + k, c + k), (c, c + r), (c - k, c + k), (c - r, c), (c - k, c - k)], fill=col + (255,))
    im = im.resize((sz, sz), Image.LANCZOS)
    g = Image.new("RGBA", (sz * 2, sz * 2), (0, 0, 0, 0)); g.alpha_composite(im, (sz // 2, sz // 2))
    glow = Image.new("RGBA", g.size, col + (0,)); glow.putalpha(g.getchannel("A").filter(ImageFilter.GaussianBlur(sz / 6)))
    glow.alpha_composite(g); return glow

SPK = build_sparkle(70, GOLD); SPK_W = build_sparkle(50, WHITE)
SPARKS = []  # (t, x, y, sprite)
rng = np.random.default_rng(7)
for (t0, t1) in [(15.45, 16.30), (18.95, 19.60), (22.25, 24.05)]:
    for i in range(7):
        SPARKS.append((t0 + (t1 - t0) * i / 7, float(rng.uniform(120, 960)), float(CAP_Y + rng.choice([-1, 1]) * rng.uniform(95, 170)), SPK if i % 2 == 0 else SPK_W))

def draw_sparkles(canvas, t):
    for (ts, x, y, spr) in SPARKS:
        dt = t - ts
        if 0 <= dt <= 0.7:
            p = dt / 0.7; s = math.sin(math.pi * p)
            paste_scaled(canvas, spr, x, y, 0.3 + 0.9 * s, s, rot=p * 90)

# ---------------------------------------------------------------- logo card + watermark
LOGO_NAVY = Image.open("/home/claude/assets/logo_navy.png").convert("RGBA")
def build_logo_card():
    lg = LOGO_NAVY.resize((250, int(LOGO_NAVY.height * 250 / LOGO_NAVY.width)), Image.LANCZOS)
    c = rounded((360, lg.height + 90), 50, (255, 255, 255, 250)); c.alpha_composite(lg, (55, 45))
    return with_shadow(c)
LOGO_CARD = build_logo_card(); LOGO_T = (20.87, END_CARD - 0.1)

def draw_logo_card(canvas, t):
    st = anim_in_out(t, *LOGO_T, din=0.45, dout=0.2)
    if not st: return
    ph, p = st
    s = 0.3 + 0.7 * ease_out_back(p) if ph == "in" else (1 - 0.3 * p if ph == "out" else 1)
    a = clamp(p * 3) if ph == "in" else (1 - p if ph == "out" else 1)
    rot = (1 - p) * -12 if ph == "in" else 0
    paste_scaled(canvas, LOGO_CARD, 520, 390 + 10 * math.sin(2 * math.pi * (t - LOGO_T[0]) / 2.0), s, a, rot)

def build_watermark():
    f = ImageFont.truetype(F_LAT2, 30); txt = "@Redjem_Studio"
    w = int(f.getlength(txt)) + 30
    im = Image.new("RGBA", (max(w, 120) + 40, 150), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cx = im.width // 2
    d.rounded_rectangle([cx - 28, 14, cx + 28, 70], 16, outline=WHITE + (255,), width=6)
    d.ellipse([cx - 13, 29, cx + 13, 55], outline=WHITE + (255,), width=6)
    d.ellipse([cx + 13, 21, cx + 20, 28], fill=WHITE + (255,))
    d.text((cx, 105), txt, font=f, fill=WHITE + (255,), anchor="mm")
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); sh.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(6)).point(lambda v: int(v * 0.7)))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0)); out.alpha_composite(sh, (0, 3)); out.alpha_composite(im)
    out.putalpha(out.getchannel("A").point(lambda v: int(v * 0.9)))
    return out
WM = build_watermark()

# ---------------------------------------------------------------- end card
def build_endcard():
    bg = PATTERN.resize((int(PATTERN.width * H / PATTERN.height), H), Image.LANCZOS)
    bg = bg.crop(((bg.width - W) // 2, 0, (bg.width - W) // 2 + W, H)).convert("RGBA")
    lg = LOGO_NAVY.resize((440, int(LOGO_NAVY.height * 440 / LOGO_NAVY.width)), Image.LANCZOS)
    layers = {"bg": bg, "logo": lg}
    f1 = ImageFont.truetype(F_LAT, 52)
    t1 = Image.new("RGBA", (1000, 160), (0, 0, 0, 0)); d = ImageDraw.Draw(t1)
    d.text((500, 40), "MEILLEURE QUALITÉ", font=f1, fill=NAVY + (255,), anchor="mm")
    d.text((500, 115), "MEILLEUR PRIX", font=f1, fill=GOLD + (255,), anchor="mm", stroke_width=3, stroke_fill=NAVY + (255,))
    layers["tag"] = t1
    f2 = ImageFont.truetype(F_LAT2, 40)
    for key, txt in [("ig", "@Redjem_Studio"), ("ph", "0558 51 21 02")]:
        w = int(f2.getlength(txt)) + 90
        p = rounded((w, 84), 42, NAVY + (255,)); dd = ImageDraw.Draw(p)
        dd.ellipse([24, 28, 52, 56], fill=MINT + (255,)); dd.text((66, 42), txt, font=f2, fill=WHITE + (255,), anchor="lm")
        layers[key] = with_shadow(p, 12, 0.35, (0, 8))
    return layers
EC = build_endcard()
EC_PRODS = [(15, 300, 190, 1660, -1, -10, 0.55), (13, 230, 900, 1640, 1, 8, 0.7), (16, 300, 880, 330, 1, 8, 0.85), (11, 260, 170, 360, -1, -8, 1.0)]
for p in EC_PRODS:
    if (p[0], p[1]) not in PROD_SPR: PROD_SPR[(p[0], p[1])] = load_product(p[0], p[1])

def draw_endcard(canvas, t):
    dt = t - END_CARD
    if dt < 0: return
    p = clamp(dt / 0.45)
    # circular reveal from center
    r = int(ease_in_out(p) * 1150)
    mask = Image.new("L", (W, H), 0); ImageDraw.Draw(mask).ellipse([540 - r, 900 - r, 540 + r, 900 + r], fill=255)
    layer = EC["bg"].copy(); layer.putalpha(mask)
    canvas.alpha_composite(layer)
    def item(spr, x, y, delay, dur=0.4):
        q = clamp((dt - delay) / dur)
        if q <= 0: return
        paste_scaled(canvas, spr, x, y, 0.4 + 0.6 * ease_out_back(q), clamp(q * 3))
    for (n, w, x, y, side, rot, dl) in EC_PRODS:
        q = clamp((dt - dl) / 0.4)
        if q > 0:
            paste_scaled(canvas, PROD_SPR[(n, w)], x + side * (1 - ease_out_cubic(q)) * 200, y + 12 * math.sin(2 * math.pi * dt / 1.8), 0.4 + 0.6 * ease_out_back(q), clamp(q * 3), rot)
    item(EC["logo"], 540, 760 + 6 * math.sin(2 * math.pi * dt / 2.2), 0.25, 0.5)
    item(EC["tag"], 540, 1130, 0.5)
    item(EC["ig"], 540, 1300, 0.7)
    item(EC["ph"], 540, 1410, 0.85)

# ---------------------------------------------------------------- camera zoom punches
PUNCHES = [(4.50, 0.45, 1.07), (11.0, 0.40, 1.05), (20.85, 0.40, 1.05)]
HOLD = (9.50, 10.95, 1.10)
def zoom_at(t):
    z = 1.0
    for (t0, d, a) in PUNCHES:
        if t0 <= t <= t0 + d:
            p = (t - t0) / d; z = max(z, 1 + (a - 1) * max(0.0, math.sin(math.pi * p)) ** 0.7)
    t0, t1, a = HOLD
    if t0 <= t <= t1:
        p = min(1, (t - t0) / 0.25, (t1 - t) / 0.25); z = max(z, 1 + (a - 1) * ease_in_out(clamp(p)))
    return z

def apply_zoom(img, z, cy=820):
    if z <= 1.001: return img
    w, h = W / z, H / z
    x0 = (W - w) / 2; y0 = clamp(cy - h / 2, 0, H - h)
    return img.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + w, y0 + h))

# ---------------------------------------------------------------- frame compose
def compose(frame_rgb, t):
    img = Image.fromarray(frame_rgb, "RGB")
    img = apply_zoom(img, zoom_at(t)).convert("RGBA")
    if t < END_CARD + 0.5:
        if t < END_CARD:
            img.alpha_composite(WM, (W - WM.width - 30, 330))
        draw_products(img, t); draw_card(img, t); draw_pills(img, t); draw_logo_card(img, t)
        draw_captions(img, t); draw_sparkles(img, t)
    draw_endcard(img, t)
    return img.convert("RGB")

# ---------------------------------------------------------------- SFX
def make_sfx(path):
    sr = 44100; n = int(TOTAL * sr); out = np.zeros(n)
    def add(t, sig, gain):
        i = int(t * sr); j = min(n, i + len(sig)); out[i:j] += sig[:j - i] * gain
    def pop():
        d = 0.09; tt = np.arange(int(d * sr)) / sr
        f = 900 * np.exp(-tt * 25) + 300
        return np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-tt * 40)
    def whoosh(d=0.45):
        m = int(d * sr); nz = np.random.default_rng(1).standard_normal(m)
        # simple low-pass sweep via moving average of varying length
        env = np.sin(np.pi * np.linspace(0, 1, m)) ** 2
        k = 30; sm = np.convolve(nz, np.ones(k) / k, 'same')
        return sm * env * 3
    for e in PRODS: add(e[2], pop(), 0.22)
    for e in PILLS: add(e[1], pop(), 0.16)
    add(CARD_T[0], pop(), 0.25); add(LOGO_T[0], pop(), 0.25)
    for (t0, d, a) in PUNCHES: add(t0, whoosh(d + 0.1), 0.18)
    add(HOLD[0], whoosh(0.4), 0.2); add(END_CARD - 0.05, whoosh(0.6), 0.25)
    for k, dl in enumerate([0.25, 0.5, 0.7, 0.85]): add(END_CARD + dl, pop(), 0.18)
    st = np.clip(np.stack([out, out], 1), -1, 1)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(sr)
        wf.writeframes((st * 32767).astype(np.int16).tobytes())

# ---------------------------------------------------------------- main
def grab(t):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(min(t, CUT - 0.05)), "-i", SRC, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(H, W, 3)

if __name__ == "__main__":
    if sys.argv[1] == "preview":
        ts = [float(x) for x in sys.argv[2:]]
        ims = [compose(grab(t), t).resize((270, 480)) for t in ts]
        sheet = Image.new("RGB", (270 * len(ims), 480))
        for i, im in enumerate(ims): sheet.paste(im, (270 * i, 0))
        sheet.save("/home/claude/preview.jpg", quality=85); print("ok")
    elif sys.argv[1] == "full":
        out = sys.argv[2]
        make_sfx("/home/claude/sfx.wav")
        dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", SRC, "-t", str(CUT), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                "-i", SRC, "-i", "/home/claude/sfx.wav",
                                "-filter_complex", f"[1:a]atrim=0:{CUT},asetpts=PTS-STARTPTS,apad=whole_dur={TOTAL}[a1];[a1][2:a]amix=inputs=2:duration=first:normalize=0[a]",
                                "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
                                "-c:a", "aac", "-b:a", "192k", "-t", str(TOTAL), "-movflags", "+faststart", out], stdin=subprocess.PIPE)
        nfr = int(TOTAL * FPS); last = None; fs = W * H * 3
        for i in range(nfr):
            t = i / FPS
            buf = dec.stdout.read(fs) if t < CUT else b""
            if len(buf) == fs: last = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            enc.stdin.write(compose(last, t).tobytes())
            if i % 60 == 0: print(i, nfr, flush=True)
        enc.stdin.close(); enc.wait(); print("done")
