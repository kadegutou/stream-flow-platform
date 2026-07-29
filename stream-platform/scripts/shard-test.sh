#!/usr/bin/env bash
# 文件分片实测：100 万行 csv，并行度=4，csv-source → field-concat → csv-sink。
# 验证：产生 4 个分文件、总行数=100万+4 个表头、无重复无丢失（按行号校验）。
# 日志：scripts/shard-test.log
#
# 可用环境变量覆盖默认值（如本机 8080/8081 被占用时换端口、换 jar 目录）：
#   CP_PORT（默认 8080） WK_PORT（默认 8081）
#   JAR_DIR（默认项目根，需含 sp-control-plane/target、sp-worker/target）
#   DATA_DIR（默认 $ROOT/data）
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
ROOT_WIN=$(pwd -W 2>/dev/null || pwd)
LOG=scripts/shard-test.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

CP_PORT=${CP_PORT:-8080}
WK_PORT=${WK_PORT:-8081}
CP_URL="http://localhost:$CP_PORT"
JAR_DIR=${JAR_DIR:-$ROOT}
DATA_DIR=${DATA_DIR:-$ROOT/data}
ROWS=1000000
PARALLELISM=4
CP_PID=""
WK_PID=""

cleanup() {
  echo "[shard-test] 清理后台进程"
  [ -n "$CP_PID" ] && kill "$CP_PID" 2>/dev/null || true
  [ -n "$WK_PID" ] && kill "$WK_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "[shard-test] $(date '+%F %T') 开始：ROWS=$ROWS PARALLELISM=$PARALLELISM"
echo "[shard-test] CP_URL=$CP_URL JAR_DIR=$JAR_DIR DATA_DIR=$DATA_DIR"
mkdir -p "$DATA_DIR" scripts logs

# 1. 生成 100 万行测试数据
bash data/gen_csv.sh "$DATA_DIR/shard-input.csv" "$ROWS"

# 2. 启动控制面（dev/H2）
java -jar "$JAR_DIR/sp-control-plane/target/sp-control-plane-1.0.0.jar" \
  --server.port="$CP_PORT" > logs/shard-cp.log 2>&1 &
CP_PID=$!
echo "[shard-test] 控制面启动中 pid=$CP_PID port=$CP_PORT"
READY=0
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$CP_URL/api/components" || true)
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then READY=1; break; fi
  sleep 2
done
[ "$READY" = "1" ] || { echo "[shard-test] 控制面启动失败，见 logs/shard-cp.log"; exit 1; }
echo "[shard-test] 控制面就绪"

# 3. 启动 Worker
java -jar "$JAR_DIR/sp-worker/target/sp-worker-1.0.0.jar" \
  --server.port="$WK_PORT" --sp.control-plane-url="$CP_URL" \
  > logs/shard-wk.log 2>&1 &
WK_PID=$!
echo "[shard-test] Worker 启动中 pid=$WK_PID port=$WK_PORT，等待注册..."
sleep 15
kill -0 "$WK_PID" 2>/dev/null || { echo "[shard-test] Worker 启动失败，见 logs/shard-wk.log"; exit 1; }

# 4. 登录
LOGIN=$(curl -s -X POST "$CP_URL/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "[shard-test] 登录失败: $LOGIN"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
echo "[shard-test] 登录成功"

# 5. 创建并行度=4 的作业
DATA_WIN=$(cd "$DATA_DIR" && pwd -W 2>/dev/null || pwd)
IN_PATH="$DATA_WIN/shard-input.csv"
OUT_PATH="$DATA_WIN/shard-output.csv"
rm -f "$DATA_DIR"/shard-output*.csv
BODY_FILE=scripts/.shard_body.json
cat > "$BODY_FILE" <<EOF
{"name":"shard-csv-concat","description":"file shard test","parallelism":$PARALLELISM,"dag":{
 "nodes":[
  {"id":"n1","componentCode":"csv-source","params":{"path":"$IN_PATH","delimiter":",","hasHeader":true,"batchSize":5000}},
  {"id":"n2","componentCode":"field-concat","params":{"sourceFields":["c1","c2","c3"],"targetField":"concat_col","separator":"-"}},
  {"id":"n3","componentCode":"csv-sink","params":{"path":"$OUT_PATH","delimiter":","}}],
 "edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"}]}}
