#!/usr/bin/env bash
# ============================================================================
# T4 性能矩阵 runner（评审整改任务 T4）
#
# 目的：为 docs/05（性能测试报告）与 docs/12 的矛盾提供**唯一权威口径**。
#       评审 P0-2 明确要求「每格 3 次取中位数并给方差」，本轮补齐。
#
# 用法：
#   bash ~/t4-matrix.sh            # 全量矩阵：8 格 × 3 次 = 24 次运行
#   bash ~/t4-matrix.sh --pilot    # 只跑 1 格 1 次，验证链路（约 1 分钟）
#
# 产出（都在 ~/stream-platform/logs/）：
#   t4-matrix-<时间戳>.log      完整终端输出
#   t4-iostat-<格位>.txt        L 档磁盘采样（验证「磁盘是否饱和」）
#   t4-summary-<时间戳>.md      中位数汇总表
#
# 注意：跑之前确认没有别的作业在跑 —— 本脚本会改 worker 数量。
# ============================================================================
set -uo pipefail

ROOT=$HOME/stream-platform
BENCH=$ROOT/scripts/bench.sh
LOGDIR=$ROOT/logs
mkdir -p "$LOGDIR"

PILOT=0
[ "${1:-}" = "--pilot" ] && PILOT=1

STAMP=$(date +%Y%m%d-%H%M%S)
OUTLOG=$LOGDIR/t4-matrix-$STAMP.log
SUMMARY=$LOGDIR/t4-summary-$STAMP.md

echo "日志: $OUTLOG"
echo "汇总: $SUMMARY"

BASE=http://localhost:8080/api
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
        -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then echo "!! 登录失败，退出"; exit 1; fi
AUTH="Authorization: Bearer $TOKEN"

# 之后所有输出同时进日志
exec >>"$OUTLOG" 2>&1

echo "===== T4 性能矩阵开始 $(date -Is) ====="

# ---------------------------------------------------------------------------
# worker 伸缩：改数量并等到目标数量 ONLINE（否则分片会派给不足的节点）
# ---------------------------------------------------------------------------
count_online() {
  curl -s $BASE/workers -H "$AUTH" | grep -o '"status":"ONLINE"' | wc -l
}

scale_workers() {
  local n=$1 i cnt
  echo "[$(date +%H:%M:%S)] worker 数 -> $n"
  ( cd "$ROOT/deploy" && docker compose up -d --scale "worker=$n" --no-deps worker ) >/dev/null 2>&1

  # 第一步：等**真实容器数**到位。缩容后 API 里的 ONLINE 记录有 30s 心跳超时窗口，
  # 光看 API 会误判（删掉的 worker 仍显示 ONLINE），所以以容器数为准。
  cnt=-1
  for i in $(seq 1 60); do
    cnt=$(docker ps --filter "name=stream-platform-worker" --format "{{.Names}}" | wc -l)
    [ "$cnt" -eq "$n" ] && break
    sleep 2
  done
  if [ "$cnt" -ne "$n" ]; then echo "  !! 容器数未达标：期望 $n 实际 $cnt"; return 1; fi

  # 第二步：给新 worker 时间向控制面注册（心跳间隔数秒），再确认 ONLINE 数
  sleep 12
  echo "  就绪：容器=$cnt ONLINE=$(count_online)"
  return 0
}

# ---------------------------------------------------------------------------
# 单次运行：调 bench.sh，跑完立刻删输出（否则 24 次会占掉 80G+）
# ---------------------------------------------------------------------------
run_one() {
  local data=$1 rows=$2 par=$3 tag=$4
  local out=/data/bench/bench-$tag.csv
  local outhost=$HOME/sp-data/bench/bench-$tag.csv

  # 清上一轮残留（并行度>1 时输出是 bench-<tag>.partN.csv）
  rm -f "${outhost%.csv}".part*.csv "$outhost" 2>/dev/null

  echo "--- [$tag] 并行度=$par 行数=$rows ---"
  PARALLELISM=$par OUT=$out OUT_HOST=$outhost bash "$BENCH" "$data" "$rows" "$tag"

  rm -f "${outhost%.csv}".part*.csv "$outhost" 2>/dev/null
}

# ---------------------------------------------------------------------------
# 矩阵定义：数据 行数 并行度 worker数 格位名
# ---------------------------------------------------------------------------
M=/data/bench/in-1000w.csv
L=/data/bench/in-5000w.csv

if [ "$PILOT" = "1" ]; then
  CELLS=( "$M 10000000 1 1 M-pilot" )
  echo "*** PILOT：只跑 M / p1 / 1 worker 一次 ***"
else
  CELLS=(
    "$M 10000000 1 1 M-p1-w1"
    "$M 10000000 2 1 M-p2-w1"
    "$M 10000000 4 1 M-p4-w1"
    "$M 10000000 4 2 M-p4-w2"
    "$M 10000000 6 3 M-p6-w3"
    "$L 50000000 1 1 L-p1-w1"
    "$L 50000000 4 2 L-p4-w2"
    "$L 50000000 6 3 L-p6-w3"
  )
