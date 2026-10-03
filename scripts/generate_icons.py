"""Generate raster PWA icons matching public/icon.svg."""

from pathlib import Path

from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "public"
for size in (192, 512):
    scale = size / 128
    image = Image.new("RGB", (size, size), "#173d37")
    draw = ImageDraw.Draw(image)
    def box(coords):
        return tuple(round(value * scale) for value in coords)
    draw.rounded_rectangle(box((0, 0, 127, 127)), radius=round(28 * scale), fill="#173d37")
    draw.rounded_rectangle(box((35, 31, 93, 112)), radius=round(28 * scale), fill="#f5f4ee")
    draw.rectangle(box((44, 47, 84, 70)), fill="#d6a452")
    for x in (52, 76):
        r = 4 * scale
        draw.ellipse((x * scale - r, 49 * scale - r, x * scale + r, 49 * scale + r), fill="#173d37")
    draw.line([(59 * scale, 59 * scale), (64 * scale, 64 * scale), (69 * scale, 59 * scale)], fill="#173d37", width=round(4 * scale), joint="curve")
    image.save(root / f"icon-{size}.png")
