"""
邦盛通用流处理任务管理平台 — FastAPI 入口
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .api import users, components, jobs, dashboard
from .engine.job_runner import job_runner

# 控件注册 — 启动时 import 触发 @register_component 装饰器执行
from .components.input   import csv_input, excel_input, mysql_input, kafka_input
from .components.process import concat, xml_json, redis_enrich
from .components.output  import csv_output, excel_output, mysql_output, kafka_output


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时初始化数据库，失败不影响服务启动"""
    try:
        await init_db()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"数据库初始化失败(不影响API): {e}")
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(users.router)
app.include_router(components.router)
app.include_router(jobs.router)
app.include_router(dashboard.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": settings.app_version}
