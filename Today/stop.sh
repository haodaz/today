#!/bin/zsh
pkill -f "node server/index.mjs" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
echo "停了。当天的计划和记忆都在 .data/ 里，不会丢。"
