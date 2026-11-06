#!/usr/bin/env python3
"""Erzeugt die App-Symbole (blauer Hintergrund, Häkchen, Schriftzug „LiD“)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs"
FONTS = ["DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
         "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"]


def icon(size):
    img = Image.new("RGB", (size, size), "#0b3d91")
    d = ImageDraw.Draw(img)
    s = size / 512
    try:
        font = next(ImageFont.truetype(f, int(150 * s)) for f in FONTS if Path(f).exists())
    except StopIteration:
        font = ImageFont.load_default()
    d.text((size / 2, 190 * s), "LiD", fill="white", font=font, anchor="mm")
    d.line([(150 * s, 340 * s), (225 * s, 410 * s), (370 * s, 270 * s)], fill="#ffcc00",
           width=int(40 * s), joint="curve")
    return img


for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    icon(size).save(OUT / name)
