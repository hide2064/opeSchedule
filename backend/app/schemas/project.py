from datetime import datetime

from pydantic import BaseModel, field_validator


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    color: str = "#4A90D9"
    status: str = "active"
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

    @field_validator("view_mode")
    @classmethod
    def validate_view_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in ("Day", "Week", "Month", "Quarter"):
            raise ValueError("view_mode must be Day, Week, Month, or Quarter")
        return v


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    status: str | None = None
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


class ProjectResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    description: str | None
    color: str
    status: str
    view_mode: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime
