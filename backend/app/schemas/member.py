from pydantic import BaseModel, field_validator

from app.schemas.base import OrmModel


class MemberCreate(BaseModel):
    name: str
    color: str = "#888888"
    email: str | None = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if not v.startswith("#") or len(v) != 7:
            raise ValueError("color must be a hex color like #4A90D9")
        return v


class MemberUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    email: str | None = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        if v is not None and (not v.startswith("#") or len(v) != 7):
            raise ValueError("color must be a hex color like #4A90D9")
        return v


class MemberResponse(OrmModel):
    id: int
    project_id: int
    name: str
    color: str
    email: str | None
