# /api/v1/projects/{id}/snapshots エンドポイント。
# プロジェクトのスケジュール履歴（バージョン一覧・バージョン詳細）を提供する。
import json
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.snapshot import ProjectSnapshot
from app.utils import get_or_404

router = APIRouter(tags=["snapshots"])


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


@router.get("/projects/{project_id}/snapshots/{snap_id}", response_model=SnapshotDetail)
def get_snapshot(project_id: int, snap_id: int, db: Session = Depends(get_db)) -> ProjectSnapshot:
    """指定スナップショットの詳細（tasks_json 含む）を返す。"""
    get_or_404(db, Project, project_id, "Project not found")
    snap = get_or_404(db, ProjectSnapshot, snap_id, "Snapshot not found")
    if snap.project_id != project_id:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return snap
