# Project の Pydantic スキーマ定義。
# POST リクエスト用の ProjectCreate、PATCH リクエスト用の ProjectUpdate、
# およびレスポンス用の ProjectResponse を提供する。
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.base import OrmModel

# 業務ステータスの許容値一覧。
# ProjectCreate・ProjectUpdate のバリデーターで共通して参照することで
# 許容値の定義を一元管理する。
_PROJECT_STATUSES = ("未開始", "作業中", "中断", "終了")


# POST /projects リクエスト Body 用スキーマ。
# status フィールドは通常フロントエンドが project_status の値から自動導出して送信する
#（"未開始"/"作業中" → "active"、"中断"/"終了" → "archived"）。
class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    color: str = "#4A90D9"

    # アーカイブフラグ（active / archived）。
    # フロントエンドが project_status に応じて自動設定する値であり、
    # 通常は直接指定しない。
    status: str = "active"

    project_status: str = "未開始"
    client_name: str | None = None
    base_project: str | None = None
    view_mode: str | None = None
    sort_order: int = 0

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if not v.startswith("#") or len(v) != 7:
            raise ValueError("color must be a hex color string like #4A90D9")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("active", "archived"):
            raise ValueError("status must be active or archived")
        return v

    @field_validator("project_status")
    @classmethod
    def validate_project_status(cls, v: str) -> str:
        if v not in _PROJECT_STATUSES:
            raise ValueError(f"project_status must be one of {_PROJECT_STATUSES}")
        return v

    @field_validator("view_mode")
    @classmethod
    def validate_view_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in ("Day", "Week", "Month", "Quarter"):
            raise ValueError("view_mode must be Day, Week, Month, or Quarter")
        return v


# PATCH /projects/{id} リクエスト Body 用スキーマ。
# 全フィールドが Optional（デフォルト None）のため、
# None のフィールドは exclude_none=True でスキップされ、
# 指定されたフィールドのみ更新される部分更新（PATCH）として機能する。
class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    status: str | None = None
    project_status: str | None = None
    client_name: str | None = None
    base_project: str | None = None
    view_mode: str | None = None
    sort_order: int | None = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        if v is not None and (not v.startswith("#") or len(v) != 7):
            raise ValueError("color must be a hex color string like #4A90D9")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in ("active", "archived"):
            raise ValueError("status must be active or archived")
        return v

    @field_validator("project_status")
    @classmethod
    def validate_project_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _PROJECT_STATUSES:
            raise ValueError(f"project_status must be one of {_PROJECT_STATUSES}")
        return v


# GET /projects および GET /projects/{id} のレスポンス用スキーマ。
class ProjectResponse(OrmModel):
    id: int
    name: str
    description: str | None
    color: str
    status: str
    project_status: str
    client_name: str | None
    base_project: str | None
    view_mode: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime
