#!/usr/bin/env bash
# 本地冒烟：模拟 PS5 推流开始 → 弹幕 → 礼物 → 停流 → 看日志
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:8787}"

echo "▸ 健康检查"
curl -fsS "$BASE/api/health"; echo

echo "▸ 模拟 PS5 开始推流"
curl -fsS "$BASE/api/hooks/stream/available?path=ps5&source_type=rtmpConn"; echo

echo "▸ B 站弹幕"
curl -fsS -X POST "$BASE/api/events/danmaku" -H 'Content-Type: application/json' \
  -d '{"platform":"bilibili","kind":"chat","user":"苏苏花","text":"来了老弟","at":"2026-11-20T10:00:00Z"}' >/dev/null
echo "  已发送"

echo "▸ 小红书礼物"
curl -fsS -X POST "$BASE/api/events/danmaku" -H 'Content-Type: application/json' \
  -d '{"platform":"xiaohongshu","kind":"gift","user":"甜心","text":"花","count":3,"at":"2026-11-20T10:00:01Z"}' >/dev/null
echo "  已发送"

echo "▸ 模拟 PS5 停止推流"
curl -fsS "$BASE/api/hooks/stream/unavailable?path=ps5"; echo

echo "▸ 最新日志"
curl -fsS "$BASE/api/logs?limit=8" | python3 -c "
import json,sys
for e in json.load(sys.stdin)['entries']:
    print('  %s [%s] %s' % (e['atLocal'], e['scope'], e['message']))
"
