# ProjectSnapshot ORM モデル。
# "project_snapshots" テーブルに対応する。
# タスク操作（作成・更新・削除・日程変更・並び替え）のたびに自動生成される
# スナップショットを保存し、スケジュール履歴のバージョン管理を実現する。
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProjectSnapshot(Base):
    __tablename__ = "project_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # プロジェクトが削除された場合はスナップショットも CASCADE 削除する。
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # バージョン番号: プロジェクトごとに 1 からインクリメントする。
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # 何の操作で作成されたかを示すラベル（例: "タスク追加: 設計レビュー"）。
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    # その時点の全タスク一覧を JSON テキストとして保存する。
    # 依存関係（TaskDependency）も含めてシリアライズする。
    tasks_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
