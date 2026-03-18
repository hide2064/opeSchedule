from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Config(Base):
    """Global configuration singleton. Always id=1."""

    __tablename__ = "config"
    __table_args__ = (CheckConstraint("id = 1", name="ck_config_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Display
    week_start_day: Mapped[str] = mapped_column(String(3), default="Mon")  # Mon|Sun|Sat
    date_format: Mapped[str] = mapped_column(String(20), default="YYYY-MM-DD")
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Tokyo")

    # Gantt defaults
    default_view_mode: Mapped[str] = mapped_column(String(20), default="Week")  # Day|Week|Month|Quarter
    highlight_weekends: Mapped[bool] = mapped_column(Boolean, default=True)
    holiday_dates: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of ISO date strings
    auto_scroll_today: Mapped[bool] = mapped_column(Boolean, default=True)

    # Theme
    theme: Mapped[str] = mapped_column(String(20), default="light")  # light|dark

    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )
