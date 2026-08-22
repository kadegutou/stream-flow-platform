#!/usr/bin/env bash
# 端到端扇出验证：csv-source → field-concat → 两个 csv-sink，校验双输出逐字节一致。
# 日志：scripts/fanout-test.log
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT_WIN=$(pwd -W 2>/dev/null || pwd)
mkdir -p logs data scripts
LOG=scripts/fanout-test.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

CP_URL=http://localhost:8080
ROWS=100000
CP_PID=""
WK_PID=""

# Git Bash 的 pkill 杀不掉 Windows java 进程，按端口用 taskkill 清理
kill_ports() {
  for PID in $(netstat -ano | grep -E ':(8080|8081)\s.*LISTENING' | awk '{print $NF}' | sort -u); do
    taskkill //PID "$PID" //F > /dev/null 2>&1 || true
  done
}
cleanup() {
  echo "[fanout] 清理后台进程"
  [ -n "$CP_PID" ] && kill "$CP_PID" 2>/dev/null || true
  [ -n "$WK_PID" ] && kill "$WK_PID" 2>/dev/null || true
  kill_ports
}
trap cleanup EXIT

echo "[fanout] $(date '+%F %T') 扇出端到端验证开始"

kill_ports
sleep 1

if [ ! -f sp-control-plane/target/sp-control-plane-1.0.0.jar ] \
   || [ ! -f sp-worker/target/sp-worker-1.0.0.jar ]; then
  echo "[fanout] 构建工程..."
  mvn -q -DskipTests package
fi

bash data/gen_csv.sh data/input.csv "$ROWS"

java -jar sp-control-plane/target/sp-control-plane-1.0.0.jar > logs/control-plane.log 2>&1 &
CP_PID=$!
echo "[fanout] 控制面启动中 pid=$CP_PID"
READY=0
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$CP_URL/api/components" || true)
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then READY=1; break; fi
  sleep 2
done
[ "$READY" = "1" ] || { echo "[fanout] 控制面启动失败，见 logs/control-plane.log"; exit 1; }
echo "[fanout] 控制面就绪"

java -jar sp-worker/target/sp-worker-1.0.0.jar > logs/worker.log 2>&1 &
WK_PID=$!
echo "[fanout] Worker 启动中 pid=$WK_PID，等待注册..."
sleep 15
kill -0 "$WK_PID" 2>/dev/null || { echo "[fanout] Worker 启动失败，见 logs/worker.log"; exit 1; }

LOGIN=$(curl -s -X POST "$CP_URL/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "[fanout] 登录失败: $LOGIN"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

IN_PATH="$ROOT_WIN/data/input.csv"
OUT_A="$ROOT_WIN/data/fanout-a.csv"
OUT_B="$ROOT_WIN/data/fanout-b.csv"
rm -f data/fanout-a.csv data/fanout-b.csv

# 一个 SOURCE → 一个 PROCESS → 两个 SINK（扇出 / 多路转发）
BODY_FILE=scripts/.fanout_body.json
cat > "$BODY_FILE" <<EOF
{"name":"fanout-test","description":"e2e fanout","parallelism":1,"dag":{
 "nodes":[
  {"id":"n1","componentCode":"csv-source","params":{"path":"$IN_PATH","delimiter":",","hasHeader":true,"batchSize":5000}},
  {"id":"n2","componentCode":"field-concat","params":{"sourceFields":["c1","c2","c3"],"targetField":"concat_col","separator":"-"}},
  {"id":"n3","componentCode":"csv-sink","params":{"path":"$OUT_A","delimiter":","}},
  {"id":"n4","componentCode":"csv-sink","params":{"path":"$OUT_B","delimiter":","}}],
 "edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"},{"from":"n2","to":"n4"}]}}
EOF
CREATE=$(curl -s -X POST "$CP_URL/api/jobs" -H "$AUTH" -H 'Content-Type: application/json; charset=utf-8' --data-binary "@$BODY_FILE")
echo "[fanout] 创建作业: ${CREATE:0:120}..."
JOB_ID=$(echo "$CREATE" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*' || true)
[ -n "$JOB_ID" ] || { echo "[fanout] 创建作业失败（多SINK校验未通过？）"; exit 1; }

curl -s -X POST "$CP_URL/api/jobs/$JOB_ID/online" -H "$AUTH" > /dev/null
echo "[fanout] 已上线，等待完成..."

STATUS=""
for _ in $(seq 1 120); do
  RESP=$(curl -s "$CP_URL/api/jobs/$JOB_ID/instances" -H "$AUTH")
  STATUS=$(echo "$RESP" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p' | head -1 || true)
  case "$STATUS" in STOPPED|FAILED) break;; esac
  sleep 2
done
echo "[fanout] 实例状态: $STATUS"
[ "$STATUS" = "STOPPED" ] || { echo "[fanout] 实例未正常结束: $RESP"; exit 1; }

# 校验：两个输出文件均存在、行数正确、逐字节一致
[ -f data/fanout-a.csv ] && [ -f data/fanout-b.csv ] || { echo "[fanout] 输出文件缺失"; exit 1; }
LA=$(wc -l < data/fanout-a.csv)
LB=$(wc -l < data/fanout-b.csv)
echo "[fanout] 输出 A 行数: $LA，输出 B 行数: $LB（期望均为 $((ROWS+1))）"
[ "$LA" = "$((ROWS+1))" ] && [ "$LB" = "$((ROWS+1))" ] || { echo "[fanout] 行数校验失败"; exit 1; }
if cmp -s data/fanout-a.csv data/fanout-b.csv; then
  echo "[fanout] 双输出逐字节一致 ✅"
else
  echo "[fanout] 两个输出文件内容不一致 ❌"; exit 1
fi

echo "[fanout] ============================================"
echo "[fanout] 扇出验证通过：1 Source → 1 Process → 2 Sink，$ROWS 行双写一致"
echo "[fanout] ============================================"
