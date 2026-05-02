from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.member import Member
from app.models.project import Project
from app.models.task import Task
from app.schemas.member import MemberCreate, MemberResponse, MemberUpdate
from app.utils import apply_patch, commit_and_refresh, get_or_404

router = APIRouter(tags=["members"])


def _check_member_in_project(member: Member, project_id: int) -> None:
    if member.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")


@router.get("/projects/{project_id}/members", response_model=list[MemberResponse])
def list_members(project_id: int, db: Session = Depends(get_db)) -> list[Member]:
    get_or_404(db, Project, project_id, "Project not found")
    return db.query(Member).filter(Member.project_id == project_id).order_by(Member.id).all()


@router.post(
    "/projects/{project_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_member(
    project_id: int, payload: MemberCreate, db: Session = Depends(get_db)
) -> Member:
    get_or_404(db, Project, project_id, "Project not found")
    if not payload.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Member name cannot be empty"
        )
    member = Member(
        project_id=project_id,
        name=payload.name.strip(),
        color=payload.color,
        email=payload.email,
    )
    db.add(member)
    return commit_and_refresh(db, member)


@router.patch("/projects/{project_id}/members/{member_id}", response_model=MemberResponse)
def update_member(
    project_id: int, member_id: int, payload: MemberUpdate, db: Session = Depends(get_db)
) -> Member:
    get_or_404(db, Project, project_id, "Project not found")
    member = get_or_404(db, Member, member_id, "Member not found")
    _check_member_in_project(member, project_id)
    apply_patch(member, payload)
    return commit_and_refresh(db, member)


@router.delete(
    "/projects/{project_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_member(
    project_id: int, member_id: int, db: Session = Depends(get_db)
) -> None:
    get_or_404(db, Project, project_id, "Project not found")
    member = get_or_404(db, Member, member_id, "Member not found")
    _check_member_in_project(member, project_id)
    # SQLite は ON DELETE SET NULL を自動実行しないため、アプリ側で NULL を設定する
    db.query(Task).filter(Task.assignee_id == member_id).update({"assignee_id": None})
    db.delete(member)
    db.commit()
