# ProjectSnapshot ORM モデル。
# "project_snapshots" テーブルに対応する。
# ユーザーが「バージョンUP」操作を実行したときに手動作成される。
# last_changelog_id により「このスナップショット以降の変更ログ」を
# タイムスタンプではなく ID ベースで確実に絞り込める。
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
    # 何の操作で作成されたかを示すラベル（例: "リリース準備完了"）。
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    # その時点の全タスク一覧を JSON テキストとして保存する。
    # 依存関係（TaskDependency）も含めてシリアライズする。
    tasks_json: Mapped[str] = mapped_column(Text, nullable=False)
    # スナップショット作成時点での project_change_log の最大 ID。
    # GET /changelog でこの値より大きい ID のエントリのみを返す。
    # タイムスタンプ比較（秒精度の SQLite や高速テストで同一値になりうる）を避けるため
    # ID による確定的なフィルタリングを採用する。
    last_changelog_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
