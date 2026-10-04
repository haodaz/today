#!/bin/zsh
# 出自包含的 release APK（可直接侧载到 Fire TV，不需要开发服务器）
set -e
cd "$(dirname "$0")"
source ./env.sh
cd android
./gradlew assembleRelease --no-daemon
APK="$(pwd)/app/build/outputs/apk/release/app-release.apk"
ls -lh "$APK"
echo "APK: $APK"
