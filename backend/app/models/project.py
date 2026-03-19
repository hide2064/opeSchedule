# Project ORM モデル。
# "projects" テーブルに対応し、プロジェクトの基本情報と
# Task との 1 対多リレーションシップを定義する。
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(7), default="#4A90D9")

    # アーカイブ機能で使用するフラグ（active / archived）。
    # フロントエンドが project_status "中断" または "終了" を保存する際に
    # 自動で "archived" を設定し、一覧画面での非表示制御に用いる。
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|archived

    # 業務上の進捗ステータス（未開始 / 作業中 / 中断 / 終了）。
    # status（アーカイブフラグ）とは別概念であり、
    # ガントチャート画面でのプロジェクトの進行状況を表す。
    project_status: Mapped[str] = mapped_column(String(20), default="未開始")  # 未開始|作業中|中断|終了

    client_name: Mapped[str | None] = mapped_column(String(255))
    base_project: Mapped[str | None] = mapped_column(String(255))

    # プロジェクト固有の Gantt 表示モード（Day / Week / Month / Quarter）。
    # NULL の場合は Global Config（config テーブル）の default_view_mode を継承する。
    view_mode: Mapped[str | None] = mapped_column(String(20))  # NULL = inherit global config

    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    # プロジェクトに紐づくタスクの一覧。
    # cascade="all, delete-orphan" により、プロジェクトを削除すると
    # 関連するすべてのタスクも自動的に削除される。
    tasks: Mapped[list["Task"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Task", back_populates="project", cascade="all, delete-orphan"
    )
