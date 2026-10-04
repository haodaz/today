#!/bin/zsh
# Hearth 开发环境变量 —— 每次开新终端先 `source env.sh`
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="$HOME/Library/Android/jdk17/Contents/Home"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$JAVA_HOME/bin:$PATH"
# 你的 Fire TV 局域网 IP（电视上：设置 → My Fire TV → About → Network）
export FIRETV_IP="${FIRETV_IP:-192.168.1.100}"
