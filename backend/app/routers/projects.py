# /api/v1/projects CRUD エンドポイント。
# プロジェクトの一覧取得・作成・取得・更新・削除を提供する。
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.utils import apply_patch, commit_and_refresh, get_or_404

router = APIRouter(tags=["projects"])


@router.get("/projects", response_model=list[ProjectResponse])
def list_projects(
    include_archived: bool = False,
    db: Session = Depends(get_db),
) -> list[Project]:
    query = db.query(Project)
    # include_archived=False（デフォルト）の場合は status="active" のプロジェクトのみ返す。
    # フロントエンドのアーカイブ表示チェックボックスが True を送信した場合のみ
    # アーカイブ済みプロジェクトも含めて返す。
    if not include_archived:
        query = query.filter(Project.status == "active")
    return query.order_by(Project.sort_order, Project.created_at).all()


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)) -> Project:
    project = Project(**payload.model_dump())
    db.add(project)
    return commit_and_refresh(db, project)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)) -> Project:
    return get_or_404(db, Project, project_id, "Project not found")


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)
) -> Project:
    project = get_or_404(db, Project, project_id, "Project not found")
    # exclude_none=True で None のフィールドをスキップし、
    # リクエストで送信されたフィールドのみを更新する（部分更新 PATCH の標準実装）。
    apply_patch(project, payload)
    return commit_and_refresh(db, project)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> None:
    project = get_or_404(db, Project, project_id, "Project not found")
    # プロジェクトを削除すると、ORM の cascade="all, delete-orphan" と
    # DB の CASCADE DELETE により、関連するタスクおよび依存関係レコードも
    # 自動的に削除される。
    db.delete(project)
    db.commit()
