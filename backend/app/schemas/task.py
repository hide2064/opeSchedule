from datetime import date, datetime

from pydantic import BaseModel, field_validator, model_validator


class TaskCreate(BaseModel):
    name: str
    start_date: date
    end_date: date
    task_type: str = "task"  # task|milestone
    progress: float = 0.0
    parent_id: int | None = None
    sort_order: int = 0
    color: str | None = None
    notes: str | None = None
    dependency_ids: list[int] = []

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, v: str) -> str:
        if v not in ("task", "milestone"):
            raise ValueError("task_type must be task or milestone")
        return v

    @field_validator("progress")
    @classmethod
    def validate_progress(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("progress must be between 0.0 and 1.0")
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "TaskCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        if self.task_type == "milestone" and self.start_date != self.end_date:
            raise ValueError("milestone must have start_date == end_date")
        return self


class TaskUpdate(BaseModel):
    name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    task_type: str | None = None
    progress: float | None = None
    parent_id: int | None = None
    sort_order: int | None = None
    color: str | None = None
    notes: str | None = None
    dependency_ids: list[int] | None = None

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, v: str | None) -> str | None:
        if v is not None and v not in ("task", "milestone"):
            raise ValueError("task_type must be task or milestone")
        return v

    @field_validator("progress")
    @classmethod
    def validate_progress(cls, v: float | None) -> float | None:
        if v is not None and not 0.0 <= v <= 1.0:
            raise ValueError("progress must be between 0.0 and 1.0")
        return v


class TaskDateUpdate(BaseModel):
    """Lightweight schema for drag-and-drop date changes."""

    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_dates(self) -> "TaskDateUpdate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class TaskReorderItem(BaseModel):
    """並び替えリクエストの1件分。"""
    id: int
    sort_order: int


class TaskDependencyResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    depends_on_id: int


class TaskResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    project_id: int
    name: str
    start_date: date
    end_date: date
    task_type: str
    progress: float
    parent_id: int | None
    sort_order: int
    color: str | None
    notes: str | None
    dependencies: list[TaskDependencyResponse]
    created_at: datetime
    updated_at: datetime
