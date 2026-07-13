# 🏭 通用流处理任务管理平台

> 外包竞赛作品 · 邦盛科技 A22 赛题<br>
> Competition Entry · Bangsheng Technology Challenge A22

<br>

面向流式数据加工场景的可视化任务管理平台。支持**拖拉拽编排 DAG 作业**，内置 12 种控件覆盖 CSV / Excel / MySQL / Kafka 的输入输出，以及 XML↔JSON 转换、字段拼接、Redis 扩充等数据治理能力。

A visual stream processing task management platform. Build **ETL pipelines by drag-and-drop**, with 12 built-in components covering CSV / Excel / MySQL / Kafka I/O and data transformations including XML↔JSON conversion, field concatenation, and Redis enrichment.

---

## ✨ 特性 · Features

| | |
|---|---|
| 🎨 **可视化拖拉拽** · Visual DAG Editor | React Flow 实现，拖拽控件 + 连线编排作业 |
| ⚡ **高性能执行** · High Performance | Python async engine + C++ pybind11 acceleration |
| 📦 **12 个内置控件** · 12 Built-in Components | 4 Input + 4 Process + 4 Output |
| 🔍 **DAG 校验** · DAG Validation | Kahn algorithm: cycle detection / orphan nodes / missing output |
| 🔄 **作业生命周期** · Job Lifecycle | Online → continuous execution | Offline → stop |
| 🧩 **插件化架构** · Plugin Architecture | `@register_component` decorator, zero-intrusion extension |
| 💾 **双数据库** · Dual Database | Dev: SQLite (zero config) | Prod: MySQL 8.x |

## 🏗 架构 · Architecture

```
┌─────────────────────────────────────┐
│  React 18 + React Flow + Ant Design  │  Frontend · :3000
├─────────────────────────────────────┤
│         FastAPI (async)              │  Backend · :8080
│  ┌──── API ────┬──── Engine ──────┐  │
│  │ User/Comp   │ DAG TopoSort      │  │
│  │ Job CRUD    │ Component Registry│  │
│  │ Online/Off  │ Failure Prpgtn    │  │
│  └─────────────┴──────────────────┘  │
├─────────────────────────────────────┤
│     SQLite (dev) / MySQL 8 (prod)    │
└─────────────────────────────────────┘
```

## 🚀 快速开始 · Quick Start

### 环境要求 · Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| MySQL | 8.x (production only; dev uses SQLite) |

### 1. 后端 · Backend

```bash
cd backend
pip install -r requirements.txt

# 开发模式 · Dev mode (SQLite, hot reload)
python run.py
# → http://localhost:8080
# → Swagger docs: http://localhost:8080/docs
```

> 生产环境切换 MySQL / Switch to MySQL: set env `BS_DB_TYPE=mysql BS_DB_PASSWORD=your_pwd`

### 2. 前端 · Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### 3. 打开 · Open

```
http://localhost:3000/jobs/editor/new   ← 拖拉拽编辑器 · Drag & Drop Editor
http://localhost:3000/dashboard         ← 仪表盘 · Dashboard
http://localhost:8080/docs              ← API 文档 · API Docs
```

## 📂 项目结构 · Project Structure

```
stream-flow-platform/
├── frontend/                         # React frontend
│   └── src/
│       ├── components/CustomNode.tsx  # Custom ReactFlow node
│       ├── layouts/MainLayout.tsx     # Sidebar layout
│       ├── pages/
│       │   ├── Dashboard/            # 仪表盘 · Dashboard
│       │   ├── Users/                # 用户管理 · User Management
│       │   ├── Components/           # 控件管理 · Component Mgmt
│       │   └── Jobs/
│       │       ├── JobList.tsx        # 作业列表 · Job List
│       │       ├── Editor/            # ★ 拖拉拽编辑器 · Drag & Drop Editor
│       │       │   ├── ComponentPanel # 左侧控件库 · Left Palette
│       │       │   ├── FlowCanvas     # 中间画布 · Center Canvas
│       │       │   └── ConfigPanel    # 右侧配置 · Right Config
│       │       └── Detail/            # 作业详情 · Job Detail
│       ├── stores/                   # Zustand state
│       ├── api/                      # Axios API client
│       └── types/                    # TypeScript types
│
├── backend/                          # Python backend
│   ├── run.py                        # Entry point
│   └── app/
│       ├── main.py                   # FastAPI app
│       ├── config.py                 # Config (SQLite/MySQL switch)
│       ├── database.py               # SQLAlchemy async engine
│       ├── api/                      # REST API routers
│       ├── models/                   # ORM models
│       ├── engine/                   # DAG execution engine
│       │   ├── component_base.py     # Base class + @register_component
│       │   ├── dag_executor.py       # TopologicalSorter execution
│       │   └── job_runner.py         # Job online/offline lifecycle
│       ├── components/               # 12 built-in components
│       │   ├── input/                # CSV / Excel / MySQL / Kafka
│       │   ├── process/              # Concat / XML↔JSON / Redis
│       │   └── output/               # CSV / Excel / MySQL / Kafka
│       └── cpp/                      # C++ pybind11 acceleration
│           └── src/                  # concat / csv_utils
│
├── README.md
└── 技术方案.md                       # Full technical proposal (Chinese)
```

