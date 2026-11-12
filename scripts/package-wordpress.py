#!/usr/bin/env python3
"""Packages the WordPress plugin as a reproducible zip.

Usage: package-wordpress.py [target.zip]. The Tuix server serves the zip that
npm run build:distribution writes into its priv directory. A version file and
release.json (version, requires, tested, requires_php and the version's changelog lines,
which the plugin's updater reads through /downloads/tuix-feedback.json) are written next to it.
"""
import json
import os
import re
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
plugin = root / "apps" / "wordpress" / "tuix-feedback"
target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / "output" / "releases" / "tuix-feedback.zip"

header = (plugin / "tuix-feedback.php").read_text(encoding="utf-8")
version = re.search(r"^ \* Version:\s+(\S+)$", header, re.M).group(1)
readme = (plugin / "readme.txt").read_text(encoding="utf-8")
stable = re.search(r"^Stable tag:\s+(\S+)$", readme, re.M).group(1)
constant = re.search(r"define\( 'TUIX_FEEDBACK_VERSION', '([^']+)' \)", header).group(1)
if not version == stable == constant:
    sys.exit(f"Plugin version mismatch: header {version}, readme {stable}, constant {constant}")

files = sorted(p for p in plugin.rglob("*") if p.is_file() and not p.name.startswith("."))
target.parent.mkdir(parents=True, exist_ok=True)
partial = target.with_suffix(".partial")
with zipfile.ZipFile(partial, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        info = zipfile.ZipInfo("tuix-feedback/" + path.relative_to(plugin).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
        info.external_attr = 0o644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, path.read_bytes())
partial.replace(target)
(target.parent / "version").write_text(version + "\n")


def field(pattern, text):
    match = re.search(pattern, text, re.M)
    return match.group(1) if match else ""


section = re.search(r"^= " + re.escape(version) + r" =\n(.*?)(?=^= |\Z)", readme.split("== Changelog ==", 1)[-1], re.M | re.S)
release = {
    "version": version,
    "requires": field(r"^Requires at least:\s+(\S+)$", readme),
    "tested": field(r"^Tested up to:\s+(\S+)$", readme),
    "requires_php": field(r"^Requires PHP:\s+(\S+)$", readme),
    "changelog": [line[2:].strip() for line in (section.group(1).splitlines() if section else []) if line.startswith("* ")],
}
(target.parent / "release.json").write_text(json.dumps(release, indent=2) + "\n")
print(f"WordPress plugin {version}: {os.path.relpath(target, root)} ({len(files)} files)")
