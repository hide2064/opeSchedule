# /api/v1/projects/{id}/share および /api/v1/share/{token} エンドポイント。
# プロジェクトの読み取り専用共有URLのトークン管理と、トークンによる閲覧を提供する。
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.task import Task, TaskDependency
from app.utils import get_or_404

router = APIRouter(tags=["share"])


# ── スキーマ ─────────────────────────────────────────────────────────────────

class ShareTokenResponse(BaseModel):
    share_token: str
    share_url: str


class SharedProjectResponse(BaseModel):
    """共有URL経由のアクセス時に返すプロジェクト＋タスクの読み取り専用データ。"""
    project_id: int
    project_name: str
    color: str
    model_name: str | None
    client_name: str | None
    tasks: list[dict]


# ── エンドポイント ────────────────────────────────────────────────────────────

@router.post(
    "/projects/{project_id}/share",
    response_model=ShareTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def issue_share_token(
    project_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """プロジェクトの共有トークンを発行する。
    すでにトークンが存在する場合はそのまま返す（冪等）。
    """
    project = get_or_404(db, Project, project_id, "Project not found")

    if not project.share_token:
        project.share_token = str(uuid.uuid4())
        db.commit()
        db.refresh(project)

    return {
        "share_token": project.share_token,
        "share_url": f"/share/{project.share_token}",
    }


@router.delete(
    "/projects/{project_id}/share",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_share_token(
    project_id: int,
    db: Session = Depends(get_db),
) -> None:
    """プロジェクトの共有トークンを無効化する。"""
    project = get_or_404(db, Project, project_id, "Project not found")
    project.share_token = None
    db.commit()


@router.get("/share/{token}", response_model=SharedProjectResponse)
def get_shared_project(token: str, db: Session = Depends(get_db)) -> dict:
    """共有トークンを使ってプロジェクトと全タスクを読み取り専用で取得する。
    トークンが無効な場合は 404 を返す（トークンの存在有無を悟られないよう）。
    """
    project = (
        db.query(Project)
        .filter(Project.share_token == token, Project.status == "active")
        .first()
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared project not found")

    tasks = (
        db.query(Task)
        .filter(Task.project_id == project.id)
        .order_by(Task.sort_order, Task.id)
        .all()
    )

    task_list = []
    for t in tasks:
        deps = [{"depends_on_id": d.depends_on_id} for d in t.dependencies]
        task_list.append({
            "id": t.id,
            "name": t.name,
            "task_type": t.task_type,
            "start_date": t.start_date.isoformat() if t.start_date else None,
            "end_date": t.end_date.isoformat() if t.end_date else None,
            "progress": t.progress,
            "category_large": t.category_large,
            "category_medium": t.category_medium,
            "assignee_id": t.assignee_id,
            "notes": t.notes,
            "sort_order": t.sort_order,
            "dependencies": deps,
            "_project_id": project.id,
        })

    return {
        "project_id": project.id,
        "project_name": project.name,
        "color": project.color,
        "model_name": project.model_name,
        "client_name": project.client_name,
        "tasks": task_list,
    }
