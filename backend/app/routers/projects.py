# /api/v1/projects CRUD エンドポイント。
# プロジェクトの一覧取得・作成・取得・更新・削除を提供する。
# list_projects / get_project では latest_version と last_activity_at を計算フィールドとして付与する。
from datetime import datetime
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.changelog import ProjectChangeLog
from app.models.project import Project
from app.models.snapshot import ProjectSnapshot
from app.models.task import Task
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectStats, ProjectUpdate
from app.utils import apply_patch, commit_and_refresh, get_or_404

router = APIRouter(tags=["projects"])


def _check_circular(db: Session, project_id: int, new_parent_id: int | None) -> None:
    """new_parent_id を設定すると循環参照になるか確認する。なる場合は HTTPException(400)。"""
    if new_parent_id is None:
        return
    if new_parent_id == project_id:
        raise HTTPException(status_code=400, detail="プロジェクトは自分自身を親にできません")
    # 新しい親から祖先をたどり、自分自身が出てきたら循環
    cur_id = new_parent_id
    visited: set[int] = set()
    while cur_id is not None:
        if cur_id in visited:
            break  # 既存の循環（別バグ）は無視
        visited.add(cur_id)
        if cur_id == project_id:
            raise HTTPException(status_code=400, detail="循環参照になるため設定できません")
        parent = db.query(Project.parent_project_id).filter(Project.id == cur_id).scalar()
        cur_id = parent


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


@router.get("/projects/stats", response_model=list[ProjectStats])
def list_project_stats(db: Session = Depends(get_db)) -> list[dict]:
    """全アクティブプロジェクトの進捗集計を返す。/projects/{id} より先に登録必須。"""
    projects = (
        db.query(Project)
        .filter(Project.status == "active")
        .order_by(Project.sort_order, Project.created_at)
        .all()
    )
    today = date_type.today()
    result = []
    for p in projects:
        tasks = (
            db.query(Task)
            .filter(Task.project_id == p.id, Task.task_type == "task")
            .all()
        )
        total = len(tasks)
        completed = sum(1 for t in tasks if t.progress >= 1.0)
        delayed = sum(1 for t in tasks if t.end_date < today and t.progress < 1.0)
        progress_pct = sum(t.progress for t in tasks) / total if total > 0 else 0.0

        milestone = (
            db.query(Task)
            .filter(
                Task.project_id == p.id,
                Task.task_type == "milestone",
                Task.end_date >= today,
            )
            .order_by(Task.end_date)
            .first()
        )
        result.append({
            "id": p.id,
            "progress_pct": round(progress_pct, 4),
            "total_tasks": total,
            "completed_tasks": completed,
            "delayed_task_count": delayed,
            "next_milestone_name": milestone.name if milestone else None,
            "next_milestone_date": milestone.end_date if milestone else None,
        })
    return result


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
    # parent_project_id がリクエストに含まれている場合のみ循環参照チェックを実施する
    if "parent_project_id" in payload.model_fields_set:
        _check_circular(db, project_id, payload.parent_project_id)
    # image_data は apply_patch の exclude_none=True をバイパスして個別処理する。
    # “”（空文字）が送られた場合は None に変換して画像を削除。
    if payload.image_data is not None:
        project.image_data = payload.image_data or None
    apply_patch(project, payload, exclude={"image_data"})
    commit_and_refresh(db, project)
    return _enrich(project, db)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> None:
    project = get_or_404(db, Project, project_id, "Project not found")
    db.delete(project)
    db.commit()
