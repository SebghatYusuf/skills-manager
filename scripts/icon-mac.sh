#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
ICON_PNG="$BUILD_DIR/icon.png"
ICONSET_DIR="$BUILD_DIR/icon.iconset"
SOURCE_SVG="$ROOT_DIR/media/app-icon.svg"

mkdir -p "$BUILD_DIR"

if ! command -v sips >/dev/null 2>&1; then
  echo "sips is required but not found. This script must run on macOS."
  exit 1
fi

if ! command -v iconutil >/dev/null 2>&1; then
  echo "iconutil is required but not found. This script must run on macOS."
  exit 1
fi

if [ ! -f "$SOURCE_SVG" ]; then
  echo "Missing source SVG: $SOURCE_SVG"
  exit 1
fi

echo "Generating PNG from SVG..."
sips -s format png "$SOURCE_SVG" --out "$ICON_PNG" >/dev/null

echo "Generating iconset..."
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

sips -z 16 16     "$ICON_PNG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32     "$ICON_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32     "$ICON_PNG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64     "$ICON_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128   "$ICON_PNG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256   "$ICON_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "$ICON_PNG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512   "$ICON_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "$ICON_PNG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$ICON_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

echo "Creating ICNS..."
iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"

echo "Done: $BUILD_DIR/icon.icns"
