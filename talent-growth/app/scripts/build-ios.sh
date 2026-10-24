#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! XCODE_DIR="$(node "$SCRIPT_DIR/xcode-path.mjs")"; then
  echo "请先安装完整 Xcode，再重新运行 npm run ios:build。"
  exit 2
fi

cd "$APP_DIR"
npm run ios:prepare
npm run ios:check

echo "使用 Xcode：$XCODE_DIR"

DEVELOPER_DIR="$XCODE_DIR" /usr/bin/xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath build/ios \
  CODE_SIGNING_ALLOWED=NO \
  build

echo "模拟器 App 已生成到：$APP_DIR/build/ios/Build/Products/Debug-iphonesimulator/App.app"
