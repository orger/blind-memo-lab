#!/bin/bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$PROJECT_ROOT/.build/swift-module-cache"
swiftc -swift-version 5 -D NATIVE_SMOKE_TEST -D BLIND_MEMO_LAB -parse-as-library \
  -module-cache-path "$PROJECT_ROOT/.build/swift-module-cache" \
  -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
  "$PROJECT_ROOT/native/CornerLab.swift" "$PROJECT_ROOT/tests/blind-native-smoke.swift" \
  -o "$PROJECT_ROOT/.build/blind-native-smoke"
"$PROJECT_ROOT/.build/blind-native-smoke" "$PROJECT_ROOT"
