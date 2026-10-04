#!/bin/zsh
# 编译 debug APK
set -e
cd "$(dirname "$0")"
source ./env.sh
cd android
./gradlew assembleDebug --no-daemon
echo "APK: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
