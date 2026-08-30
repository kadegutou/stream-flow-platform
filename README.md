# 通用流处理任务管理平台

面向流式数据加工场景（流量接入、字段补数、格式转换、多路转发等）的通用平台。用户通过 Web 界面以**拖拉拽**方式将「输入控件 → 处理控件 → 输出控件」编排为数据治理作业，一键上线后由后端 Worker 集群持续执行，避免同类需求在各系统中重复建设。

## 功能特性

- **可视化编排**：React Flow 拖拽画布，控件参数表单按 JSON Schema 动态渲染，DAG 合法性校验
- **作业生命周期**：上线 / 下线 / 版本管理 / 运行实例与吞吐监控
- **插件化控件**：统一 SPI 接口（Source / Processor / Sink），新增数据源只需一个实现类
- **横向扩展**：Worker 无状态集群，作业分片并行（Kafka 按分区、文件按字节切片、库表按主键范围），心跳超时故障自愈
- **高性能**：虚拟线程三段流水线 + 有界队列背压 + 批量处理 + 大块缓冲 I/O，正式环境实测 5000 万行（5.9GB）端到端 90s（55.6 万行/s，6 分片×3 节点）

### 内置控件（20 个）

| 类别 | 控件 |
|---|---|
| 输入 SOURCE | CSV、Excel、MySQL、PostgreSQL、Oracle、Kafka、HDFS |
| 处理 PROCESS | 字段拼接、XML→JSON、JSON→XML、Redis 字段补数、字段映射、数据脱敏 |
| 输出 SINK | CSV、Excel、MySQL、PostgreSQL、Oracle、Kafka、HDFS |

## 技术栈

| 层 | 技术 |
|---|---|
| 控制面 | Java 21、Spring Boot 3、Spring Data JPA、JWT |
| 数据面 | Java 21 虚拟线程、插件化执行引擎 |
| 前端 | React 18、TypeScript、React Flow、Ant Design 5 |
| 存储/协调 | MySQL 8（元数据 + 调度协调）、H2（开发模式） |
| 外部组件 | Kafka、Redis、Apache POI、Hadoop HDFS Client |

## 系统架构

```
前端(React SPA)  ──REST──▶  控制面(8080)  ──心跳/拉任务──▶  Worker 集群(8081+)
                              │  MySQL：元数据 + 调度协调         │  插件化流水线执行引擎
                              └  用户/控件/作业/调度             └  Source → Process → Sink
```

详细设计见 [docs/01-概要设计.md](docs/01-概要设计.md)、[docs/02-数据库设计.md](docs/02-数据库设计.md)。

## 快速开始

### 环境要求

- JDK 21+、Maven 3.8+、Node.js 18+

### 构建

```bash
cd stream-platform
mvn -DskipTests package
```

### 启动（开发模式，内置 H2 内存库，无需安装数据库）

```bash
# 终端 1：控制面（端口 8080）
java -jar sp-control-plane/target/sp-control-plane-1.0.0.jar

# 终端 2：Worker（端口 8081，可起多个实例验证横向扩展）
java -jar sp-worker/target/sp-worker-1.0.0.jar

# 终端 3：前端开发服务器（端口 5173）
cd frontend && npm install && npm run dev
```

浏览器访问 http://localhost:5173 ，默认账号 **admin / admin123**。

### 生产模式（MySQL）

```bash
# 建库（见 deploy/schema-mysql.sql），然后以 prod profile 启动控制面
java -jar sp-control-plane/target/sp-control-plane-1.0.0.jar --spring.profiles.active=prod
```

## 使用流程

1. 「作业管理」新建作业 → 点「编辑画布」
2. 从左侧控件面板拖入控件并连线（SOURCE → PROCESS → SINK）
3. 点击节点，在右侧抽屉中按表单填参数，保存
4. 回作业列表点「上线」，到「运行监控」查看实时状态与吞吐
5. 「下线」优雅停止（在途批次处理完退出）

## 测试

```bash
# 单元测试
mvn test

# 端到端冒烟（10 万行 csv → 字段拼接 → csv）
bash scripts/smoke.sh

# 性能基准（用法：bench.sh <输入csv> <行数> <标签>）
bash data/gen_csv.sh C:/tmp/sp-test/big-10m.csv 10000000
bash scripts/bench.sh C:/tmp/sp-test/big-10m.csv 10000000 10m

# 文件分片验证（并行度 4，行号级校验无重复无丢失）
bash scripts/shard-test.sh
```

开发机性能预演数据见 [docs/04-性能测试预演.md](docs/04-性能测试预演.md)。

## 项目结构

```
├── docs/                      # 设计文档（概要设计 / 数据库设计 / 性能测试预演）
└── stream-platform/
    ├── pom.xml                # Maven 父工程
    ├── sp-common/             # SPI 接口、DAG 模型与校验
    ├── sp-components/         # 20 个内置控件 + 注册中心
    ├── sp-control-plane/      # 控制面：用户/控件/作业/调度（8080）
    ├── sp-worker/             # Worker：注册心跳 + 流水线执行引擎（8081）
    ├── frontend/              # React 前端
    ├── deploy/                # MySQL 建库脚本
    ├── data/                  # 测试数据生成
    └── scripts/               # 冒烟 / 基准 / 分片验证脚本
```

## 交付物（deliverables/）

| 文件 | 说明 |
|---|---|
| 概要设计说明书.docx | 架构与模块设计（源：docs/01） |
| 数据库设计说明书.docx | 表结构与调度状态机（源：docs/02） |
| 部署文档.docx | Docker Compose 一键部署（源：deploy/README-deploy.md） |
| 性能测试报告.docx | 正式基准环境实测：三档数据量 + 分片横向扩展（源：docs/05） |
| 测试报告.docx | 功能测试合册：E2E 5 场景 + 14 IO 控件 + 6 处理控件 62 断言 + 10 数据质量用例（源：docs/08/10/11/12 + docs/13 头部） |
| 项目源码包.zip | 全部源码（`git archive HEAD:stream-platform`） |

## 横向扩展

- **Kafka 场景**：每个分片是同一消费组里的一个消费者，靠 Kafka rebalance 自动分配分区（非显式分片↔分区绑定），扩 Worker 即扩消费者，吞吐随分区数近线性增长
- **文件场景**：大文件按字节区间切片（行边界对齐），多 Worker 并行读，输出为分文件
- **故障自愈**：Worker 心跳超时 30s → 其分片自动重新派发

---

*本项目为【A22】通用流处理任务管理平台（邦盛科技）赛题参赛作品。*
