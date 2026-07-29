#!/usr/bin/env bash
# 生成测试 csv（默认 10 万行、10 字段）。用法: bash data/gen_csv.sh [输出路径] [行数]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:-data/input.csv}
ROWS=${2:-100000}
mkdir -p "$(dirname "$OUT")"
awk -v n="$ROWS" 'BEGIN{
  print "c1,c2,c3,c4,c5,c6,c7,c8,c9,c10";
  for(i=1;i<=n;i++)
    printf "v1_%d,v2_%d,v3_%d,v4_%d,v5_%d,v6_%d,v7_%d,v8_%d,v9_%d,v10_%d\n",i,i,i,i,i,i,i,i,i,i;
}' > "$OUT"
echo "generated $OUT ($ROWS rows, $(wc -c < "$OUT") bytes)"
