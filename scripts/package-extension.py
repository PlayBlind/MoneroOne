"""Package the existing extension build without a parent folder in the archive."""

import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
dist = root / "extension" / "dist"
manifest = json.loads((dist / "manifest.json").read_text())
if manifest.get("manifest_version") != 3:
    raise SystemExit("Expected the existing Manifest V3 extension build")
for name in ("index.html", "app.js", "background.js", "monero.worker.js", "styles.css"):
    if not (dist / name).is_file():
        raise SystemExit(f"Missing required build file: {name}")

output = root / "generated-artifacts"
output.mkdir(exist_ok=True)
archive = output / f"monero-mobile-chrome-{manifest['version']}.zip"
with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as package:
    for file in sorted(dist.rglob("*")):
        if file.is_file():
            package.write(file, file.relative_to(dist))
with ZipFile(archive) as package:
    assert "manifest.json" in package.namelist()
    assert package.testzip() is None
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".zip.sha256").write_text(f"{digest}  {archive.name}\n")
print(f"Packaged {archive.relative_to(root)} ({archive.stat().st_size:,} bytes)")
print(f"SHA-256: {digest}")
