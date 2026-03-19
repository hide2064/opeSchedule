# /api/v1/projects CRUD エンドポイント。
# プロジェクトの一覧取得・作成・取得・更新・削除を提供する。
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter(tags=["projects"])


def get_project_or_404(project_id: int, db: Session) -> Project:
    # 共通ユーティリティ関数。
    # 指定された project_id のプロジェクトが存在しない場合は
    # HTTP 404 を返し、各エンドポイントでの重複処理を排除する。
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


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
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)) -> Project:
    return get_project_or_404(project_id, db)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)
) -> Project:
    project = get_project_or_404(project_id, db)
    # exclude_none=True で None のフィールドをスキップし、
    # リクエストで送信されたフィールドのみを更新する（部分更新 PATCH の標準実装）。
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> None:
    project = get_project_or_404(project_id, db)
    # プロジェクトを削除すると、ORM の cascade="all, delete-orphan" と
    # DB の CASCADE DELETE により、関連するタスクおよび依存関係レコードも
    # 自動的に削除される。
    db.delete(project)
    db.commit()
