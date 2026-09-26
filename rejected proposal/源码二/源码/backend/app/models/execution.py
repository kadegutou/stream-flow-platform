"""执行记录模型"""

from datetime import datetime
from sqlalchemy import String, DateTime, Text, Integer, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class Execution(Base):
    __tablename__ = "execution"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("job.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running / success / failed
    rows_processed: Mapped[int] = mapped_column(Integer, default=0)

    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())
    finished_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    log: Mapped[str] = mapped_column(Text, nullable=True)
    error_msg: Mapped[str] = mapped_column(Text, nullable=True)