fi

# 外部格位清单：设了 T4_CELLS_FILE 就用它替代内置矩阵，便于做隔离实验。
# 每行格式：数据路径 行数 并行度 worker数 格位名
if [ -n "${T4_CELLS_FILE:-}" ]; then
  if [ ! -f "$T4_CELLS_FILE" ]; then
    echo "!! T4_CELLS_FILE 指向的文件不存在：$T4_CELLS_FILE"; exit 1
  fi
  mapfile -t CELLS < "$T4_CELLS_FILE"
  echo "*** 使用外部格位清单 $T4_CELLS_FILE（${#CELLS[@]} 格）***"
fi

for cell in "${CELLS[@]}"; do
  set -- $cell
  DATA=$1; ROWS=$2; PAR=$3; WK=$4; NAME=$5
  echo
  echo "================ $NAME （并行度=$PAR / worker=$WK） ================"
  scale_workers "$WK" || { echo "跳过 $NAME"; continue; }

  # L 档开磁盘采样，用于回答「磁盘到底饱和没有」
  IOSTAT_PID=""
  if [ "$DATA" = "$L" ]; then
    iostat -x 1 > "$LOGDIR/t4-iostat-$NAME.txt" 2>&1 &
    IOSTAT_PID=$!
    echo "  iostat 采样已启动 -> t4-iostat-$NAME.txt"
  fi

  # 每个格位都采 CPU。用于判断「并发收益何时反转」：看 run-queue 是否超过 vCPU 数
  # （超了就是 CPU 超配），以及 %sy / 上下文切换是否飙升。
  vmstat 1 > "$LOGDIR/t4-vmstat-$NAME.txt" 2>&1 &
  VMSTAT_PID=$!

  # 预热一次并丢弃。上一轮实测：每格首次运行普遍最慢（页缓存冷、worker JVM 冷、
  # JIT 未热身），会把中位数和加速比都拉偏。预热结果不进入汇总。
  run_one "$DATA" "$ROWS" "$PAR" "$NAME-warmup"

  for r in 1 2 3; do
    run_one "$DATA" "$ROWS" "$PAR" "$NAME-r$r"
    [ "$PILOT" = "1" ] && break
  done

  [ -n "$IOSTAT_PID" ] && { kill "$IOSTAT_PID" 2>/dev/null; wait "$IOSTAT_PID" 2>/dev/null; }
  kill "$VMSTAT_PID" 2>/dev/null; wait "$VMSTAT_PID" 2>/dev/null
done

echo
echo "===== 矩阵执行完毕 $(date -Is) ====="

# ---------------------------------------------------------------------------
# 汇总：解析每格 3 次的端到端耗时，给中位数、极差（方差证据）
# ---------------------------------------------------------------------------
python3 - "$OUTLOG" "$SUMMARY" "$STAMP" <<'PYEOF'
import re, sys, statistics
logf, summ, stamp = sys.argv[1], sys.argv[2], sys.argv[3]
rows = {}
pat = re.compile(r'^\[(.+?)\] 行数=(\d+) 端到端=([\d.]+)s 吞吐=(\d+)行/s \(([\d.]+) MB/s\) 输出校验=(\d+)行/(\d+)字节')
for line in open(logf, encoding='utf-8', errors='ignore'):
    m = pat.match(line.strip())
    if not m: continue
    tag = m.group(1)
    cell = re.sub(r'-r\d+$', '', tag)
    if cell.endswith('-warmup'):
        continue  # 预热结果不进入汇总
    rows.setdefault(cell, []).append((float(m.group(3)), int(m.group(4)), float(m.group(5)), int(m.group(6)), int(m.group(7))))

out = [f"# T4 性能矩阵汇总（{stamp}）", "",
       "> 每格 3 次独立运行；吞吐 = 行数 / 端到端耗时。原始日志见同名 .log。", "",
       "| 格位 | 各次耗时(s) | 中位数(s) | 极差 | 中位吞吐(行/s) | MB/s | 输出校验 |",
       "|---|---|---|---|---|---|---|"]
for cell in sorted(rows):
    v = rows[cell]
    el = [x[0] for x in v]
    med = statistics.median(el)
    rng = (max(el) - min(el)) / med * 100 if len(el) > 1 else 0.0
    rows_n = v[0][3]
    ok = "✓" if all(x[3] == rows_n for x in v) else "✗ 不一致"
    out.append("| {} | {} | **{:.1f}** | {:.1f}% | {:.0f} | {:.1f} | {} |".format(
        cell, "/".join(f"{e:.1f}" for e in el), med, rng, v[0][1], v[0][2], ok))
open(summ, 'w', encoding='utf-8').write("\n".join(out) + "\n")
print("汇总已写入:", summ)
PYEOF

echo "===== 全部结束 $(date -Is) ====="
