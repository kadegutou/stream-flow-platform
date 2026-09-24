#!/usr/bin/env bash
# 通用流处理任务管理平台 —— 本地一键启停脚本（Git Bash / WSL / Linux）
#
# 用法（在项目根目录或任意位置执行）：
#   bash scripts/platform.sh start     启动控制面 + Worker + 前端
#   bash scripts/platform.sh stop      停止全部
#   bash scripts/platform.sh restart   重启全部
#   bash scripts/platform.sh status    查看状态
#   bash scripts/platform.sh logs cp   跟踪日志（cp 控制面 / wk Worker / fe 前端）
#
# 说明：
#   - 后端默认用 H2 内存库，重启后作业/用户数据会清空（admin 自动重建）
#   - 停止按「监听端口反查真实进程」实现：Git Bash 下 $! 是 MSYS 包装 PID，
#     直接 kill 打不到 java.exe / node.exe，必须用 taskkill
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

CP_JAR="$ROOT/sp-control-plane/target/sp-control-plane-1.0.0.jar"
WK_JAR="$ROOT/sp-worker/target/sp-worker-1.0.0.jar"
FE_DIR="$ROOT/frontend"

CP_PORT=8080
WK_PORT=8081
FE_PORT=5173

# ---------- 基础工具 ----------

is_msys() { case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac; }

port_open() { (echo > "/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

# 反查监听指定端口的进程 PID
pid_by_port() {
  local port="$1"
  if is_msys; then
    netstat -ano 2>/dev/null | grep "LISTENING" | grep -E ":${port}[[:space:]]" | awk '{print $NF}' | head -1
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null | head -1
  fi
}

# 终止占用指定端口的进程（端口比 PID 文件可靠：MSYS 的 $! 不是真实 PID）
kill_port() {
  local port="$1" pid
  pid="$(pid_by_port "$port")"
  [ -z "$pid" ] && return 1
  if is_msys; then
    taskkill //PID "$pid" //F >/dev/null 2>&1 || return 1
  else
    kill -9 "$pid" 2>/dev/null || return 1
  fi
  return 0
}

# jar 是否比源码旧（改了 Java 代码但忘记重新打包）
jar_stale() {
  local jar="$1" mod="$2"
  [ -f "$jar" ] || return 0
  [ -n "$(find "$mod/src" -name '*.java' -newer "$jar" 2>/dev/null | head -1)" ]
}

start_svc() { # $1=名称 $2=端口 $3=工作目录 $4..=命令
  local name="$1" port="$2" dir="$3"; shift 3
  if port_open "$port"; then
    echo "  [跳过] $name 已在运行（端口 $port 被占用）"
    return 0
  fi
  ( cd "$dir" && nohup "$@" > "$LOGS/$name.log" 2>&1 & )
  echo "  [启动] $name（端口 $port）  日志: logs/$name.log"
}

stop_svc() { # $1=名称 $2=端口
  local name="$1" port="$2"
  if ! port_open "$port"; then
    echo "  [跳过] $name 未运行"
    return 0
  fi
  if ! kill_port "$port"; then
    echo "  [失败] $name 无法终止（端口 $port 的进程未找到）"
    return 1
  fi
  for _ in $(seq 1 20); do
    port_open "$port" || break
    sleep 0.5
  done
  if port_open "$port"; then
    echo "  [警告] $name 端口 $port 仍被占用"
    return 1
  fi
  echo "  [停止] $name"
}

wait_http() { # $1=url $2=描述 $3=最长等待秒数
  local url="$1" desc="$2" max="${3:-30}"
  for _ in $(seq 1 "$max"); do
    if curl -s -m 2 -o /dev/null "$url" 2>/dev/null; then
      echo "  [就绪] $desc"
      return 0
    fi
    sleep 1
  done
  echo "  [警告] $desc 等待超时，请查看 logs/"
  return 1
}

# ---------- 子命令 ----------

do_start() {
  echo "==> 启动平台（$ROOT）"

  if [ ! -f "$CP_JAR" ] || [ ! -f "$WK_JAR" ]; then
    echo "  [错误] 未找到 jar，请先构建："
    echo "         cd \"$ROOT\" && mvn -q package -DskipTests"
    exit 1
  fi
  if jar_stale "$CP_JAR" "$ROOT/sp-control-plane" || jar_stale "$WK_JAR" "$ROOT/sp-worker"; then
    echo "  [提示] Java 源码比 jar 新，跑的是旧逻辑。建议重新打包："
    echo "         cd \"$ROOT\" && mvn -q package -DskipTests"
  fi
  if [ ! -d "$FE_DIR/node_modules" ]; then
    echo "  [错误] 前端依赖未安装：cd \"$FE_DIR\" && npm install"
    exit 1
  fi

  start_svc control-plane $CP_PORT "$ROOT" java -jar "$CP_JAR"
  wait_http "http://localhost:$CP_PORT/api/components" "控制面（$CP_PORT）" 40

  start_svc worker $WK_PORT "$ROOT" java -jar "$WK_JAR"
  wait_http "http://localhost:$WK_PORT/actuator/health" "Worker（$WK_PORT）" 20

  start_svc frontend $FE_PORT "$FE_DIR" node "$FE_DIR/node_modules/vite/bin/vite.js" --host
  wait_http "http://localhost:$FE_PORT/" "前端（$FE_PORT）" 30

  echo
  echo "==> 就绪"
  echo "    前端    http://localhost:$FE_PORT      （admin / admin123）"
  echo "    控制面  http://localhost:$CP_PORT"
  echo "    停止    bash scripts/platform.sh stop"
}

do_stop() {
  echo "==> 停止平台"
  stop_svc frontend $FE_PORT
  stop_svc worker $WK_PORT
  stop_svc control-plane $CP_PORT
  echo "==> 完成"
}

do_status() {
  echo "==> 服务状态"
  local pair name port pid state
  for pair in "control-plane:$CP_PORT" "worker:$WK_PORT" "frontend:$FE_PORT"; do
    name="${pair%%:*}"; port="${pair##*:}"
    if port_open "$port"; then
      pid="$(pid_by_port "$port")"
      state="运行中 (PID ${pid:-?})"
    else
      state="未运行"
    fi
    printf "  %-14s %-22s 端口 %s\n" "$name" "$state" "$port"
  done

  # curl -w 的输出不经 shell，中文会乱码，这里只用 ASCII
  local code
  code="$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://localhost:$CP_PORT/api/components" 2>/dev/null)"
  if [ -n "$code" ] && [ "$code" != "000" ]; then
    echo "  健康检查: 控制面存活 (HTTP $code; 401 = 接口需登录鉴权)"
  else
    echo "  健康检查: 控制面无法连接"
  fi
}

do_logs() {
  case "${1:-cp}" in
    cp|control-plane) tail -f "$LOGS/control-plane.log" ;;
    wk|worker)        tail -f "$LOGS/worker.log" ;;
    fe|frontend)      tail -f "$LOGS/frontend.log" ;;
    *) echo "用法: bash scripts/platform.sh logs [cp|wk|fe]"; exit 1 ;;
  esac
}

case "${1:-}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; echo; do_start ;;
  status)  do_status ;;
  logs)    shift; do_logs "${1:-cp}" ;;
  *)
    echo "通用流处理任务管理平台 —— 本地启停脚本"
    echo
    echo "用法: bash scripts/platform.sh <命令>"
    echo "  start           启动控制面 + Worker + 前端"
    echo "  stop            停止全部"
    echo "  restart         重启全部"
    echo "  status          查看状态"
    echo "  logs cp|wk|fe   跟踪日志"
    ;;
esac
