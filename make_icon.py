# 📁 FILE: D:\EquationTool\make_icon.py
# 📌 WHAT: Makes icon.ico (from icon.png if you have one, else draws a default Σ icon)

import os

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "icon.png")
OUT = os.path.join(BASE, "icon.ico")
SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def draw_default(size=1024):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=(37, 99, 235, 255))
    font = None
    for path in (
        r"C:\Windows\Fonts\seguisym.ttf",
        r"C:\Windows\Fonts\cambriab.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ):
        if os.path.exists(path):
            font = ImageFont.truetype(path, int(size * 0.62))
            break
    if font is None:
        raise SystemExit("No suitable Windows font found for the default icon.")
    d.text((size / 2, size / 2), "\u2211", font=font, fill="white", anchor="mm")
    return img


if os.path.exists(SRC):
    img = Image.open(SRC).convert("RGBA")
    print("Using existing icon.png")
else:
    img = draw_default()
    img.save(SRC, "PNG")
    print("Created default icon.png")

img.save(OUT, format="ICO", sizes=SIZES)
print("Saved", OUT)