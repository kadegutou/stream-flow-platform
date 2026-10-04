# 通用流处理任务管理平台 —— 部署文档

> 部署方式：Docker Compose 一键部署。

## 1. 环境要求

| 项 | 要求 |
|---|---|
| 硬件 | 8 vCPU / 32GB 内存 / 300GB 磁盘（性能测试基准环境） |
| Docker | 24+ |
| Docker Compose | v2（`docker compose version` 可查） |
| 网络 | 首次构建需访问 Maven Central / npm registry / Docker Hub（内网见 §6.3 镜像加速） |

占用端口：80（前端）、8080（控制面 API）、3306（MySQL）、6379（Redis）、9092（Kafka）。

## 2. 部署步骤

无需预先 `mvn package` / `npm build`——后端与前端镜像均在 Docker 内多阶段构建。

```bash
git clone https://github.com/kadegutou/stream-flow-platform.git stream-platform
cd stream-platform/deploy
docker compose up -d --build
```

首次构建约 10~20 分钟（下载基础镜像 + Maven/npm 依赖）。之后改动代码重建只需：

```bash
docker compose up -d --build control-plane worker
```

查看状态与日志：

```bash
docker compose ps
docker compose logs -f control-plane
docker compose logs -f worker
```

停止与清理：

```bash
docker compose down          # 停止并删除容器（数据卷保留）
docker compose down -v       # 连数据卷一起删除（MySQL/Kafka/共享数据全部清空）
```

## 3. 服务清单与验证

| 服务 | 镜像/构建 | 端口 | 说明 |
|---|---|---|---|
| frontend | 本地构建（node:20-alpine + nginx:alpine） | 80 | 前端 SPA，/api 反代控制面 |
| control-plane | 本地构建（maven:3.9-jdk21 + temurin:21-jre） | 8080 | 控制面，prod profile + MySQL |
| worker | 本地构建（同上） | -（容器内 8081） | 数据面，可 --scale 扩容 |
| mysql | mysql:8.4 | 3306 | 元数据库，首启自动建库建表 |
| redis | redis:7-alpine | 6379 | redis-enrich 补数控件数据源 |
| kafka | apache/kafka:3.9.1 | 9092 | KRaft 单 broker |

![图 3-1　Docker Compose 部署拓扑（6 个容器 + 共享卷）](figures/fig-07-部署拓扑.png)

### 3.1 登录验证

```bash
curl -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
# 返回 {"token":"...","nickname":"管理员","role":"ADMIN"}
```

或直接访问 `http://localhost/` 使用 Web 界面（admin / admin123）。

### 3.2 端到端作业验证（csv → 字段拼接 → csv）

共享卷 `data-exchange` 挂载到 control-plane 与所有 worker 容器的 `/data`，文件类作业的路径一律使用 `/data/...`：

```bash
# 1. 在共享卷中生成 10 万行测试 csv（借 control-plane 容器写入 /data）
docker compose exec control-plane sh -c \
  'echo "c1,c2,c3" > /data/in.csv && for i in $(seq 1 100000); do echo "a$i,b$i,c$i" >> /data/in.csv; done'

# 2. 取 token
TOKEN=$(curl -s -X POST http://localhost/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

# 3. 创建作业
curl -X POST http://localhost/api/jobs \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"demo-csv","parallelism":1,"dag":{
    "nodes":[
      {"id":"n1","componentCode":"csv-source","params":{"path":"/data/in.csv"}},
      {"id":"n2","componentCode":"field-concat","params":{"sourceFields":["c1","c2"],"targetField":"ab","separator":"-"}},
      {"id":"n3","componentCode":"csv-sink","params":{"path":"/data/out.csv"}}],
    "edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"}]}}'

# 4. 上线
curl -X POST http://localhost/api/jobs/1/online -H "Authorization: Bearer $TOKEN"

# 5. 查实例状态（约 10~20s 后应为 STOPPED，totalRows=100000）
curl http://localhost/api/jobs/1/instances -H "Authorization: Bearer $TOKEN"

# 6. 校验输出
docker compose exec control-plane sh -c 'wc -l /data/out.csv && head -2 /data/out.csv'
```

## 4. 横向扩展

```bash
docker compose up -d --scale worker=3
```

