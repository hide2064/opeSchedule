# /api/v1/projects/{id}/snapshots および /changelog エンドポイント。
# スナップショット（バージョン）はユーザーが手動で作成する。
# 変更ログ（project_change_log）は最後のスナップショット以降の未コミット変更一覧を返す。
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.changelog import ProjectChangeLog
from app.models.project import Project
from app.models.snapshot import ProjectSnapshot
from app.snapshot_utils import create_snapshot
from app.utils import get_or_404

router = APIRouter(tags=["snapshots"])


# ── レスポンススキーマ ────────────────────────────────────────────────────────

class SnapshotCreate(BaseModel):
    """バージョンUP リクエスト。ユーザーが任意のラベルを指定できる。"""
    label: str


class SnapshotListItem(BaseModel):
    """スナップショット一覧表示用レスポンス。tasks_json は含めず軽量にする。"""
    id: int
    version_number: int
    label: str
    created_at: datetime
    task_count: int

    model_config = {"from_attributes": True}


class SnapshotDetail(BaseModel):
    """スナップショット詳細レスポンス。tasks_json を含む。"""
    id: int
    project_id: int
    version_number: int
    label: str
    tasks_json: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChangeLogItem(BaseModel):
    """変更ログ 1件のレスポンス。"""
    id: int
    operation: str
    task_name: str | None
    detail: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── エンドポイント ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/snapshots", response_model=list[SnapshotListItem])
def list_snapshots(project_id: int, db: Session = Depends(get_db)) -> list[SnapshotListItem]:
    """プロジェクトのスナップショット一覧を新しい順で返す。"""
    get_or_404(db, Project, project_id, "Project not found")
    snaps = (
        db.query(ProjectSnapshot)
        .filter(ProjectSnapshot.project_id == project_id)
        .order_by(ProjectSnapshot.version_number.desc())
        .all()
    )
    result = []
    for s in snaps:
        tasks = json.loads(s.tasks_json)
        result.append(SnapshotListItem(
            id=s.id,
            version_number=s.version_number,
            label=s.label,
            created_at=s.created_at,
            task_count=len(tasks),
        ))
    return result


@router.post(
    "/projects/{project_id}/snapshots",
    response_model=SnapshotListItem,
    status_code=status.HTTP_201_CREATED,
)
def create_version(
    project_id: int,
    payload: SnapshotCreate,
    db: Session = Depends(get_db),
) -> SnapshotListItem:
    """ユーザーが手動でバージョンUPを実行する。
    現在のタスク全量をスナップショットとして保存し、バージョン番号をインクリメントする。
    """
    get_or_404(db, Project, project_id, "Project not found")
    create_snapshot(db, project_id, payload.label.strip() or "バージョンUP")
    db.commit()

    # 作成したスナップショットを取得して返す
    snap = (
        db.query(ProjectSnapshot)
        .filter(ProjectSnapshot.project_id == project_id)
        .order_by(ProjectSnapshot.version_number.desc())
        .first()
    )
    tasks = json.loads(snap.tasks_json)
    return SnapshotListItem(
        id=snap.id,
        version_number=snap.version_number,
        label=snap.label,
        created_at=snap.created_at,
        task_count=len(tasks),
    )


@router.get("/projects/{project_id}/snapshots/{snap_id}", response_model=SnapshotDetail)
def get_snapshot(project_id: int, snap_id: int, db: Session = Depends(get_db)) -> ProjectSnapshot:
    """指定スナップショットの詳細（tasks_json 含む）を返す。"""
    get_or_404(db, Project, project_id, "Project not found")
    snap = get_or_404(db, ProjectSnapshot, snap_id, "Snapshot not found")
    if snap.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return snap


@router.get("/projects/{project_id}/changelog", response_model=list[ChangeLogItem])
def list_changelog(project_id: int, db: Session = Depends(get_db)) -> list[ChangeLogItem]:
    """最後のスナップショット以降の変更ログ（未コミット変更）を古い順で返す。
    スナップショットがまだない場合は全変更ログを返す。
    """
    get_or_404(db, Project, project_id, "Project not found")

    # 最後のスナップショットの作成日時を取得
    last_snap = (
        db.query(ProjectSnapshot)
        .filter(ProjectSnapshot.project_id == project_id)
        .order_by(ProjectSnapshot.created_at.desc())
        .first()
    )

    query = db.query(ProjectChangeLog).filter(
        ProjectChangeLog.project_id == project_id
    )
    if last_snap is not None:
        query = query.filter(ProjectChangeLog.created_at > last_snap.created_at)

    return query.order_by(ProjectChangeLog.created_at.asc()).all()
