from datetime import datetime

from pydantic import BaseModel

from app.schemas.base import OrmModel


class AnnotationCreate(BaseModel):
    text: str
    anno_date: str         # YYYY-MM-DD
    y_offset: int
    text_color: str | None = None   # HEX "#rrggbb"
    font_size: int | None = None    # px（None = デフォルト 13px）


class AnnotationResponse(OrmModel):
    id: int
    project_id: int
    text: str
    anno_date: str
    y_offset: int
    text_color: str | None
    font_size: int | None
    created_at: datetime
