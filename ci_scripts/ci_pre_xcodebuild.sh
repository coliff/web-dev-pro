#!/bin/sh
set -eu

# Xcode Cloud provides CI_BUILD_NUMBER (monotonic per workflow)
BUILD_NUMBER="${CI_BUILD_NUMBER:-}"
if [ -z "$BUILD_NUMBER" ]; then
  # Local fallback so script can run outside Xcode Cloud
  BUILD_NUMBER="$(date +%Y%m%d%H%M)"
fi

echo "Setting build number to: $BUILD_NUMBER"

# Keep all targets in sync (app + extension) via Apple Generic Versioning
(
  cd "web-dev-pro"
  agvtool new-version -all "$BUILD_NUMBER"
)

# Also write directly to plists to guarantee CFBundleVersion match
for plist in \
  "web-dev-pro/Config/App-Info.plist" \
  "web-dev-pro/Config/Extension-Info.plist"
do
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$plist" \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $BUILD_NUMBER" "$plist"
done

echo "Done. App + extension CFBundleVersion = $BUILD_NUMBER"
