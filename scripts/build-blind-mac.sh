#!/bin/bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_BUNDLE="$PROJECT_ROOT/dist/Blind Memo Lab.app"
MODULE_CACHE="$PROJECT_ROOT/.build/swift-module-cache"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources" "$MODULE_CACHE"
if [ ! -f "$PROJECT_ROOT/app/blind/index.html" ]; then
  echo "Missing Blind Memo Lab interface." >&2
  exit 1
fi
swiftc "$PROJECT_ROOT/native/CornerLab.swift" \
  -D BLIND_MEMO_LAB -swift-version 5 -parse-as-library -O \
  -target "$(uname -m)-apple-macosx13.0" -module-cache-path "$MODULE_CACHE" \
  -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
  -o "$APP_BUNDLE/Contents/MacOS/BlindMemoLab"
cp "$PROJECT_ROOT/native/BlindMemo-Info.plist" "$APP_BUNDLE/Contents/Info.plist"
# Both releases use the same public allowlist and derived offline assets.
node "$PROJECT_ROOT/scripts/build-blind-web.mjs"
node "$PROJECT_ROOT/scripts/build-blind-web.mjs" "$APP_BUNDLE/Contents/Resources/app"
cp "$PROJECT_ROOT/LICENSE" "$PROJECT_ROOT/NOTICE" "$APP_BUNDLE/Contents/Resources/"
cp "$PROJECT_ROOT/docs/BLIND-MEMO-GUIDE.md" "$APP_BUNDLE/Contents/Resources/"
ICONSET="$PROJECT_ROOT/.build/BlindMemoLab.iconset"
mkdir -p "$ICONSET"
for points in 16 32 128 256 512; do
  /usr/bin/sips -z "$points" "$points" "$PROJECT_ROOT/app/blind/icon-512.png" --out "$ICONSET/icon_${points}x${points}.png" >/dev/null
  pixels=$((points * 2))
  /usr/bin/sips -z "$pixels" "$pixels" "$PROJECT_ROOT/app/blind/icon-512.png" --out "$ICONSET/icon_${points}x${points}@2x.png" >/dev/null
done
python3 "$PROJECT_ROOT/scripts/create-icns.py" "$ICONSET" "$APP_BUNDLE/Contents/Resources/BlindMemoLab.icns"
/usr/bin/plutil -lint "$APP_BUNDLE/Contents/Info.plist"
/usr/bin/codesign --force --sign - "$APP_BUNDLE"
/usr/bin/codesign --verify --strict "$APP_BUNDLE"
echo "Built: $APP_BUNDLE"
