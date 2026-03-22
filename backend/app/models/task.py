# Task / TaskDependency ORM モデル。
# "tasks" テーブルおよび "task_dependencies" テーブルに対応する。
# Task はガントチャートの各バーを表し、TaskDependency はタスク間の
# 先行・後続関係（依存関係）を表す。
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Task(Base):
    __tablename__ = "tasks"
    # DB レベルの整合性制約。スキーマレベル（Pydantic バリデーター）と二重で保護することで、
    # API 経由以外（直接 SQL 等）からの不正データも防ぐ。
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_task_dates"),
        CheckConstraint("progress >= 0.0 AND progress <= 1.0", name="ck_task_progress"),
        # マイルストーンは 1 日イベントのため start_date == end_date を強制する。
        # Frappe Gantt 側でもマイルストーンはダイヤモンド◆として単日表示される。
        CheckConstraint(
            "task_type != 'milestone' OR start_date = end_date",
            name="ck_milestone_single_day",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Gantt チャートの左ペイン（階層ペイン）で 大項目 として表示されるカテゴリ。
    # NULL の場合は「未分類」として扱う。
    category_large:  Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Gantt チャートの左ペイン（階層ペイン）で 中項目 として表示されるカテゴリ。
    # NULL の場合は「未分類」として扱う。
    category_medium: Mapped[str | None] = mapped_column(String(200), nullable=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    task_type: Mapped[str] = mapped_column(String(20), default="task")  # task|milestone
    progress: Mapped[float] = mapped_column(Float, default=0.0)

    # Hierarchy
    # 階層タスク構造を実現する自己参照外部キー。
    # 現時点では Gantt 表示での直接利用はしていないが、
    # 将来的な WBS（作業分解構造）表示拡張のために保持している。
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="SET NULL")
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Visual
    color: Mapped[str | None] = mapped_column(String(7))
    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    project: Mapped["Project"] = relationship("Project", back_populates="tasks")  # type: ignore[name-defined]  # noqa: F821

    # 階層タスクの子・親リレーションシップ（自己参照）。
    # children: このタスクを親とする子タスクの一覧。
    # parent: このタスクの親タスク（remote_side で親側の id を参照）。
    children: Mapped[list["Task"]] = relationship("Task", back_populates="parent")
    parent: Mapped["Task | None"] = relationship("Task", back_populates="children", remote_side="Task.id")

    # Dependencies (this task depends on other tasks)
    # このタスクが依存する先行タスクの一覧（TaskDependency 経由）。
    # cascade="all, delete-orphan" により、このタスクが削除された場合に
    # 関連する依存関係レコードも自動的に削除される。
    dependencies: Mapped[list["TaskDependency"]] = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.task_id",
        cascade="all, delete-orphan",
    )

    # Comments
    comments: Mapped[list["TaskComment"]] = relationship(
        "TaskComment", cascade="all, delete-orphan", order_by="TaskComment.created_at"
    )


class TaskComment(Base):
    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    task: Mapped["Task"] = relationship("Task", back_populates="comments")


class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    # 同じ (task_id, depends_on_id) の組み合わせが重複して登録されることを防ぐ。
    # これにより Gantt チャートで同一依存関係の矢印が重複表示されることも防ぐ。
    __table_args__ = (UniqueConstraint("task_id", "depends_on_id", name="uq_task_dependency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    depends_on_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
