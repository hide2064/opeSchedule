# /api/v1/projects CRUD エンドポイント。
# プロジェクトの一覧取得・作成・取得・更新・削除を提供する。
# list_projects / get_project では latest_version と last_activity_at を計算フィールドとして付与する。
from datetime import datetime

from fastapi import APIRouter, Depends, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.changelog import ProjectChangeLog
from app.models.project import Project
from app.models.snapshot import ProjectSnapshot
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.utils import apply_patch, commit_and_refresh, get_or_404

router = APIRouter(tags=["projects"])


def _enrich(project: Project, db: Session) -> dict:
    """Project ORM オブジェクトに latest_version と last_activity_at を付与して dict で返す。

    latest_version  : そのプロジェクトの最新スナップショットのバージョン番号。
    last_activity_at: project.updated_at と最新変更ログ日時のうち新しい方。
    """
    # 最新スナップショットのバージョン番号
    snap = (
        db.query(ProjectSnapshot.version_number)
        .filter(ProjectSnapshot.project_id == project.id)
        .order_by(ProjectSnapshot.version_number.desc())
        .first()
    )
    latest_version = snap[0] if snap else None

    # 最新変更ログの日時
    log = (
        db.query(func.max(ProjectChangeLog.created_at))
        .filter(ProjectChangeLog.project_id == project.id)
        .scalar()
    )
    # プロジェクト更新日時と変更ログ日時の新しい方を採用
    last_activity_at: datetime | None = project.updated_at
    if log and (last_activity_at is None or log > last_activity_at):
        last_activity_at = log

    return {
        **{c.key: getattr(project, c.key) for c in project.__table__.columns},
        "latest_version":   latest_version,
        "last_activity_at": last_activity_at,
    }


def _enrich_batch(projects: list[Project], db: Session) -> list[dict]:
    """複数プロジェクトを一括で enrich する（N+1 を避けるバッチ版）。"""
    if not projects:
        return []
    ids = [p.id for p in projects]

    # プロジェクトごとの最新バージョン番号（1クエリ）
    version_rows = (
        db.query(ProjectSnapshot.project_id, func.max(ProjectSnapshot.version_number))
        .filter(ProjectSnapshot.project_id.in_(ids))
        .group_by(ProjectSnapshot.project_id)
        .all()
    )
    version_map = {pid: ver for pid, ver in version_rows}

    # プロジェクトごとの最新変更ログ日時（1クエリ）
    log_rows = (
        db.query(ProjectChangeLog.project_id, func.max(ProjectChangeLog.created_at))
        .filter(ProjectChangeLog.project_id.in_(ids))
        .group_by(ProjectChangeLog.project_id)
        .all()
    )
    log_map = {pid: ts for pid, ts in log_rows}

    result = []
    for p in projects:
        latest_version = version_map.get(p.id)
        log_ts = log_map.get(p.id)
        last_activity_at: datetime | None = p.updated_at
        if log_ts and (last_activity_at is None or log_ts > last_activity_at):
            last_activity_at = log_ts
        result.append({
            **{c.key: getattr(p, c.key) for c in p.__table__.columns},
            "latest_version":   latest_version,
            "last_activity_at": last_activity_at,
        })
    return result


@router.get("/projects", response_model=list[ProjectResponse])
def list_projects(
    include_archived: bool = False,
    db: Session = Depends(get_db),
) -> list[dict]:
    query = db.query(Project)
    if not include_archived:
        query = query.filter(Project.status == "active")
    projects = query.order_by(Project.sort_order, Project.created_at).all()
    return _enrich_batch(projects, db)


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)) -> dict:
    project = Project(**payload.model_dump())
    db.add(project)
    commit_and_refresh(db, project)
    return _enrich(project, db)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)) -> dict:
    project = get_or_404(db, Project, project_id, "Project not found")
    return _enrich(project, db)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)
) -> dict:
    project = get_or_404(db, Project, project_id, "Project not found")
    apply_patch(project, payload)
    commit_and_refresh(db, project)
    return _enrich(project, db)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> None:
    project = get_or_404(db, Project, project_id, "Project not found")
    db.delete(project)
    db.commit()