## 📡 API 概览 · API Overview

| 模块 · Module | 端点 · Endpoint | 说明 · Description |
|---------------|-----------------|-------------------|
| 用户 · User | `CRUD /api/users` | 增删查改 |
| 控件 · Component | `CRUD /api/components` | 自定义控件 · Custom components |
| 控件 · Component | `GET /api/components/built-in` | 内置控件列表 · Built-in list |
| 作业 · Job | `CRUD /api/jobs` | 增删查改 |
| 作业 · Job | `POST /api/jobs/{id}/online` | 上线 · Start engine |
| 作业 · Job | `POST /api/jobs/{id}/offline` | 下线 · Stop engine |
| 作业 · Job | `POST /api/jobs/validate` | DAG 校验 · DAG validation |
| 仪表盘 · Dashboard | `GET /api/dashboard/stats` | 统计数据 · Statistics |

## 🧪 内置控件 · Built-in Components

| 类型 · Type | 名称 · Name | 说明 · Description |
|------------|------------|-------------------|
| 📥 Input | CSV 输入 · CSV Input | Read CSV (Polars) |
| 📥 Input | Excel 输入 · Excel Input | Read Excel (openpyxl) |
| 📥 Input | MySQL 输入 · MySQL Input | SQL query (SQLAlchemy) |
| 📥 Input | Kafka 输入 · Kafka Input | Consume messages (confluent-kafka) |
| ⚙️ Process | XML → JSON | XML to JSON conversion |
| ⚙️ Process | JSON → XML | JSON to XML conversion |
| ⚙️ Process | 字段拼接 · Field Concat | A + B → new field C |
| ⚙️ Process | Redis 扩充 · Redis Enrich | Lookup Redis to expand fields |
| 📤 Output | CSV 输出 · CSV Output | Write CSV file |
| 📤 Output | Excel 输出 · Excel Output | Write Excel file |
| 📤 Output | MySQL 输出 · MySQL Output | Insert into table |
| 📤 Output | Kafka 输出 · Kafka Output | Produce messages |

## 🔧 新增控件 · Adding a Component

继承基类 + 加装饰器即可，引擎自动发现。

Extend the base class + add the decorator, the engine discovers it automatically.

```python
from app.engine.component_base import BaseComponent, register_component

@register_component
class MyNewComponent(BaseComponent):
    component_type = "process"
    component_name = "my-cool-transform"
    display_name = "我的新控件 · My Cool Transform"

    async def execute(self, config: dict, inputs=None) -> dict:
        # 你的处理逻辑 · Your transform logic
        return {"data": ..., "rows": 42}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "my_param": {"type": "string", "title": "参数 · Parameter"}
            }
        }
```

然后在 `app/main.py` 加一行 `import`，重启即可。
Then add one `import` line in `app/main.py` and restart.

## 📊 参考资料 · References

本项目架构参考了以下优秀开源项目 · Architecture inspired by:

| 项目 · Project | 参考内容 · What we learned |
|---------------|---------------------------|
| [VibeETL](https://github.com/cardchase/VibeETL) | DAG engine + custom ReactFlow nodes |
| [ReactFlow Pipeline UI](https://github.com/aksh10207/ReactFlow_Node-based-Pipeline-UI) | Kahn DAG validation algorithm |
| [fastapi-best-practices](https://github.com/CN-P5/fastapi-best-practices-zh-cn) | Project structure best practices |
| [Apache Hamilton](https://github.com/apache/hamilton) | Decorator-based component registry |
| [Elyra Canvas](https://github.com/elyra-ai/canvas) (IBM) | React flow editor UX patterns |
| [DolphinScheduler](https://github.com/apache/dolphinscheduler) | Task plugin abstraction |

## 📄 许可 · License

MIT
