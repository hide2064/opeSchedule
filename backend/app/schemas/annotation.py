from datetime import datetime

from pydantic import BaseModel

from app.schemas.base import OrmModel


class AnnotationCreate(BaseModel):
    text: str
    anno_date: str   # YYYY-MM-DD
    y_offset: int


class AnnotationResponse(OrmModel):
    id: int
    project_id: int
    text: str
    anno_date: str
    y_offset: int
    created_at: datetime
