"""Composite exact brand artwork and readable type over pixel backgrounds."""

from pathlib import Path
import html
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "generated-artifacts"
OUT.mkdir(exist_ok=True)


def text(x, y, content, size=24, color="#ffe0bd", weight="normal", family="DejaVu Sans"):
    return (
        f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
        f'font-weight="{weight}" fill="{color}">{html.escape(content)}</text>'
    )


variants = [
    {
        "name": "monero-mobile-showcase-01",
        "background": "monero-mobile-showcase-landscape.png",
        "headline": ["YOUR MONERO.", "YOUR RULES."],
        "body": ["A real Monero wallet.", "Right inside Chrome."],
        "features": ["MAINNET SUPPORT", "NO COMPANION APP"],
        "footer": "Create. Restore. Send. Receive.",
    },
    {
        "name": "monero-mobile-showcase-02",
        "background": "monero-mobile-showcase-vault.png",
        "headline": ["PRIVATE KEYS.", "LOCAL CONTROL."],
        "body": ["Encrypted on your device.", "Signed inside your browser."],
        "features": ["ENCRYPTED VAULT", "AUTOMATIC SYNC"],
        "footer": "Automatic sync while connected and unlocked.",
    },
]

for variant in variants:
    svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">',
        '<defs><linearGradient id="shade"><stop stop-color="#101014" stop-opacity=".96"/>'
        '<stop offset=".55" stop-color="#101014" stop-opacity=".90"/>'
        '<stop offset="1" stop-color="#101014" stop-opacity="0"/></linearGradient></defs>',
        '<rect width="1280" height="800" fill="url(#shade)"/>',
        text(130, 86, "MONERO MOBILE", 23, "#fff0de", "bold", "DejaVu Sans Mono"),
        text(76, 151, "THE STANDALONE CHROME WALLET", 14, "#fa7832", "bold", "DejaVu Sans Mono"),
    ]
    for index, line in enumerate(variant["headline"]):
        svg.append(text(72, 280 + index * 79, line, 63, "#fff0de", "bold", "DejaVu Sans Mono"))
    for index, line in enumerate(variant["body"]):
        svg.append(text(76, 431 + index * 39, line, 26, "#d9d4cf"))
    for index, label in enumerate(variant["features"]):
        y = 548 + index * 42
        svg.append(f'<rect x="76" y="{y - 12}" width="10" height="10" fill="#fa7832"/>')
        svg.append(text(101, y, label, 16, "#ffe0bd", "bold", "DejaVu Sans Mono"))
    svg.extend([
        '<rect x="76" y="696" width="1128" height="1" fill="#5d4130"/>',
        text(76, 742, variant["footer"], 17, "#d9d4cf"),
        text(1027, 742, "monero mobile", 17, "#fa7832", "bold"),
        '</svg>',
    ])
    overlay = OUT / f'{variant["name"]}-type.svg'
    overlay.write_text("".join(svg))
    background = OUT / variant["background"]
    final = OUT / f'{variant["name"]}.png'
    # The approved mark is composited from its original vector, not recreated
    # by an image model. The large mark is deliberately aligned to pixel edges.
    subprocess.run([
        "magick", str(background), "-resize", "1280x800^",
        "-gravity", "center", "-extent", "1280x800",
        "(", "-background", "none", str(overlay), ")", "-gravity", "northwest", "-composite",
        "(", "-background", "none", str(ROOT / "extension/public/monero-mobile-logo.svg"),
        "-filter", "point", "-resize", "48x48", ")", "-geometry", "+72+51", "-composite",
        "(", "-background", "none", str(ROOT / "extension/public/monero-mobile-logo.svg"),
        "-filter", "point", "-resize", "324x324", ")", "-geometry", "+842+238", "-composite",
        "-strip", str(final),
    ], check=True)
    print(final.relative_to(ROOT))