EOF
CREATE=$(curl -s -X POST "$CP_URL/api/jobs" -H "$AUTH" -H 'Content-Type: application/json; charset=utf-8' --data-binary "@$BODY_FILE")
JOB_ID=$(echo "$CREATE" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
[ -n "$JOB_ID" ] || { echo "[shard-test] 创建作业失败: $CREATE"; exit 1; }
echo "[shard-test] 创建作业 id=$JOB_ID parallelism=$PARALLELISM"

# 6. 上线
START=$(date +%s)
ONLINE=$(curl -s -X POST "$CP_URL/api/jobs/$JOB_ID/online" -H "$AUTH")
echo "[shard-test] 上线: $(echo "$ONLINE" | head -c 200)"

# 7. 轮询实例状态至 STOPPED / FAILED
STATUS=""
LAST=""
for _ in $(seq 1 180); do
  RESP=$(curl -s "$CP_URL/api/jobs/$JOB_ID/instances" -H "$AUTH")
  STATUS=$(echo "$RESP" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p' | head -1)
  if [ "$STATUS" != "$LAST" ]; then echo "[shard-test] 实例状态: $STATUS"; LAST="$STATUS"; fi
  case "$STATUS" in STOPPED|FAILED) break;; esac
  sleep 2
done
END=$(date +%s)
ELAPSED=$((END - START))
echo "[shard-test] 最终实例: $RESP"
[ "$STATUS" = "STOPPED" ] || { echo "[shard-test] 实例未正常结束: $STATUS"; exit 1; }

# 8. 校验分文件
PARTS=$(ls "$DATA_DIR"/shard-output.part*.csv 2>/dev/null | wc -l | tr -d ' ')
echo "[shard-test] 分文件数: $PARTS（期望 $PARALLELISM）"
for f in "$DATA_DIR"/shard-output.part*.csv; do
  echo "[shard-test]   $(basename "$f"): $(wc -l < "$f") 行, 表头: $(head -1 "$f")"
done
[ "$PARTS" = "$PARALLELISM" ] || { echo "[shard-test] 分文件数不符"; exit 1; }

TOTAL_LINES=$(cat "$DATA_DIR"/shard-output.part*.csv | wc -l)
EXPECT_LINES=$((ROWS + PARALLELISM)) # 每个分文件各 1 个表头
echo "[shard-test] 总行数: $TOTAL_LINES（期望 $EXPECT_LINES = $ROWS 数据 + $PARALLELISM 表头）"
[ "$TOTAL_LINES" = "$EXPECT_LINES" ] || { echo "[shard-test] 总行数不符"; exit 1; }

# 9. 无重复无丢失：抽取首列行号 v1_N → N，排序后与 1..ROWS 全量比对
cat "$DATA_DIR"/shard-output.part*.csv | grep -v '^c1,' | cut -d',' -f1 \
  | sed 's/^v1_//' | sort -n > scripts/.shard_actual.txt
seq 1 "$ROWS" > scripts/.shard_expect.txt
if diff -q scripts/.shard_expect.txt scripts/.shard_actual.txt > /dev/null; then
  echo "[shard-test] 行号校验通过：1..$ROWS 无重复无丢失"
else
  echo "[shard-test] 行号校验失败，差异前 10 行："
  diff scripts/.shard_expect.txt scripts/.shard_actual.txt | head -10
  exit 1
fi
rm -f scripts/.shard_actual.txt scripts/.shard_expect.txt "$BODY_FILE"

# 10. 抽查末行拼接列
SAMPLE=$(tail -1 "$DATA_DIR/shard-output.part$((PARALLELISM - 1)).csv")
echo "[shard-test] 抽查末行: $SAMPLE"

RPS=$((ROWS / (ELAPSED > 0 ? ELAPSED : 1)))
echo "[shard-test] ============================================"
echo "[shard-test] 分片测试通过：$ROWS 行 × $PARALLELISM 分片，耗时 ${ELAPSED}s，约 ${RPS} 行/s"
echo "[shard-test] ============================================"
