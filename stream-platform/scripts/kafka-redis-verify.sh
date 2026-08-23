#!/usr/bin/env bash
# Kafka / Redis 真实环境联通验证（在部署机执行，deploy 栈已启动）
# 流程：csv → kafka-sink 写 10 万行 → 核对 topic 消息数
#       → kafka-source 读回 csv → 核对行数（优雅停止）
#       → Redis 预置 1000 个 hash → csv → redis-enrich → csv → 抽查补数字段
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=http://localhost:8080/api
DATA_HOST=${DATA_HOST:-/home/ubuntu/sp-data}
DATA_CTR=${DATA_CTR:-/data}
ROWS=${ROWS:-100000}

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
AUTH="Authorization: Bearer $TOKEN"
[ -n "$TOKEN" ] || { echo "登录失败"; exit 1; }

mkjob() { # name dagfile -> job id
  local J
  J=$(curl -s -X POST $BASE/jobs -H "$AUTH" -H "Content-Type: application/json" \
      -d "{\"name\":\"$1\",\"parallelism\":1}")
  JID=$(echo "$J" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
  curl -s -X PUT $BASE/jobs/$JID -H "$AUTH" -H "Content-Type: application/json" \
      --data-binary @"$2" > /dev/null
  curl -s -X POST $BASE/jobs/$JID/online -H "$AUTH" > /dev/null
  echo "$JID"
}
wait_stop() { # jid -> 0=STOPPED 1=FAILED
  while true; do
    local ST
    ST=$(curl -s $BASE/jobs/$1/instances -H "$AUTH" | sed -n 's/.*"status":"\([A-Z]*\)".*/\1/p' | head -1)
    [ "$ST" = "STOPPED" ] && return 0
    [ "$ST" = "FAILED" ] && return 1
    sleep 2
  done
}
cleanup() { curl -s -X POST $BASE/jobs/$1/offline -H "$AUTH" >/dev/null 2>&1 || true; sleep 1;
            curl -s -X DELETE $BASE/jobs/$1 -H "$AUTH" >/dev/null 2>&1 || true; }

echo "=== 0. 准备 10 万行输入 ==="
head -$((ROWS+1)) "$DATA_HOST/bench/in-100w.csv" > "$DATA_HOST/bench/in-10w.csv"

echo "=== 1. CSV → Kafka（topic verify-topic）==="
docker exec stream-platform-kafka-1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --delete --topic verify-topic 2>/dev/null || true
docker exec stream-platform-kafka-1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --create --topic verify-topic --partitions 3 > /dev/null

cat > /tmp/dag-ck.json <<EOF
{"dag":{"nodes":[
 {"id":"n1","componentCode":"csv-source","params":{"path":"$DATA_CTR/bench/in-10w.csv","hasHeader":true,"batchSize":5000}},
 {"id":"n2","componentCode":"kafka-sink","params":{"bootstrapServers":"kafka:29092","topic":"verify-topic"}}
],"edges":[{"from":"n1","to":"n2"}]}}
EOF
T0=$(date +%s)
J=$(mkjob verify-csv2kafka /tmp/dag-ck.json)
wait_stop "$J" || { echo "csv→kafka FAILED"; exit 1; }
T1=$(date +%s)
cleanup "$J"
CNT=$(docker exec stream-platform-kafka-1 /opt/kafka/bin/kafka-get-offsets.sh \
  --bootstrap-server localhost:9092 --topic verify-topic | awk -F: '{s+=$3} END{print s}')
echo "topic 消息数=$CNT（期望 $ROWS），写入耗时 $((T1-T0))s"
[ "$CNT" = "$ROWS" ] || { echo "!! 消息数不符"; exit 1; }

echo "=== 2. Kafka → CSV（读回，读到 $ROWS 行后优雅停止）==="
rm -f "$DATA_HOST/bench/out-kafka.csv"
cat > /tmp/dag-kc.json <<EOF
{"dag":{"nodes":[
 {"id":"n1","componentCode":"kafka-source","params":{"bootstrapServers":"kafka:29092","topic":"verify-topic","groupId":"verify-g1","batchSize":5000}},
 {"id":"n2","componentCode":"csv-sink","params":{"path":"$DATA_CTR/bench/out-kafka.csv"}}
],"edges":[{"from":"n1","to":"n2"}]}}
EOF
J=$(mkjob verify-kafka2csv /tmp/dag-kc.json)
for i in $(seq 1 60); do
  [ -f "$DATA_HOST/bench/out-kafka.csv" ] && \
  [ "$(wc -l < "$DATA_HOST/bench/out-kafka.csv")" -ge $((ROWS+1)) ] && break
  sleep 2
done
curl -s -X POST $BASE/jobs/$J/offline -H "$AUTH" > /dev/null   # 触发优雅停止
wait_stop "$J" || { echo "kafka→csv FAILED"; exit 1; }
KROWS=$(wc -l < "$DATA_HOST/bench/out-kafka.csv")
echo "读回行数=$KROWS（期望 $((ROWS+1)) 含表头）"
[ "$KROWS" = "$((ROWS+1))" ] || { echo "!! 读回行数不符"; exit 1; }
cleanup "$J"

echo "=== 3. Redis 补数（csv → redis-enrich → csv）==="
{ for i in $(seq 1 1000); do echo "HSET user:v1_$i name name_$i city city_$i score $i"; done; } \
  | docker exec -i stream-platform-redis-1 redis-cli --pipe > /dev/null
rm -f "$DATA_HOST/bench/out-redis.csv"
cat > /tmp/dag-rd.json <<EOF
{"dag":{"nodes":[
 {"id":"n1","componentCode":"csv-source","params":{"path":"$DATA_CTR/bench/in-10w.csv","hasHeader":true,"batchSize":5000}},
 {"id":"n2","componentCode":"redis-enrich","params":{"host":"redis","port":6379,"keyField":"c1","keyPrefix":"user:","resultType":"fields"}},
 {"id":"n3","componentCode":"csv-sink","params":{"path":"$DATA_CTR/bench/out-redis.csv"}}
],"edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"}]}}
EOF
J=$(mkjob verify-redis /tmp/dag-rd.json)
wait_stop "$J" || { echo "redis-enrich FAILED"; exit 1; }
cleanup "$J"
RROWS=$(wc -l < "$DATA_HOST/bench/out-redis.csv")
HIT=$(grep -c ',name_' "$DATA_HOST/bench/out-redis.csv" || true)
echo "输出行数=$RROWS（期望 $((ROWS+1))），命中补数行数=$HIT（期望 1000）"
head -3 "$DATA_HOST/bench/out-redis.csv"
[ "$RROWS" = "$((ROWS+1))" ] && [ "$HIT" = "1000" ] || { echo "!! redis 补数校验不符"; exit 1; }

echo "=== Kafka/Redis 真实环境验证全部通过 ==="
