#!/usr/bin/env bash
# 端到端冒烟：控制面 + Worker（dev/H2）→ 10万行 csv → field-concat → csv。
# 日志：scripts/smoke.log；组件日志：logs/control-plane.log、logs/worker.log
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT_WIN=$(pwd -W 2>/dev/null || pwd)
mkdir -p logs data scripts
LOG=scripts/smoke.log
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
  echo "[smoke] 清理后台进程"
  [ -n "$CP_PID" ] && kill "$CP_PID" 2>/dev/null || true
  [ -n "$WK_PID" ] && kill "$WK_PID" 2>/dev/null || true
  kill_ports
}
trap cleanup EXIT

echo "[smoke] $(date '+%F %T') 端到端冒烟开始"

# 0. 清理残留进程
kill_ports
sleep 1

# 1. 构建（jar 缺失时）
if [ ! -f sp-control-plane/target/sp-control-plane-1.0.0.jar ] \
   || [ ! -f sp-worker/target/sp-worker-1.0.0.jar ]; then
  echo "[smoke] 构建工程..."
  mvn -q -DskipTests package
fi

# 2. 生成测试数据（10 万行）
bash data/gen_csv.sh data/input.csv "$ROWS"

# 3. 启动控制面（dev profile = H2）
java -jar sp-control-plane/target/sp-control-plane-1.0.0.jar > logs/control-plane.log 2>&1 &
CP_PID=$!
echo "[smoke] 控制面启动中 pid=$CP_PID"
READY=0
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$CP_URL/api/components" || true)
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then READY=1; break; fi
  sleep 2
done
[ "$READY" = "1" ] || { echo "[smoke] 控制面启动失败，见 logs/control-plane.log"; exit 1; }
echo "[smoke] 控制面就绪"

# 4. 启动 Worker
java -jar sp-worker/target/sp-worker-1.0.0.jar > logs/worker.log 2>&1 &
WK_PID=$!
echo "[smoke] Worker 启动中 pid=$WK_PID，等待注册..."
sleep 15
kill -0 "$WK_PID" 2>/dev/null || { echo "[smoke] Worker 启动失败，见 logs/worker.log"; exit 1; }

# 5. 登录
LOGIN=$(curl -s -X POST "$CP_URL/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}')
echo "[smoke] 登录响应: ${LOGIN:0:80}..."
TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "[smoke] 登录失败"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

# 6. 创建作业（csv-source → field-concat → csv-sink）
IN_PATH="$ROOT_WIN/data/input.csv"
OUT_PATH="$ROOT_WIN/data/output.csv"
rm -f data/output.csv
# 请求体写入临时文件再 --data-binary 发送，避免 MSYS2 调用原生 curl.exe 时
# 把命令行参数中的中文（如路径里的「外包」）按 GBK 转码
BODY_FILE=scripts/.smoke_body.json
cat > "$BODY_FILE" <<EOF
{"name":"smoke-csv-concat","description":"e2e smoke","parallelism":1,"dag":{
 "nodes":[
  {"id":"n1","componentCode":"csv-source","params":{"path":"$IN_PATH","delimiter":",","hasHeader":true,"batchSize":5000}},
  {"id":"n2","componentCode":"field-concat","params":{"sourceFields":["c1","c2","c3"],"targetField":"concat_col","separator":"-"}},
  {"id":"n3","componentCode":"csv-sink","params":{"path":"$OUT_PATH","delimiter":","}}],
 "edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"}]}}
EOF
CREATE=$(curl -s -X POST "$CP_URL/api/jobs" -H "$AUTH" -H 'Content-Type: application/json; charset=utf-8' --data-binary "@$BODY_FILE")
echo "[smoke] 创建作业: $CREATE"
JOB_ID=$(echo "$CREATE" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*' || true)
[ -n "$JOB_ID" ] || { echo "[smoke] 创建作业失败"; exit 1; }

# 7. 上线
START=$(date +%s)
ONLINE=$(curl -s -X POST "$CP_URL/api/jobs/$JOB_ID/online" -H "$AUTH")
echo "[smoke] 上线: $ONLINE"

# 8. 轮询实例状态至 STOPPED / FAILED
STATUS=""
LAST=""
for _ in $(seq 1 120); do
  RESP=$(curl -s "$CP_URL/api/jobs/$JOB_ID/instances" -H "$AUTH")
  STATUS=$(echo "$RESP" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p' | head -1 || true)
  if [ "$STATUS" != "$LAST" ]; then echo "[smoke] 实例状态: $STATUS"; LAST="$STATUS"; fi
  case "$STATUS" in STOPPED|FAILED) break;; esac
  sleep 2
done
END=$(date +%s)
ELAPSED=$((END - START))
echo "[smoke] 最终实例: $RESP"
[ "$STATUS" = "STOPPED" ] || { echo "[smoke] 实例未正常结束: $STATUS"; exit 1; }

# 9. 校验输出：行数 = 10万 + 1 表头，末尾多拼接列
[ -f data/output.csv ] || { echo "[smoke] 输出文件不存在"; exit 1; }
LINES=$(wc -l < data/output.csv)
HEAD_LINE=$(head -1 data/output.csv)
TAIL_LINE=$(tail -1 data/output.csv)
COLS=$(echo "$TAIL_LINE" | awk -F',' '{print NF}')
echo "[smoke] 输出行数: $LINES（期望 100001），表头: $HEAD_LINE"
echo "[smoke] 末行列数: $COLS（期望 11 = 10 + 拼接列），末行: $TAIL_LINE"
[ "$LINES" = "100001" ] || { echo "[smoke] 行数校验失败"; exit 1; }
echo "$HEAD_LINE" | grep -q 'concat_col' || { echo "[smoke] 表头缺少拼接列"; exit 1; }
[ "$COLS" = "11" ] || { echo "[smoke] 列数校验失败"; exit 1; }

# 10. 指标采样
INST_ID=$(echo "$RESP" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*' || true)
METRICS=$(curl -s "$CP_URL/api/instances/$INST_ID/metrics" -H "$AUTH")
echo "[smoke] 吞吐采样: $METRICS"

RPS=$((ROWS / (ELAPSED > 0 ? ELAPSED : 1)))
echo "[smoke] ============================================"
echo "[smoke] 冒烟通过：$ROWS 行，端到端耗时 ${ELAPSED}s，吞吐约 ${RPS} 行/s"
echo "[smoke] （耗时含调度/心跳/上报周期约 10~15s 固定开销）"
echo "[smoke] ============================================"
