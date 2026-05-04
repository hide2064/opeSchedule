# /api/v1/projects/{id}/tasks/{task_id}/comments CRUD エンドポイント。
# タスクに紐づくコメントの一覧取得・作成・更新・削除を提供する。
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.task import Task, TaskComment
from app.schemas.task import TaskCommentCreate, TaskCommentUpdate, TaskCommentResponse
from app.utils import commit_and_refresh, get_or_404

router = APIRouter(tags=["comments"])


def _check_task_in_project(task: Task, project_id: int) -> None:
    if task.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")


@router.get(
    "/projects/{project_id}/tasks/{task_id}/comments",
    response_model=list[TaskCommentResponse],
)
def list_comments(
    project_id: int, task_id: int, db: Session = Depends(get_db)
) -> list[TaskComment]:
    get_or_404(db, Project, project_id, "Project not found")
    task = get_or_404(db, Task, task_id, "Task not found")
    _check_task_in_project(task, project_id)
    return (
        db.query(TaskComment)
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at)
        .all()
    )


@router.post(
    "/projects/{project_id}/tasks/{task_id}/comments",
    response_model=TaskCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    project_id: int,
    task_id: int,
    payload: TaskCommentCreate,
    db: Session = Depends(get_db),
) -> TaskComment:
    get_or_404(db, Project, project_id, "Project not found")
    task = get_or_404(db, Task, task_id, "Task not found")
    _check_task_in_project(task, project_id)
    comment = TaskComment(
        task_id=task_id,
        text=payload.text.strip(),
        is_todo=payload.is_todo,
        is_done=False,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.patch(
    "/projects/{project_id}/tasks/{task_id}/comments/{comment_id}",
    response_model=TaskCommentResponse,
)
def update_comment(
    project_id: int,
    task_id: int,
    comment_id: int,
    payload: TaskCommentUpdate,
    db: Session = Depends(get_db),
) -> TaskComment:
    """コメントの is_todo / is_done / text を部分更新する。"""
    get_or_404(db, Project, project_id, "Project not found")
    task = get_or_404(db, Task, task_id, "Task not found")
    _check_task_in_project(task, project_id)
    comment = get_or_404(db, TaskComment, comment_id, "Comment not found")
    if comment.task_id != task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if payload.is_todo is not None:
        comment.is_todo = payload.is_todo
        if not payload.is_todo:
            comment.is_done = False
    if payload.is_done is not None:
        comment.is_done = payload.is_done
    if payload.text is not None:
        stripped = payload.text.strip()
        if not stripped:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment text cannot be empty")
        comment.text = stripped
    return commit_and_refresh(db, comment)


@router.delete(
    "/projects/{project_id}/tasks/{task_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_comment(
    project_id: int,
    task_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
) -> None:
    get_or_404(db, Project, project_id, "Project not found")
    task = get_or_404(db, Task, task_id, "Task not found")
    _check_task_in_project(task, project_id)
    comment = get_or_404(db, TaskComment, comment_id, "Comment not found")
    if comment.task_id != task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    db.delete(comment)
    db.commit()
