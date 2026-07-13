"""应用配置 — 开发 SQLite / 生产 MySQL"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "邦盛流处理平台"
    app_version: str = "1.0.0"

    # 数据库: "sqlite" → 零依赖开发, "mysql" → 生产
    db_type: str = "sqlite"
    db_host: str = "localhost"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = "root"
    db_name: str = "bangsheng"

    # Redis (开发时可设为空字符串跳过)
    redis_url: str = ""

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    @property
    def db_url(self) -> str:
        if self.db_type == "sqlite":
            return "sqlite+aiosqlite:///./bangsheng.db"
        return (
            f"mysql+aiomysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    model_config = {"env_prefix": "BS_"}


settings = Settings()
