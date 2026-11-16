#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo "A real iPhone binary requires macOS with Xcode. Use the iOS Sideload workflow." >&2
  exit 1
fi
if [[ ! -d ios/App/App.xcodeproj ]]; then
  echo "Run npm run prepare:web and npm run ios:add first." >&2
  exit 1
fi
mkdir -p dist
rm -rf build/Payload
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY='' \
  DEVELOPMENT_TEAM='' \
  TARGETED_DEVICE_FAMILY=1 \
  ARCHS=arm64 \
  build
APP=build/DerivedData/Build/Products/Release-iphoneos/App.app
test -f "$APP/App"
file "$APP/App" | tee dist/binary-info.txt
file "$APP/App" | grep -q 'arm64'
test -f "$APP/public/index.html"
test -f "$APP/public/ios-native.js"
test -f "$APP/public/vendor/body-muscles.umd.min.js"
plutil -lint "$APP/Info.plist"
mkdir -p build/Payload
ditto "$APP" build/Payload/AlexFit.app
rm -f dist/AlexFit-1.0.0-unsigned.ipa
(cd build && /usr/bin/zip -qry ../dist/AlexFit-1.0.0-unsigned.ipa Payload)
shasum -a 256 dist/AlexFit-1.0.0-unsigned.ipa > dist/SHA256SUMS.txt
unzip -t dist/AlexFit-1.0.0-unsigned.ipa | tail -1
echo "Built device IPA; Sideloadly/AltStore must sign it for the installing device."
