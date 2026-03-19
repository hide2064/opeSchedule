from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Config(Base):
    """Global configuration singleton. Always id=1."""

    __tablename__ = "config"
    __table_args__ = (
        # シングルトンパターンを DB 制約レベルで強制する。
        # id = 1 以外のレコードの INSERT を DB が拒否することで、
        # アプリ全体で設定レコードが必ず 1 件しか存在しないことを保証する。
        CheckConstraint("id = 1", name="ck_config_singleton"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Display
    week_start_day: Mapped[str] = mapped_column(String(3), default="Mon")  # Mon|Sun|Sat
    date_format: Mapped[str] = mapped_column(String(20), default="YYYY-MM-DD")
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Tokyo")

    # Gantt defaults
    default_view_mode: Mapped[str] = mapped_column(String(20), default="Week")  # Day|Week|Month|Quarter
    highlight_weekends: Mapped[bool] = mapped_column(Boolean, default=True)
    # フロントエンドに組み込みの祝日マップとは別に、ユーザーが追加できる
    # カスタム祝日を ISO 日付文字列の JSON 配列（例: ["2025-01-01", "2025-08-11"]）として保存する。
    holiday_dates: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of ISO date strings
    auto_scroll_today: Mapped[bool] = mapped_column(Boolean, default=True)

    # Theme
    theme: Mapped[str] = mapped_column(String(20), default="light")  # light|dark

    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )
