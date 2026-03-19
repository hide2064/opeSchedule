# /api/v1/projects/{id}/tasks CRUD + reorder エンドポイント。
# タスクの一覧取得・作成・更新・日付更新（D&D）・並び替え・削除を提供する。
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.task import Task, TaskDependency
from app.schemas.task import TaskCreate, TaskDateUpdate, TaskReorderItem, TaskResponse, TaskUpdate

router = APIRouter(tags=["tasks"])


def get_project_or_404(project_id: int, db: Session) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def get_task_or_404(task_id: int, db: Session) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def set_dependencies(task: Task, dependency_ids: list[int], db: Session) -> None:
    # 全件削除→再登録パターンで依存関係を更新する。
    # 差分更新より実装がシンプルで、タスクの依存関係数が少ない場合には十分な性能が得られる。
    # Remove existing dependencies
    db.query(TaskDependency).filter(TaskDependency.task_id == task.id).delete()

    # Add new dependencies
    for dep_id in dependency_ids:
        # 自己参照チェック: タスク自身への依存は許可しない
        if dep_id == task.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Task cannot depend on itself (id={dep_id})",
            )
        # 存在チェック: 依存先タスクが DB に存在することを確認する
        dep_task = db.get(Task, dep_id)
        if dep_task is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dependency task not found: id={dep_id}",
            )
        db.add(TaskDependency(task_id=task.id, depends_on_id=dep_id))


@router.get("/projects/{project_id}/tasks", response_model=list[TaskResponse])
def list_tasks(project_id: int, db: Session = Depends(get_db)) -> list[Task]:
    get_project_or_404(project_id, db)
    return (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .order_by(Task.sort_order, Task.id)
        .all()
    )


@router.post(
    "/projects/{project_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    project_id: int, payload: TaskCreate, db: Session = Depends(get_db)
) -> Task:
    get_project_or_404(project_id, db)

    # dependency_ids は ORM モデルには渡さず、set_dependencies() で別途処理する
    task_data = payload.model_dump(exclude={"dependency_ids"})
    task = Task(project_id=project_id, **task_data)
    db.add(task)
    # commit 前に flush を実行して task.id を DB から取得する。
    # set_dependencies() が task.id を使用するため、flush が必要。
    db.flush()  # get task.id before setting dependencies

    set_dependencies(task, payload.dependency_ids, db)

    db.commit()
    db.refresh(task)
    return task


@router.patch("/projects/{project_id}/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    project_id: int,
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
) -> Task:
    get_project_or_404(project_id, db)
    task = get_task_or_404(task_id, db)
    if task.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    update_data = payload.model_dump(exclude_none=True, exclude={"dependency_ids"})
    for field, value in update_data.items():
        setattr(task, field, value)

    # Validate milestone constraint after update
    # DB の CHECK 制約より先に Python レベルで検証することで、
    # DB エラーではなく分かりやすいエラーメッセージを API レスポンスとして返す。
    # 更新後の有効値（update_data の値 or 既存の task の値）を使って判定する。
    effective_type = update_data.get("task_type", task.task_type)
    effective_start = update_data.get("start_date", task.start_date)
    effective_end = update_data.get("end_date", task.end_date)
    if effective_type == "milestone" and effective_start != effective_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Milestone must have start_date == end_date",
        )

    # dependency_ids が None の場合は依存関係を変更しない
    if payload.dependency_ids is not None:
        set_dependencies(task, payload.dependency_ids, db)

    db.commit()
    db.refresh(task)
    return task


@router.patch("/projects/{project_id}/tasks/{task_id}/dates", response_model=TaskResponse)
def update_task_dates(
    project_id: int,
    task_id: int,
    payload: TaskDateUpdate,
    db: Session = Depends(get_db),
) -> Task:
    """Lightweight endpoint for drag-and-drop date changes."""
    # D&D（ドラッグ&ドロップ）専用の軽量エンドポイント。
    # Gantt バーのドラッグ操作では start_date / end_date のみ変化するため、
    # 全フィールドを送信する PATCH /tasks/{id} より帯域・処理を節約できる。
    get_project_or_404(project_id, db)
    task = get_task_or_404(task_id, db)
    if task.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.task_type == "milestone" and payload.start_date != payload.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Milestone must have start_date == end_date",
        )

    task.start_date = payload.start_date
    task.end_date = payload.end_date
    db.commit()
    db.refresh(task)
    return task


@router.post("/projects/{project_id}/tasks/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_tasks(
    project_id: int,
    payload: list[TaskReorderItem],
    db: Session = Depends(get_db),
) -> None:
    """タスクの sort_order を一括更新する。"""
    get_project_or_404(project_id, db)
    # プロジェクト帰属確認（task.project_id == project_id）を行い、
    # 他プロジェクトのタスクが誤って更新されないよう保護する。
    # 全件の sort_order 更新を 1 回の commit でまとめて反映する。
    for item in payload:
        task = db.get(Task, item.id)
        if task and task.project_id == project_id:
            task.sort_order = item.sort_order
    db.commit()


@router.delete(
    "/projects/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_task(project_id: int, task_id: int, db: Session = Depends(get_db)) -> None:
    get_project_or_404(project_id, db)
    task = get_task_or_404(task_id, db)
    if task.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    db.delete(task)
    db.commit()
