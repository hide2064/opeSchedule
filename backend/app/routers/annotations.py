# /api/v1/projects/{id}/annotations CRUD エンドポイント。
# ガントチャート上の任意の位置に配置する付箋コメントの管理を提供する。
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.annotation import ProjectAnnotation
from app.models.project import Project
from app.schemas.annotation import AnnotationCreate, AnnotationResponse
from app.utils import commit_and_refresh, get_or_404

router = APIRouter(tags=["annotations"])


@router.get(
    "/projects/{project_id}/annotations",
    response_model=list[AnnotationResponse],
)
def list_annotations(
    project_id: int, db: Session = Depends(get_db)
) -> list[ProjectAnnotation]:
    get_or_404(db, Project, project_id, "Project not found")
    return (
        db.query(ProjectAnnotation)
        .filter(ProjectAnnotation.project_id == project_id)
        .order_by(ProjectAnnotation.created_at)
        .all()
    )


@router.post(
    "/projects/{project_id}/annotations",
    response_model=AnnotationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_annotation(
    project_id: int,
    payload: AnnotationCreate,
    db: Session = Depends(get_db),
) -> ProjectAnnotation:
    get_or_404(db, Project, project_id, "Project not found")
    text = payload.text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Annotation text cannot be empty",
        )
    annotation = ProjectAnnotation(
        project_id=project_id,
        text=text,
        anno_date=payload.anno_date,
        y_offset=max(0, payload.y_offset),
    )
    db.add(annotation)
    return commit_and_refresh(db, annotation)


@router.delete(
    "/projects/{project_id}/annotations/{annotation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_annotation(
    project_id: int,
    annotation_id: int,
    db: Session = Depends(get_db),
) -> None:
    get_or_404(db, Project, project_id, "Project not found")
    annotation = get_or_404(db, ProjectAnnotation, annotation_id, "Annotation not found")
    if annotation.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found"
        )
    db.delete(annotation)
    db.commit()
