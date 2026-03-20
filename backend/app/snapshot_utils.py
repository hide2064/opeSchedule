# スナップショット作成ユーティリティ。
# タスク操作（作成・更新・削除・日程変更・並び替え）のたびに呼び出し、
# その時点のプロジェクト全タスクを JSON としてスナップショット保存する。
import json

from sqlalchemy.orm import Session

from app.models.changelog import ProjectChangeLog
from app.models.snapshot import ProjectSnapshot
from app.models.task import Task

# プロジェクトあたりの最大保持バージョン数。
# 上限を超えた分は古いものから削除して一定のディスク使用量に抑える。
_MAX_SNAPSHOTS = 50


def create_snapshot(db: Session, project_id: int, label: str) -> None:
    """現在のプロジェクトタスク一覧をスナップショットとして DB に保存する。

    ユーザーが「バージョンUP」操作を実行したときにのみ呼び出す（自動生成なし）。
    呼び出し元が db.commit() を別途行う必要がある（本関数は flush のみ）。
    """
    tasks = (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .order_by(Task.sort_order, Task.id)
        .all()
    )

    # タスクと依存関係を辞書形式にシリアライズする。
    # ORM モデルは直接 json.dumps できないため手動で変換する。
    tasks_data = []
    for t in tasks:
        tasks_data.append({
            "id": t.id,
            "project_id": t.project_id,
            "category_large": t.category_large,
            "category_medium": t.category_medium,
            "name": t.name,
            "start_date": str(t.start_date),
            "end_date": str(t.end_date),
            "task_type": t.task_type,
            "progress": t.progress,
            "parent_id": t.parent_id,
            "sort_order": t.sort_order,
            "color": t.color,
            "notes": t.notes,
            "dependencies": [{"depends_on_id": d.depends_on_id} for d in t.dependencies],
        })

    # このプロジェクトの最新バージョン番号を取得して +1 する。
    last = (
        db.query(ProjectSnapshot)
        .filter(ProjectSnapshot.project_id == project_id)
        .order_by(ProjectSnapshot.version_number.desc())
        .first()
    )
    next_version = (last.version_number + 1) if last else 1

    # スナップショット作成時点の最大 changelog ID を記録する。
    # GET /changelog ではこの ID より大きいエントリのみを「未コミット変更」として返す。
    # タイムスタンプ（SQLite では秒精度）ではなく ID で比較することで
    # 高速テストや同一秒内の連続操作でも正確なフィルタリングが保証される。
    from sqlalchemy import func as sqlfunc
    last_log_id = (
        db.query(sqlfunc.max(ProjectChangeLog.id))
        .filter(ProjectChangeLog.project_id == project_id)
        .scalar()
    ) or 0

    snap = ProjectSnapshot(
        project_id=project_id,
        version_number=next_version,
        label=label,
        tasks_json=json.dumps(tasks_data, ensure_ascii=False),
        last_changelog_id=last_log_id,
    )
    db.add(snap)
    db.flush()  # snap.id を確定させるが commit は呼び出し元に委ねる

    # 上限超過分の古いスナップショットを削除する。
    # flush 後にクエリするとこのセッション内の未コミット snap も含まれる。
    old_snaps = (
        db.query(ProjectSnapshot)
        .filter(ProjectSnapshot.project_id == project_id)
        .order_by(ProjectSnapshot.version_number.asc())
        .all()
    )
    if len(old_snaps) > _MAX_SNAPSHOTS:
        for s in old_snaps[: len(old_snaps) - _MAX_SNAPSHOTS]:
            db.delete(s)
