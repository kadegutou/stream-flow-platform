# 🏭 通用流处理任务管理平台

> 外包竞赛作品 —— 邦盛科技 A22 赛题

面向流式数据加工场景的可视化任务管理平台。支持**拖拉拽编排 DAG 作业**，内置 12 种控件覆盖 CSV / Excel / MySQL / Kafka 的输入输出，以及 XML↔JSON 转换、字段拼接、Redis 扩充等数据治理能力。

## ✨ 特性

- 🎨 **可视化拖拉拽** — React Flow 实现 DAG 编辑器，拖拽控件 + 连线编排作业
- ⚡ **高性能执行** — Python 异步引擎 + C++ pybind11 关键路径加速
- 📦 **12 个内置控件** — 4 输入 + 4 处理 + 4 输出，覆盖常见数据处理场景
- 🔍 **DAG 校验** — Kahn 算法实时检测环路 / 孤立节点 / 缺输出控件
- 🔄 **作业生命周期** — 上线 → 后台持续执行 | 下线 → 停止
- 🧩 **插件化架构** — `@register_component` 装饰器注册新控件，零侵入扩展
- 💾 **双数据库** — 开发 SQLite 零配置 | 生产 MySQL 8.x

## 🏗 架构

```
┌─────────────────────────────────────┐
│  React 18 + React Flow + Ant Design  │  前端 · :3000
├─────────────────────────────────────┤
│  FastAPI + SQLAlchemy (async)        │  后端 · :8080
│  ┌──── API ────┬──── Engine ──────┐  │
│  │ 用户/控件   │ DAG 拓扑排序      │  │
│  │ /作业 CRUD  │ 控件注册表        │  │
│  │ /上线/下线  │ 依赖失败传播      │  │
│  └─────────────┴──────────────────┘  │
├─────────────────────────────────────┤
│  SQLite (开发) / MySQL 8 (生产)       │
└─────────────────────────────────────┘
```

## 🚀 快速开始

### 环境要求

| 工具 | 版本 |
|------|------|
| Python | 3.10+ |
| Node.js | 18+ |
| MySQL | 8.x（生产；开发用 SQLite 无需安装） |

### 1. 后端

```bash
cd backend
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 启动 (开发模式, SQLite, 热重载)
python run.py
# → http://localhost:8080
# → Swagger 文档: http://localhost:8080/docs
```

> 生产环境切换 MySQL：设置环境变量 `BS_DB_TYPE=mysql BS_DB_PASSWORD=你的密码` 后启动。

### 2. 前端

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### 3. 打开浏览器

```
http://localhost:3000/jobs/editor/new   ← 拖拉拽作业编辑器
http://localhost:3000/dashboard         ← 仪表盘
http://localhost:8080/docs              ← API 文档
```

## 📂 项目结构

```
stream-flow-platform/
├── frontend/                         # React 前端
│   └── src/
│       ├── components/CustomNode.tsx  # 自定义 ReactFlow 节点
│       ├── layouts/MainLayout.tsx     # 主布局 (侧边栏)
│       ├── pages/
│       │   ├── Dashboard/            # 仪表盘
│       │   ├── Users/                # 用户管理
│       │   ├── Components/           # 控件管理
│       │   └── Jobs/
│       │       ├── JobList.tsx        # 作业列表
│       │       ├── Editor/            # ★ 拖拉拽编辑器
│       │       │   ├── ComponentPanel # 左侧控件库
│       │       │   ├── FlowCanvas     # 中间画布
│       │       │   └── ConfigPanel    # 右侧配置
│       │       └── Detail/            # 作业详情
│       ├── stores/                   # Zustand 状态
│       ├── api/                      # Axios API 客户端
│       └── types/                    # TypeScript 类型
│
├── backend/                          # Python 后端
│   ├── run.py                        # 启动入口
│   └── app/
│       ├── main.py                   # FastAPI 应用
│       ├── config.py                 # 配置 (SQLite/MySQL 切换)
│       ├── database.py               # SQLAlchemy 异步引擎
│       ├── api/                      # REST API (FastAPI Router)
│       ├── models/                   # ORM 模型
│       ├── engine/                   # DAG 执行引擎
│       │   ├── component_base.py     # 控件基类 + @register_component
│       │   ├── dag_executor.py       # TopologicalSorter 拓扑执行
│       │   └── job_runner.py         # 作业上线/下线管理
│       ├── components/               # 12 个内置控件
│       │   ├── input/                # CSV / Excel / MySQL / Kafka
│       │   ├── process/              # 拼接 / XML↔JSON / Redis
│       │   └── output/               # CSV / Excel / MySQL / Kafka
│       └── cpp/                      # C++ pybind11 加速
│           └── src/                  # concat / csv_utils
│
├── 技术方案.md                       # 完整技术方案
└── README.md
```

## 📡 API 概览

| 模块 | 端点 | 说明 |
|------|------|------|
| 用户 | `CRUD /api/users` | 增删查改 |
| 控件 | `CRUD /api/components` | 自定义控件定义 |
| 控件 | `GET /api/components/built-in` | 内置控件列表 |
| 作业 | `CRUD /api/jobs` | 增删查改 |
| 作业 | `POST /api/jobs/{id}/online` | 上线（启动引擎） |
| 作业 | `POST /api/jobs/{id}/offline` | 下线（停止引擎） |
| 作业 | `POST /api/jobs/validate` | DAG 环路检测 |
| 仪表盘 | `GET /api/dashboard/stats` | 统计数据 |

## 🧪 内置控件清单

| 类型 | 名称 | 说明 |
|------|------|------|
| 📥 输入 | CSV 输入 | 读取 CSV 文件 (Polars) |
| 📥 输入 | Excel 输入 | 读取 Excel 文件 (openpyxl) |
| 📥 输入 | MySQL 输入 | SQL 查询 (SQLAlchemy) |
| 📥 输入 | Kafka 输入 | 消费消息 (confluent-kafka) |
| ⚙️ 处理 | XML → JSON | XML 报文转 JSON |
| ⚙️ 处理 | JSON → XML | JSON 数据转 XML |
| ⚙️ 处理 | 字段拼接 | A + B → 新字段 C |
| ⚙️ 处理 | Redis 扩充 | 根据字段查 Redis 补全数据 |
| 📤 输出 | CSV 输出 | 写入 CSV 文件 |
| 📤 输出 | Excel 输出 | 写入 Excel 文件 |
| 📤 输出 | MySQL 输出 | 写入数据库表 |
| 📤 输出 | Kafka 输出 | 发送消息 |

## 🔧 新增控件

继承基类 + 加装饰器即可，引擎自动发现：

```python
from app.engine.component_base import BaseComponent, register_component

@register_component
class MyNewComponent(BaseComponent):
    component_type = "process"
    component_name = "my-cool-transform"
    display_name = "我的新控件"

    async def execute(self, config: dict, inputs=None) -> dict:
        # 你的处理逻辑
        return {"data": ..., "rows": 42}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "my_param": {"type": "string", "title": "参数"}
            }
        }
```

然后在 `app/main.py` 加一行 `import`，重启即可。

## 📊 参考资料

本项目架构参考了以下优秀开源项目：

| 项目 | 参考内容 |
|------|---------|
| [VibeETL](https://github.com/cardchase/VibeETL) | DAG 引擎 + 自定义节点 |
| [ReactFlow Pipeline UI](https://github.com/aksh10207/ReactFlow_Node-based-Pipeline-UI) | Kahn DAG 校验 |
| [fastapi-best-practices](https://github.com/CN-P5/fastapi-best-practices-zh-cn) | 项目结构 |
| [Apache Hamilton](https://github.com/apache/hamilton) | 装饰器注册模式 |

## 📄 许可

MIT License
