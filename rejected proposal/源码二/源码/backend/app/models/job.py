"""作业模型"""

from datetime import datetime
from sqlalchemy import String, DateTime, Text, Integer, func, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class Job(Base):
    __tablename__ = "job"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft / online / offline / error
    dag_config: Mapped[str] = mapped_column(Text, nullable=True)  # JSON
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )
