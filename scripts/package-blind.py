#!/usr/bin/env python3
"""Package Blind Memo Lab alone, with reproducible ZIPs and explicit inputs.

The source package has its own package.json and Pages workflow. It never copies
the parent project's README, workflow, personal workbook, or saved app data.
"""

import argparse
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parent.parent
PUBLIC_SUFFIXES = {".html", ".js", ".css", ".webmanifest", ".svg", ".png", ".webp", ".woff", ".woff2"}
WEB_EXTRA_NAMES = {".nojekyll", "LICENSE", "NOTICE", "GUIDE.md", "CNAME", "BLIND-MEMO-DEPLOY.md"}
SOURCE_FILES = (
    "LICENSE", "NOTICE", "native/CornerLab.swift", "native/BlindMemo-Info.plist",
    "scripts/build-blind-web.mjs", "scripts/build-blind-mac.sh",
    "scripts/test-blind-native.sh", "scripts/create-icns.py", "scripts/package-blind.py",
    "scripts/seal-blind-defaults.mjs", "tests/blind-native-vault-fixture.js",
    "tests/blind-native-smoke.swift", "docs/BLIND-MEMO-GUIDE.md", "docs/BLIND-MEMO-DEPLOY.md",
)
PACKAGE = {
    "name": "blind-memo-lab", "version": "1.0.1", "private": True,
    "type": "module", "description": "Offline letter-pair and blindfold cube memo practice",
    "license": "GPL-3.0-only", "engines": {"node": ">=22"},
    "scripts": {
        "test": "node --test tests/blind-*.test.js",
        "dev": "python3 -m http.server 8766 --bind 127.0.0.1 --directory app/blind",
        "build:blind:web": "node scripts/build-blind-web.mjs",
        "build:blind:mac": "bash scripts/build-blind-mac.sh",
        "test:blind:native": "bash scripts/test-blind-native.sh",
        "package:blind": "python3 scripts/package-blind.py",
    },
}
WORKFLOW = """name: Publish Blind Memo Lab

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: blind-memo-pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: read
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          package-manager-cache: false
      - run: npm test
      - run: npm run build:blind:web
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist/blind-web

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.publish.outputs.page_url }}
    steps:
      - id: publish
        uses: actions/deploy-pages@v4
"""


def checked_file(path):
    """Never copy a symlink or a file outside the project selected by a link."""
    relative = path.relative_to(ROOT)
    current = ROOT
    for component in relative.parts:
        current = current / component
        if current.is_symlink():
            raise ValueError(f"Release inputs must not be symbolic links: {relative}")
    if not path.is_file():
        raise ValueError(f"Missing release input: {relative}")
    return path.read_bytes(), path.stat().st_mode & 0o777


def app_files():
    directory = ROOT / "app" / "blind"
    result = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Release inputs must not be symbolic links: {path.relative_to(ROOT)}")
        if path.is_file() and path.suffix in PUBLIC_SUFFIXES and not any(part.startswith(".") for part in path.relative_to(directory).parts):
            result[path.relative_to(ROOT).as_posix()] = checked_file(path)
    for name in ["index.html", "app.js", "data.js", "repetition.js", "choices.js", "vault.js", "default-memos.js", "cube.js", "cube-view.js", "answers.js", "sw.js"]:
        if f"app/blind/{name}" not in result:
            raise ValueError(f"Missing Blind Memo Lab app asset: {name}")
    return result


def source_entries():
    result = app_files()
    for name in SOURCE_FILES:
        result[name] = checked_file(ROOT / name)
    tests = sorted((ROOT / "tests").glob("blind-*.test.js"))
    if not tests:
        raise ValueError("Blind Memo Lab automated tests are missing.")
    for path in tests:
        result[path.relative_to(ROOT).as_posix()] = checked_file(path)
    result["package.json"] = ((json.dumps(PACKAGE, indent=2) + "\n").encode(), 0o644)
    guide, _ = checked_file(ROOT / "docs" / "BLIND-MEMO-GUIDE.md")
    result["README.md"] = (guide + b"\nSee [publishing and release instructions](docs/BLIND-MEMO-DEPLOY.md).\n", 0o644)
    result[".gitignore"] = (b"dist/\n.build/\nnode_modules/\n.DS_Store\n*.log\n", 0o644)
    result[".github/workflows/pages.yml"] = (WORKFLOW.encode(), 0o644)
    return result


def web_entries():
    directory = ROOT / "dist" / "blind-web"
    if not directory.is_dir():
        raise ValueError("Run npm run build:blind:web before packaging, or use --source-only.")
    result = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Web output must not contain symbolic links: {path}")
        if not path.is_file():
            continue
        relative = path.relative_to(directory).as_posix()
        if relative not in WEB_EXTRA_NAMES and (path.suffix not in PUBLIC_SUFFIXES or any(part.startswith(".") for part in path.relative_to(directory).parts)):
            raise ValueError(f"Unexpected file in the Blind Memo Lab web output: {relative}")
        result[relative] = checked_file(path)
    for name in ["index.html", "app.js", "data.js", "sw.js", "pwa.js", "manifest.webmanifest", ".nojekyll", "GUIDE.md", "LICENSE", "NOTICE", "CNAME"]:
        if name not in result:
            raise ValueError(f"Incomplete Blind Memo Lab web output: {name}")
    if result["CNAME"][0].decode().strip() != "blind.orger.org":
        raise ValueError("The Blind Memo Lab web output must target blind.orger.org.")
    return result


def write_archive(destination, entries):
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with NamedTemporaryFile(dir=destination.parent, prefix=destination.name + ".", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
            for name, (content, mode) in sorted(entries.items()):
                entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = (0o100000 | mode) << 16
                archive.writestr(entry, content, compress_type=ZIP_DEFLATED, compresslevel=9)
        temporary.replace(destination)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    print(f"Packaged {len(entries)} files: {destination} ({destination.stat().st_size:,} bytes)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-only", action="store_true", help="Package source without requiring a built website")
    args = parser.parse_args()
    source = source_entries()
    web = None if args.source_only else web_entries()
    write_archive(ROOT / "dist" / "Blind-Memo-Lab-GitHub-Pages.zip", source)
    if web is not None:
        write_archive(ROOT / "dist" / "Blind-Memo-Lab-Web.zip", web)


if __name__ == "__main__":
    main()