- Worker 无状态，启动即向控制面注册（nodeCode = 容器 hostname，天然互不相同，故**不要**给 worker 设置 `container_name` 或固定 `WORKER_NODE_CODE`）；
- 调度器每 5s 把 PENDING 分片按「负载最少优先」派给在线 Worker，新 Worker 注册后自动参与分配；
- 并行度 >1 的文件作业：csv-source 按字节切片，csv-sink 输出 `xxx.partN.csv` 分文件；Kafka 作业按分区消费；
- Worker 心跳超时 30s 其分片自动重置重派（故障自愈）；
- 对比实验：`--scale worker=1` 跑基准 → `--scale worker=3` 再跑，吞吐应有明显提升（实测加速比与瓶颈分析见《性能测试报告》§4.2）。

## 5. 配置说明

### 5.1 环境变量如何覆盖应用配置

| 配置项（代码中的 key） | 覆盖方式 | compose 中的位置 |
|---|---|---|
| `spring.profiles.active` | `SPRING_PROFILES_ACTIVE=prod` | control-plane |
| `spring.datasource.url/username/password` | `SPRING_DATASOURCE_URL/USERNAME/PASSWORD` | control-plane |
| `sp.jwt.secret`、`sp.worker-token` | `SPRING_APPLICATION_JSON`（JSON 层级与 yml 一致，优先级最高） | control-plane |
| `sp.control-plane-url`、`sp.worker-token` | `SPRING_APPLICATION_JSON` | worker |

> Spring 宽松绑定也支持 `SP_WORKERTOKEN`、`SP_CONTROLPLANEURL` 形式，本方案统一用
> `SPRING_APPLICATION_JSON`，自定义 key 一目了然、不易写错。

**安全提示**：`sp.jwt.secret`、`sp.worker-token`、MySQL 密码在 compose 中均为开发默认值，生产部署务必替换（控制面与 Worker 的 worker-token 必须保持一致）。

### 5.2 元数据库初始化

- MySQL 容器首次启动时：`MYSQL_DATABASE=stream_platform` 自动建库，`MYSQL_USER=stream` 自动授权；
- `deploy/schema-mysql.sql` 挂载到 `/docker-entrypoint-initdb.d/` 自动执行，建 7 张 `sp_` 前缀表（与 JPA 实体一致）；
- 控制面 prod profile 为 `ddl-auto: none`，只认既有表结构；
- 数据已持久化在 `mysql-data` 卷，重启不重复初始化。

## 6. 常见问题

### 6.1 控制面首次启动报数据库连接失败

MySQL 8 首次初始化（建库 + initdb 建表）可能耗时数十秒。compose 已配置
`depends_on: mysql (service_healthy)`，控制面会等 MySQL 健康检查通过后才启动；
若仍偶发失败，`restart: unless-stopped` 会自动拉起，稍等即可。

### 6.2 Kafka advertised.listeners 说明

Kafka 客户端连接分两步：先连 bootstrap 地址，再按 broker **advertised** 的地址二次连接。本配置：

- 容器间（Worker/控制面）：bootstrap 用 `kafka:29092`，advertised 为 `PLAINTEXT://kafka:29092`；
- 宿主机工具（如宿主机上的 kafka-topics.sh）：bootstrap 用 `localhost:9092`，advertised 为 `PLAINTEXT_HOST://localhost:9092`。

**作业参数注意**：在容器内运行的 kafka-source/kafka-sink 控件，`bootstrapServers` 必须填
`kafka:29092`，不要填 `localhost:9092`。

### 6.3 国内镜像加速

- Docker Hub：配置 registry mirrors（如 `https://docker.m.daocloud.io` 等可用加速器）；
- Maven：构建阶段默认走 Maven Central，可在 `~/.m2/settings.xml` 配置阿里云镜像后，
  在 Dockerfile 构建阶段 `COPY settings.xml /root/.m2/settings.xml`（需自行添加到两个后端 Dockerfile）；
- npm：前端 Dockerfile 中 `npm ci` 前加 `RUN npm config set registry https://registry.npmmirror.com`。

### 6.4 Redis 补数控件

容器内 redis-enrich 控件的 `host` 参数填 `redis`（compose 服务名）、`port` 填 `6379`；
如需从宿主机预置补数数据，直接连 `localhost:6379` 写入即可。

## 7. 目录与文件说明

```
deploy/
├── docker-compose.yml   # 一键部署编排（本文档对应配置）
├── schema-mysql.sql     # MySQL 初始化脚本（7 张 sp_ 前缀表）
└── README-deploy.md     # 本文档
sp-control-plane/Dockerfile   # 控制面镜像（多阶段：maven 构建 + jre 运行）
sp-worker/Dockerfile          # Worker 镜像（同上）
frontend/Dockerfile           # 前端镜像（node 构建 + nginx 托管）
frontend/nginx.conf           # /api 反代 + history 路由 fallback
.dockerignore                 # 构建上下文裁剪（target/node_modules/日志/数据文件）
```

