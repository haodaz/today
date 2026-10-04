#!/bin/zsh
# 连上 Fire TV 并安装最新的 release APK
set -e
cd "$(dirname "$0")"
source ./env.sh
adb connect "${FIRETV_IP}:5555"
adb -s "${FIRETV_IP}:5555" install -r android/app/build/outputs/apk/release/app-release.apk
echo "装好了。电视上：首页 → 你的应用与频道 → Hearth"
adb -s "${FIRETV_IP}:5555" shell monkey -p com.hearth.tv -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1 || true
