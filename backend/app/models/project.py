from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(7), default="#4A90D9")
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|archived
    view_mode: Mapped[str | None] = mapped_column(String(20))  # NULL = inherit global config
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    tasks: Mapped[list["Task"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Task", back_populates="project", cascade="all, delete-orphan"
    )
