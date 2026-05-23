#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$HOME/Applications/O Agent Omni.app"
ICONSET="/tmp/o-agent-omni.iconset"
ICON_PNG="/tmp/o-agent-omni-1024.png"

mkdir -p "$HOME/Applications"
rm -rf "$APP" "$ICONSET" "$ICON_PNG"
osacompile -o "$APP" "$ROOT/scripts/open-o-agent-omni.applescript"

mkdir -p "$ICONSET"
qlmanage -t -s 1024 -o /tmp "$ROOT/client/public/icons/omni-icon.svg" >/tmp/o-agent-omni-ql.log 2>&1 || true
cp /tmp/omni-icon.svg.png "$ICON_PNG"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ICON_PNG" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$ICON_PNG" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/OAgentOmni.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleName O Agent Omni" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName O Agent Omni" "$APP/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string O Agent Omni" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile OAgentOmni" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier co.oagent.omni" "$APP/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string co.oagent.omni" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true

xattr -cr "$APP"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
touch "$APP"
