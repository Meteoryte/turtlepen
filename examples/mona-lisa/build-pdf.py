"""
Assemble the five Mona Lisa sheets into one PDF.

The drawings are vector (SVG) but nothing on this machine converts SVG to PDF,
so each sheet is rasterised through a browser at its natural size and placed on
an A4 page. That is a real loss of resolution and it is recorded here rather
than glossed: the SVGs beside this file are the masters.
"""
from pathlib import Path

from PIL import Image, ImageChops
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
MONA = HERE.parent.parent / "diagrams" / "mona"
PNG = MONA / "png"
OUT = MONA / "mona-lisa-portfolio.pdf"

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

SHEETS = [
    (
        "mona-01-flowchart.png",
        "I — Method",
        "How to paint the Mona Lisa",
        "A flowchart, and the only sheet in the set that is a diagram rather than a picture. "
        "Every label is measured against the shape it will sit in, each column is one uniform "
        "width so the connectors run straight, and the paths are proposed by the router rather "
        "than hand-computed. The two loops — wait for a layer to dry, glaze again until the "
        "depth is there — are what separate a painting from a sketch.",
    ),
    (
        "mona-02-cartoon.png",
        "II — Cartoon",
        "The same sitter, at speed",
        "Heavy contour, exaggerated features, and mass built entirely from hatching, because the "
        "lattice has no closed-path fill: a polygon claims its outline and nothing inside, so "
        "asking for filled hair returns an outline. The first version of this sheet had no hands "
        "at all, which loses the second most recognisable thing in the painting after the smile.",
    ),
    (
        "mona-03-coloring.png",
        "III — Colouring page",
        "Contour only, nothing filled",
        "The strictest test of the figure: with no tone to carry the form, the outline has to do "
        "all of it — which is why every defect in the construction surfaced here first. The eyes "
        "were two concentric ovals and read as goggles until they were rebuilt as lids over a "
        "ball; the gown was an empty bell until it got folds, a sleeve seam and a chair rail to "
        "rest the hands on.",
    ),
    (
        "mona-04-abstract.png",
        "IV — Disassembled",
        "One head, four angles at once",
        "Four ellipses of the same face at four rotations, each hatched at a different spacing, "
        "so where they cross the ink accumulates the way overlapping glass does. Density here is "
        "spacing rather than opacity: no alpha compositing exists anywhere in the engine, and "
        "none is needed. Spread far enough apart to read as four viewpoints — closer together "
        "they looked like one slightly blurred head.",
    ),
    (
        "mona-05-sculpture.png",
        "V — Marble, projected",
        "Authored in inches, seen through a lens",
        "The only sheet with real three-dimensional geometry behind it. The bust is described in "
        "room inches and put through a camera, which brings the depth problem with it: a "
        "projection lands on a lattice with no z-buffer, so every block is equally present and "
        "the far ones show through the near ones. Each mass sits on its own Z-page, ordered by "
        "distance, and the occlusion becomes real.",
    ),
]


def trimmed(path):
    """Crop the uniform border a browser screenshot leaves around the artwork."""
    im = Image.open(path).convert("RGB")
    bg = Image.new("RGB", im.size, im.getpixel((im.size[0] - 2, im.size[1] - 2)))
    box = ImageChops.difference(im, bg).convert("L").point(lambda v: 255 if v > 8 else 0).getbbox()
    return im.crop(box) if box else im


def draw_titlepage(c):
    c.setFont("Helvetica-Bold", 26)
    c.drawString(MARGIN, PAGE_H - MARGIN - 26, "Five Mona Lisas")
    c.setFont("Helvetica", 12)
    c.drawString(MARGIN, PAGE_H - MARGIN - 48, "Drawn with TurtlePen, an integer lattice for AI-authored diagrams")

    c.setFont("Helvetica", 10)
    y = PAGE_H - MARGIN - 90
    for line in [
        "One subject, five ways of drawing it: a method diagram, a cartoon, a colouring page,",
        "an abstract, and a sculpture in projection.",
        "",
        "Every mark is a whole number of quadrants — 5px each — so nothing here is anti-aliased",
        "into place. Curves are polylines sampled through control points, which is why the sheets",
        "are drawn large: at radius 12 a circle is visibly a staircase, and at radius 60 the same",
        "algorithm reads as a curve. Detail is bought with quadrants rather than cleverness.",
        "",
        "Three engine facts shaped every sheet in the set:",
        "",
        "    •  There is no closed-path fill. A polygon claims its outline and nothing inside,",
        "       so every filled region here is hatched, and the hatch spacing IS the tone.",
        "",
        "    •  There is no z-buffer. 'Behind' is not a property a mark can hold; it is which",
        "       page the mark sits on, or else the hidden part simply must not be drawn.",
        "",
        "    •  A clean collision log proves a drawing is undefective, never that it depicts what",
        "       was asked for. Every sheet below was rendered and looked at, and several were",
        "       wrong in ways the log had nothing to say about — a horizon drawn straight across",
        "       her face, a body that stopped in mid-air, a portrait so symmetric it read as a",
        "       generic face rather than this one.",
        "",
        "The SVGs beside this file are the masters. These pages are rasterised from them, because",
        "no SVG-to-PDF converter was available on the machine that assembled this.",
    ]:
        c.drawString(MARGIN, y, line)
        y -= 15

    c.setFont("Helvetica-Oblique", 9)
    c.drawString(MARGIN, MARGIN, "github.com/Meteoryte/turtlepen")
    c.showPage()


def draw_sheet(c, png, numeral, subtitle, note):
    img = trimmed(PNG / png)
    reader = ImageReader(img)

    c.setFont("Helvetica-Bold", 16)
    c.drawString(MARGIN, PAGE_H - MARGIN - 16, numeral)
    c.setFont("Helvetica", 11)
    c.drawString(MARGIN, PAGE_H - MARGIN - 34, subtitle)

    # Caption first, so the image gets whatever is left and never overlaps it.
    text = c.beginText(MARGIN, MARGIN + 62)
    text.setFont("Helvetica", 9)
    words = note.split()
    line = ""
    lines = []
    for w in words:
        trial = f"{line} {w}".strip()
        if c.stringWidth(trial, "Helvetica", 9) > PAGE_W - 2 * MARGIN:
            lines.append(line)
            line = w
        else:
            line = trial
    lines.append(line)
    for ln in lines[-5:]:
        text.textLine(ln)
    c.drawText(text)

    top = PAGE_H - MARGIN - 52
    bottom = MARGIN + 62 + 14 * len(lines[-5:])
    avail_w = PAGE_W - 2 * MARGIN
    avail_h = top - bottom
    scale = min(avail_w / img.width, avail_h / img.height)
    w = img.width * scale
    h = img.height * scale
    c.drawImage(reader, MARGIN + (avail_w - w) / 2, bottom + (avail_h - h) / 2,
                width=w, height=h, preserveAspectRatio=True, mask=None)
    c.showPage()


def main():
    c = canvas.Canvas(str(OUT), pagesize=A4)
    c.setTitle("Five Mona Lisas — drawn with TurtlePen")
    draw_titlepage(c)
    for png, numeral, subtitle, note in SHEETS:
        draw_sheet(c, png, numeral, subtitle, note)
    c.save()
    print(f"wrote {OUT}  ({OUT.stat().st_size // 1024} KB, {len(SHEETS) + 1} pages)")


if __name__ == "__main__":
    main()