## 8. 运行环境说明

> 本节是**本作品全部环境参数（CPU / 内存 / 磁盘 / Docker 版本）的唯一权威来源**。
> 性能测试报告与各测试报告只写"见《部署文档》§8 测试机 X"，不再各自复述数字——
> 以避免同一份交付物内出现互相矛盾的环境描述。全部参数均来自测试机上实测命令的输出。

### 8.1 测试机 A —— 正式基准环境

用于：**性能测试（《性能测试报告》）、端到端集成测试（docs/08）、演示录像**。

| 项 | 配置 | 采集命令 |
|---|---|---|
| 虚拟化 | VMware Workstation 17 虚拟机 | — |
| CPU | 8 vCPU | `lscpu` |
| 内存 | 24 GB | `free -h` |
| 磁盘 | 300 GB 虚拟磁盘；宿主为 NVMe SSD。**该虚拟盘 `lsblk` 报 `ROTA=1`，与真实介质不符**，见下方消歧说明 | `lsblk -d -o NAME,ROTA,SIZE` + 宿主磁盘型号 |
| 操作系统 | Ubuntu Server 24.04.4 LTS | `cat /etc/os-release` |
| Docker | 29.1 | `docker version` |
| Docker Compose | v2.40 | `docker compose version` |
| 运行时 | JDK 21（eclipse-temurin:21-jre 容器） | — |

### 8.2 测试机 B —— 机械盘测试机

用于：**数据质量与异常测试（docs/12）、输入/输出控件测试（docs/10）、处理控件测试（docs/11）**。

| 项 | 配置 | 采集命令 |
|---|---|---|
| 虚拟化 | VMware 虚拟机 | — |
| CPU | 8 vCPU（宿主 Intel i7-14700） | `lscpu` |
| 内存 | 28.4 GB（十进制）= 27 GiB（二进制），`MemTotal 28407588 kB` | `free -h` |
| 磁盘 | 300 GB，**ROTA=1（机械盘）** | `lsblk -d -o NAME,ROTA,SIZE` |
| 操作系统 | Ubuntu 24.04.4 LTS | `cat /etc/os-release` |
| Docker | 29.7.2 | `docker version` |
| Docker Compose | v5.5.0（新版独立 CLI） | `docker compose version` |

> **关于"内存 27GB / 28.4GB"的消歧**：二者是**同一台机器的同一个读数**，只是单位不同——
> `MemTotal 28407588 kB` = **28.4 GB（十进制）** = **27.09 GiB（二进制）**。
> 因此文档中出现的 27GB 与 28.4GB **都指测试机 B**，不是两台机器。

> **关于磁盘类型的消歧（请连同实测输出一起看）**：赛题建议基准为「8vCPU / 32GB / 机械硬盘」。
>
> - **测试机 A**：宿主仅有一块 NVMe SSD、无机械硬盘，故虚拟磁盘为 SSD（性能高于机械盘）。
>   **注意：在该虚拟机上执行 `lsblk -d -o NAME,ROTA,SIZE`，`sda` 的 `ROTA` 字段实际报 `1`**
>   （即"可旋转"），与真实介质不符 —— 这是虚拟化层的常见现象，`ROTA` 由虚拟驱动上报而非
>   物理设备，**不能作为判据**。所以本表的磁盘类型以**宿主磁盘型号**为准，不采信 `ROTA`。
> - **测试机 B**：`ROTA=1` 且宿主为机械盘，两处一致，故判定为机械盘，更接近赛题基准。
>
> 也就是说：`ROTA` 在两台机器上取值不同（A=1、B=1）但**介质实际不同**，因此本作品不把
> `ROTA` 当作磁盘类型的唯一判据，而是结合宿主型号一并给出。

### 8.3 引用规则

| 文档 | 使用的测试机 | 应写 |
|---|---|---|
| 《性能测试报告》§2.1 | 测试机 A | 见《部署文档》§8.1 |
| docs/08 端到端集成测试报告 | 测试机 A | 见《部署文档》§8.1 |
| docs/10 输入/输出控件测试报告 | 测试机 B | 见《部署文档》§8.2 |
| docs/11 处理控件测试报告 | 测试机 B | 见《部署文档》§8.2 |
| docs/12 数据质量与异常测试报告 | 测试机 B | 见《部署文档》§8.2 |
| docs/04 性能测试预演记录 | 开发笔记本（非验收环境） | 仅供方法验证，数字不作引用 |

> **提示**：两台机器的吞吐数字**不可直接比较**（磁盘介质不同）。跨机器引用时务必标注机型。
