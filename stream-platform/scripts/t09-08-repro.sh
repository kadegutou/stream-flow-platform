#!/usr/bin/env bash
# t09_08 复现：csv→concat→mysql 100万行，跑到一半 kill 承载分片的 worker，观察断点恢复
set -uo pipefail
BASE=http://localhost:8080/api
TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
AUTH="Authorization: Bearer $TOKEN"

echo "=== 0. 准备目标表 ==="
docker exec -i stream-platform-mysql-1 mysql -uroot -proot123 <<'SQL'
CREATE DATABASE IF NOT EXISTS biz;
DROP TABLE IF EXISTS biz.kill_test;
CREATE TABLE biz.kill_test (
  c1 VARCHAR(64), c2 VARCHAR(64), c3 VARCHAR(64), c4 VARCHAR(64), c5 VARCHAR(64),
  c6 VARCHAR(64), c7 VARCHAR(64), c8 VARCHAR(64), c9 VARCHAR(64), c10 VARCHAR(64),
  concat_col VARCHAR(255)
);
SQL

echo "=== 1. 建作业并上线 ==="
cat > /tmp/dag-kill.json <<'EOF'
{"dag":{"nodes":[
 {"id":"n1","componentCode":"csv-source","params":{"path":"/data/bench/in-100w.csv","hasHeader":true,"batchSize":5000}},
 {"id":"n2","componentCode":"field-concat","params":{"sourceFields":["c1","c2","c3"],"targetField":"concat_col","separator":"-"}},
 {"id":"n3","componentCode":"mysql-sink","params":{"url":"jdbc:mysql://mysql:3306/biz?useSSL=false&allowPublicKeyRetrieval=true","username":"root","password":"root123","table":"kill_test","fields":["c1","c2","c3","c4","c5","c6","c7","c8","c9","c10","concat_col"]}}
],"edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"}]}}
EOF
# 清理旧作业（若存在）
OLD=$(curl -s $BASE/jobs -H "$AUTH" | python3 -c "import json,sys; [print(j['id']) for j in json.load(sys.stdin) if j['name']=='t09-08-repro']" 2>/dev/null)
[ -n "$OLD" ] && { curl -s -X POST $BASE/jobs/$OLD/offline -H "$AUTH" >/dev/null 2>&1; sleep 1; curl -s -X DELETE $BASE/jobs/$OLD -H "$AUTH" >/dev/null; }
docker exec -i stream-platform-mysql-1 mysql -uroot -proot123 -e "TRUNCATE biz.kill_test" 2>/dev/null
JID=$(curl -s -X POST $BASE/jobs -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"t09-08-repro","parallelism":1}' | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
curl -s -X PUT $BASE/jobs/$JID -H "$AUTH" -H "Content-Type: application/json" --data-binary @/tmp/dag-kill.json
echo
curl -s -X POST $BASE/jobs/$JID/online -H "$AUTH"
echo
echo "作业 $JID 已上线"

echo "=== 2. 等分片进入 RUNNING 并处理到一部分 ==="
sleep 15
curl -s $BASE/jobs/$JID/instances -H "$AUTH" | python3 -m json.tool | grep -E 'status|totalRows|progress|fenceToken|workerId|nodeCode' || true
SHARD_WORKER=$(curl -s $BASE/jobs/$JID/instances -H "$AUTH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
inst=d[0] if isinstance(d,list) else d
for s in inst.get('shards',[]):
    print(s.get('workerNodeCode') or s.get('workerId') or '')
" 2>/dev/null)
echo "分片所在 worker 标识: $SHARD_WORKER"

echo "=== 3. kill 承载 worker ==="
# 找到 RUNNING 分片对应的 worker 容器：通过实例接口拿不到容器名就直接 kill 第一个正在跑分片的
# 简化：查 worker 日志确定哪个容器在执行
RUNNER=$(for c in $(docker ps --format '{{.Names}}' | grep worker); do
  if docker logs --since 60s "$c" 2>&1 | grep -q '分片.*启动\|分片.*结束'; then echo "$c"; fi
done | head -1)
# 备用：直接看哪个 worker 容器 CPU 高
if [ -z "$RUNNER" ]; then
  RUNNER=$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' | grep worker | sort -k2 -rn | head -1 | awk '{print $1}')
fi
echo "kill 容器: $RUNNER"
CNT_BEFORE=$(docker exec -i stream-platform-mysql-1 mysql -uroot -proot123 -N -e "SELECT COUNT(*) FROM biz.kill_test")
echo "kill 前已入库: $CNT_BEFORE 行"
docker kill "$RUNNER"

echo "=== 4. 观察恢复（每 10s 采样，共 6 分钟） ==="
for i in $(seq 1 36); do
  sleep 10
  CNT=$(docker exec -i stream-platform-mysql-1 mysql -uroot -proot123 -N -e "SELECT COUNT(*) FROM biz.kill_test" 2>/dev/null)
  ST=$(curl -s $BASE/jobs/$JID/instances -H "$AUTH" | sed -n 's/.*"status":"\([A-Z]*\)".*/\1/p' | head -1)
  echo "[$((i*10))s] 实例=$ST 入库=$CNT"
  [ "$ST" = "STOPPED" ] && break
  [ "$ST" = "FAILED" ] && break
done

echo "=== 5. 终态 ==="
curl -s $BASE/jobs/$JID/instances -H "$AUTH" | python3 -m json.tool
CNT=$(docker exec -i stream-platform-mysql-1 mysql -uroot -proot123 -N -e "SELECT COUNT(*) FROM biz.kill_test")
DUP=$(docker exec -i stream-platform-mysql-1 mysql -uroot -proot123 -N -e "SELECT COUNT(*) FROM (SELECT c1 FROM biz.kill_test GROUP BY c1 HAVING COUNT(*)>1) t")
echo "最终入库=$CNT（期望 >=1000000，at-least-once 允许少量重复）重复c1组数=$DUP"
