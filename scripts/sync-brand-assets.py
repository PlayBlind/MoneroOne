"""Export the approved pixel M logo to every application brand asset."""

from pathlib import Path
import json
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
source = root / "extension/public/monero-mobile-logo.svg"
native = root / "MoneroOne/Resources/Assets.xcassets"
widgets = root / "MoneroOneWidgets/Assets.xcassets"


def export(destination, size, opaque=False):
    command = [
        "magick", "-background", "none", str(source),
        "-filter", "point", "-resize", f"{size}x{size}",
    ]
    if opaque:
        command += ["-background", "#17161b", "-alpha", "remove", "-alpha", "off"]
    subprocess.run(command + ["-strip", str(destination)], check=True)


for size, filename in [(16, "icon-16.png"), (32, "icon-32.png"), (48, "icon-48.png"), (128, "icon.png")]:
    export(root / "extension/public" / filename, size)
export(root / "artifacts/monero-one/public/monero-mobile-icon.png", 512)
export(root / "generated-artifacts/monero-mobile-logo-1024.png", 1024)
export(native / "AppIcon.appiconset/app-icon-1024.png", 1024, opaque=True)
export(root / "MoneroOne/monero-one.icon/Assets/monero-correct.png", 1024, opaque=True)

# Preserve catalog names and mappings so native views and widgets need no
# behavior changes; both light and dark variants use the approved colors.
for catalog in (native, widgets):
    for folder in catalog.glob("*.imageset"):
        if folder.stem not in {"MoneroLogo", "MoneroMark", "MoneroMarkWhite", "MoneroSymbol", "MoneroSymbolDark"}:
            continue
        for image in json.loads((folder / "Contents.json").read_text())["images"]:
            filename = image.get("filename")
            if not filename:
                continue
            destination = folder / filename
            if destination.suffix == ".svg":
                shutil.copyfile(source, destination)
            elif destination.suffix == ".png":
                export(destination, 128 if "-128" in filename else 1024)
        print(f"Updated {folder.relative_to(root)}")
