#!/usr/bin/env python3
"""
The phone client's icons, rendered from the plugin's own logo.

They are generated rather than drawn so that there is one master (src/main/resources/META-INF/
pluginIcon.svg) and no second copy of the mark to keep in step. Run this after the logo changes:

    python3 scripts/mobile-icons.py

Needs rsvg-convert (brew install librsvg) and Pillow.

Two shapes come out of it, because the platforms ask for different things:

  * icon-192 / icon-512  - the logo as it is, rounded corners and all. Used where a browser puts the
    icon on a surface of its own and does not crop it.
  * the maskable pair    - full bleed, no transparency, the mark inside the safe area. Android crops a
    maskable icon to whatever shape the launcher likes, so a rounded square inside it would read as a
    box in a box; iOS does not crop at all but turns transparency black, which is worse.

The mark is not centred in the master canvas and does not fill it, so the scale and the offset here are
measured from a trial render rather than guessed.
"""

import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / 'src/main/resources/META-INF/pluginIcon.svg'
OUT = ROOT / 'webview/mobile-assets'
WORK = ROOT / 'build/icons'

# How much of the canvas the mark's own ink should fill. The safe area of a maskable icon is the middle
# 80%; leaving a little more room than that keeps the mark clear of an aggressive circular crop.
INK_SHARE = 0.60

CANVAS = 722.0  # the master's internal coordinate system


def render(svg: Path, size: int, target: Path) -> None:
    subprocess.run(
        ['rsvg-convert', '-w', str(size), '-h', str(size), str(svg), '-o', str(target)],
        check=True,
    )


def maskable_svg(size: int, scale: float, dx: float, dy: float, defs: str, mark: str) -> str:
    return f'''<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" fill="none"
     xmlns="http://www.w3.org/2000/svg">
  {defs}
  <rect width="{size}" height="{size}" fill="url(#accBg)"/>
  <g transform="translate({dx:.3f},{dy:.3f}) scale({scale:.6f})">
    {mark}
  </g>
</svg>
'''


def ink_box(path: Path) -> tuple[int, int, int, int]:
    """Where the pale mark actually sits. The coral background never reaches this far into blue."""
    image = Image.open(path).convert('RGB')
    width, height = image.size
    pixels = image.load()

    left, top, right, bottom = width, height, 0, 0
    for y in range(height):
        for x in range(width):
            if pixels[x, y][2] > 170:
                left, top = min(left, x), min(top, y)
                right, bottom = max(right, x), max(bottom, y)

    if right <= left:
        sys.exit('found no mark in the trial render - has the logo changed shape?')
    return left, top, right, bottom


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    svg = MASTER.read_text(encoding='utf-8')
    defs = re.search(r'<defs>.*?</defs>', svg, re.S).group(0)
    layers = re.findall(r'<g transform="translate\(0,722\) scale\(0\.1,-0\.1\)"[^>]*>.*?</g>', svg, re.S)
    marks = [layer for layer in layers if 'accMark' in layer]
    if len(marks) != 1:
        sys.exit(f'expected one mark layer in the logo, found {len(marks)}')
    mark = marks[0]

    # The logo as it is, for the places that do not crop.
    render(MASTER, 192, OUT / 'icon-192.png')
    render(MASTER, 512, OUT / 'icon-512.png')

    # A trial render at a known scale, to find out where the mark's ink lands.
    probe = WORK / 'probe.svg'
    size = 512
    trial = size * 0.62 / CANVAS
    probe.write_text(maskable_svg(size, trial, (size - CANVAS * trial) / 2,
                                  (size - CANVAS * trial) / 2, defs, mark), encoding='utf-8')
    render(probe, size, WORK / 'probe.png')
    left, top, right, bottom = ink_box(WORK / 'probe.png')

    # Fit that ink to the wanted share of the canvas, and centre it on what was measured rather than on
    # the canvas - the mark sits high and left in the master.
    scale = trial * (size * INK_SHARE / max(right - left, bottom - top))
    grow = scale / trial
    trial_origin = (size - CANVAS * trial) / 2

    # Where the group has to start for the ink's own middle to land on the canvas's middle. Measured
    # rather than derived: the mark sits high and left in the master, and that is not an offset worth
    # reasoning about twice.
    dx = size / 2 - ((left + right) / 2 - trial_origin) * grow
    dy = size / 2 - ((top + bottom) / 2 - trial_origin) * grow

    final = WORK / 'maskable.svg'
    final.write_text(maskable_svg(size, scale, dx, dy, defs, mark), encoding='utf-8')

    render(final, 512, OUT / 'icon-maskable-512.png')
    # iOS reads this one for the home screen, and it must not be transparent: what shows through is
    # black, and a black square is what people photograph and send in as a bug.
    render(final, 180, OUT / 'apple-touch-icon.png')

    left, top, right, bottom = ink_box(OUT / 'icon-maskable-512.png')
    print(f'maskable ink: {right - left}x{bottom - top} of 512 '
          f'({(right - left) / 512:.2f}), centred at {(left + right) // 2},{(top + bottom) // 2}')


if __name__ == '__main__':
    main()
