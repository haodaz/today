#!/bin/zsh
# 一键把 Today 跑起来：本地服务 + HTTPS 隧道。
#
#   ./start.sh
#
# 服务跑在你自己机器上（API key 不离开本地），隧道只负责把它暴露成
# 一个 HTTPS 地址——手机在外面也能用，而且页面内录音需要 HTTPS，
# iOS Safari 只在安全上下文下给麦克风权限。
#
# trycloudflare 的地址每次重启都会变。电视上的二维码会自己跟着变
# （app 向服务端要地址，不写死），所以不用重装 APK。
set -e
cd "$(dirname "$0")"

CF="$HOME/Library/Android/bin/cloudflared"
LOG=/tmp/today-cf.log

pkill -f "node server/index.mjs" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1

echo "起隧道…"
nohup "$CF" tunnel --url http://localhost:8910 --no-autoupdate > "$LOG" 2>&1 &
URL=""
for i in {1..30}; do
  URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOG" 2>/dev/null | head -1)
  [[ -n "$URL" ]] && break
  sleep 2
done
if [[ -z "$URL" ]]; then
  echo "隧道没起来，看 $LOG"
  exit 1
fi

echo "起服务…"
PUBLIC_URL="$URL" nohup node server/index.mjs > /tmp/today-server.log 2>&1 &
sleep 3

echo ""
echo "  手机打开（或扫电视上的二维码）："
echo "  $URL"
echo ""
echo "  停：./stop.sh"
