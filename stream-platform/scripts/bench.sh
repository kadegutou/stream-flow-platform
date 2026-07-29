#!/usr/bin/env bash
# 性能基准：csv-source → field-concat → csv-sink
# 用法: bash scripts/bench.sh <输入csv> <行数> <标签>
set -euo pipefail
cd "$(dirname "$0")/.."
IN=${1:?输入csv路径}; ROWS=${2:?行数}; TAG=${3:-run}
OUT="C:/tmp/sp-test/bench-out-${TAG}.csv"
BASE=http://localhost:8080/api

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
AUTH="Authorization: Bearer $TOKEN"

rm -f "$OUT"
# 创建作业
JOB=$(curl -s -X POST $BASE/jobs -H "$AUTH" -H "Content-Type: application/json" -d "{\"name\":\"bench-${TAG}\",\"parallelism\":1}")
JID=$(echo "$JOB" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
# 保存 DAG
curl -s -X PUT $BASE/jobs/$JID -H "$AUTH" -H "Content-Type: application/json" -d "{\"dag\":{\"nodes\":[
  {\"id\":\"n1\",\"componentCode\":\"csv-source\",\"params\":{\"path\":\"$IN\",\"hasHeader\":true,\"batchSize\":5000}},
  {\"id\":\"n2\",\"componentCode\":\"field-concat\",\"params\":{\"sourceFields\":[\"c1\",\"c2\",\"c3\"],\"targetField\":\"concat_col\",\"separator\":\"-\"}},
  {\"id\":\"n3\",\"componentCode\":\"csv-sink\",\"params\":{\"path\":\"$OUT\"}}
],\"edges\":[{\"from\":\"n1\",\"to\":\"n2\"},{\"from\":\"n2\",\"to\":\"n3\"}]}}" > /dev/null
# 上线并计时
T0=$(date +%s%N)
curl -s -X POST $BASE/jobs/$JID/online -H "$AUTH" > /dev/null
while true; do
  ST=$(curl -s $BASE/jobs/$JID/instances -H "$AUTH" | sed -n 's/.*"status":"\([A-Z]*\)".*/\1/p' | head -1)
  [ "$ST" = "STOPPED" ] && break
  [ "$ST" = "FAILED" ] && { echo "[$TAG] FAILED"; curl -s $BASE/jobs/$JID/instances -H "$AUTH"; exit 1; }
  sleep 2
done
T1=$(date +%s%N)
ELAPSED=$(awk -v a="$T0" -v b="$T1" 'BEGIN{printf "%.1f", (b-a)/1e9}')
OUTROWS=$(wc -l < "$OUT")
OUTBYTES=$(wc -c < "$OUT")
# 收尾：下线清理作业
curl -s -X POST $BASE/jobs/$JID/offline -H "$AUTH" > /dev/null 2>&1 || true
sleep 1
curl -s -X DELETE $BASE/jobs/$JID -H "$AUTH" > /dev/null
awk -v tag="$TAG" -v rows="$ROWS" -v el="$ELAPSED" -v orows="$OUTROWS" -v ob="$OUTBYTES" 'BEGIN{
  printf "[%s] 行数=%s 端到端=%ss 吞吐=%.0f行/s (%.1f MB/s) 输出校验=%s行/%s字节\n", tag, rows, el, rows/el, ob/el/1048576, orows, ob}'
