# ProjectChangeLog ORM モデル。
# "project_change_log" テーブルに対応する。
# タスク操作（作成・更新・削除・日程変更・並び替え）のたびに自動記録される
# 軽量な変更ログ。バージョン(ProjectSnapshot)とは独立して管理する。
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProjectChangeLog(Base):
    __tablename__ = "project_change_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 操作種別: "タスク追加" / "タスク更新" / "タスク削除" / "日程変更" / "並び替え"
    operation: Mapped[str] = mapped_column(String(50), nullable=False)
    # 操作対象タスク名（並び替えなど対象が複数の場合は NULL）
    task_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 変更内容の要約（例: "2026-04-01〜2026-04-05"）
    detail: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
