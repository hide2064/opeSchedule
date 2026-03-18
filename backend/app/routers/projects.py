from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter(tags=["projects"])


def get_project_or_404(project_id: int, db: Session) -> Project:
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
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> None:
    project = get_project_or_404(project_id, db)
    db.delete(project)
    db.commit()
