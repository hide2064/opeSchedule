# Config の Pydantic スキーマ定義。
# GET レスポンス用の ConfigResponse と PATCH リクエスト用の ConfigUpdate を提供する。
from datetime import datetime

from pydantic import BaseModel, field_validator


# PATCH /config リクエスト Body 用スキーマ。
# 全フィールドが Optional（デフォルト None）のため、
# 送信されなかったフィールドは更新しない部分更新（PATCH）として機能する。
class ConfigUpdate(BaseModel):
    week_start_day: str | None = None
    date_format: str | None = None
    timezone: str | None = None
    default_view_mode: str | None = None
    highlight_weekends: bool | None = None
    # リクエストでは ISO 日付文字列の list[str] で受け取る。
    # ルーター側で json.dumps() して DB の TEXT カラムに保存する。
    holiday_dates: list[str] | None = None
    auto_scroll_today: bool | None = None
    theme: str | None = None

    @field_validator("week_start_day")
    @classmethod
    def validate_week_start_day(cls, v: str | None) -> str | None:
        if v is not None and v not in ("Mon", "Sun", "Sat"):
            raise ValueError("week_start_day must be Mon, Sun, or Sat")
        return v

    @field_validator("default_view_mode")
    @classmethod
    def validate_view_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in ("Day", "Week", "Month", "Quarter"):
            raise ValueError("default_view_mode must be Day, Week, Month, or Quarter")
        return v

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v: str | None) -> str | None:
        if v is not None and v not in ("light", "dark"):
            raise ValueError("theme must be light or dark")
        return v


class ConfigResponse(BaseModel):
    # from_attributes=True により SQLAlchemy ORM モデルのインスタンスから
    # 直接 Pydantic モデルへ変換できるようにする。
    model_config = {"from_attributes": True}

    id: int
    week_start_day: str
    date_format: str
    timezone: str
    default_view_mode: str
    highlight_weekends: bool
    # DB には JSON 文字列として保存されているため、レスポンスも str 型で返す。
    # フロントエンド側で JSON.parse() して利用する。
    holiday_dates: str  # JSON string stored in DB
    auto_scroll_today: bool
    theme: str
    updated_at: datetime
