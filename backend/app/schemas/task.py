# Task 関連の Pydantic スキーマ定義。
# 作成・更新・日付更新・並び替え・レスポンス用の各スキーマを提供する。
from datetime import date, datetime

from pydantic import BaseModel, field_validator, model_validator

from app.schemas.base import OrmModel


# POST /projects/{id}/tasks リクエスト Body 用スキーマ。
# dependency_ids は別途 set_dependencies() で処理するため、
# Task ORM モデルには直接渡さず exclude して扱う。
class TaskCreate(BaseModel):
    category_large:  str | None = None
    category_medium: str | None = None
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

    # モデル全体のバリデーター（全フィールド確定後に実行される）。
    # end_date >= start_date の制約と、
    # マイルストーンは start_date == end_date でなければならない制約を両方チェックする。
    @model_validator(mode="after")
    def validate_dates(self) -> "TaskCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        if self.task_type == "milestone" and self.start_date != self.end_date:
            raise ValueError("milestone must have start_date == end_date")
        return self


# PATCH /projects/{id}/tasks/{task_id} リクエスト Body 用スキーマ。
# 全フィールドが Optional のため、None のフィールドは更新しない部分更新として機能する。
# dependency_ids が None の場合は依存関係を変更しない。
# [] を渡した場合は既存の依存関係を全削除する。
class TaskUpdate(BaseModel):
    category_large:  str | None = None
    category_medium: str | None = None
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


# ドラッグ&ドロップ専用の軽量スキーマ。
# Gantt バーのドラッグ操作では start_date / end_date のみ変化するため、
# 全フィールドを送信する TaskUpdate より帯域を節約できる。
class TaskDateUpdate(BaseModel):
    """Lightweight schema for drag-and-drop date changes."""

    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_dates(self) -> "TaskDateUpdate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


# 並び替えリクエストの 1 件分を表すスキーマ。
# id と新しい sort_order のペアを持ち、list[TaskReorderItem] で一括並び替えを行う。
class TaskReorderItem(BaseModel):
    """並び替えリクエストの1件分。"""
    id: int
    sort_order: int


# TaskDependency ORM モデルから直接変換するレスポンス用スキーマ。
class TaskDependencyResponse(OrmModel):
    id: int
    depends_on_id: int


# Task ORM モデルから直接変換するレスポンス用スキーマ。
# dependencies フィールドには TaskDependencyResponse のリストが含まれる。
class TaskResponse(OrmModel):
    id: int
    project_id: int
    category_large:  str | None
    category_medium: str | None
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
