# /api/v1/templates エンドポイント。
# TaskTemplate の CRUD と、プロジェクトへのテンプレート適用を提供する。
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.snapshot import ProjectSnapshot
from app.models.task import Task, TaskDependency
from app.models.template import TaskTemplate
from app.utils import get_or_404

router = APIRouter(tags=["templates"])


# ── スキーマ ─────────────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    tasks_json: str  # JSON string


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tasks_json: str | None = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    description: str | None
    tasks_json: str
    task_count: int

    model_config = {"from_attributes": True}


class ApplyTemplateRequest(BaseModel):
    """テンプレートをプロジェクトに適用するリクエスト。
    base_date: テンプレートタスクの start_date 基準日。指定がなければ今日を使う。
    """
    base_date: str | None = None  # ISO date string e.g. "2026-05-01"


# ── ヘルパー ─────────────────────────────────────────────────────────────────

def _template_to_response(t: TaskTemplate) -> dict:
    try:
        task_count = len(json.loads(t.tasks_json))
    except Exception:
        task_count = 0
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "tasks_json": t.tasks_json,
        "task_count": task_count,
    }


# ── エンドポイント ────────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[TemplateResponse])
def list_templates(db: Session = Depends(get_db)) -> list[dict]:
    """全テンプレート一覧を返す。"""
    templates = db.query(TaskTemplate).order_by(TaskTemplate.created_at.desc()).all()
    return [_template_to_response(t) for t in templates]


@router.post("/templates", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(payload: TemplateCreate, db: Session = Depends(get_db)) -> dict:
    """新しいテンプレートを作成する。tasks_json が有効な JSON 配列であることを確認する。"""
    try:
        json.loads(payload.tasks_json)
    except Exception:
        raise HTTPException(status_code=400, detail="tasks_json must be a valid JSON string")
    t = TaskTemplate(
        name=payload.name,
        description=payload.description,
        tasks_json=payload.tasks_json,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _template_to_response(t)


@router.get("/templates/{template_id}", response_model=TemplateResponse)
def get_template(template_id: int, db: Session = Depends(get_db)) -> dict:
    t = get_or_404(db, TaskTemplate, template_id, "Template not found")
    return _template_to_response(t)


@router.patch("/templates/{template_id}", response_model=TemplateResponse)
def update_template(
    template_id: int, payload: TemplateUpdate, db: Session = Depends(get_db)
) -> dict:
    t = get_or_404(db, TaskTemplate, template_id, "Template not found")
    if payload.name is not None:
        t.name = payload.name
    if payload.description is not None:
        t.description = payload.description
    if payload.tasks_json is not None:
        try:
            json.loads(payload.tasks_json)
        except Exception:
            raise HTTPException(status_code=400, detail="tasks_json must be a valid JSON string")
        t.tasks_json = payload.tasks_json
    db.commit()
    db.refresh(t)
    return _template_to_response(t)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, db: Session = Depends(get_db)) -> None:
    t = get_or_404(db, TaskTemplate, template_id, "Template not found")
    db.delete(t)
    db.commit()


@router.post("/projects/{project_id}/apply_template/{template_id}", status_code=status.HTTP_201_CREATED)
def apply_template(
    project_id: int,
    template_id: int,
    payload: ApplyTemplateRequest,
    db: Session = Depends(get_db),
) -> dict:
    """テンプレートのタスクをプロジェクトに一括追加する。

    テンプレートの tasks_json には start_offset / end_offset（基準日からの日数）を
    保持するか、あるいは start_date / end_date をそのまま持つ形式を想定する。
    base_date が指定された場合は、start_date が最小のタスクをオフセット基準にする。
    """
    get_or_404(db, Project, project_id, "Project not found")
    t = get_or_404(db, TaskTemplate, template_id, "Template not found")

    try:
        task_dicts = json.loads(t.tasks_json)
    except Exception:
        raise HTTPException(status_code=500, detail="Template tasks_json is corrupted")

    if not task_dicts:
        return {"added": 0}

    # base_date を決定
    base = date.fromisoformat(payload.base_date) if payload.base_date else date.today()

    # テンプレートの最小 start_date を基準にオフセット計算
    start_dates = [
        date.fromisoformat(td["start_date"])
        for td in task_dicts
        if td.get("start_date")
    ]
    template_origin = min(start_dates) if start_dates else base
    day_shift = (base - template_origin).days

    # 現在の最大 sort_order を取得
    max_sort = db.query(Task.sort_order).filter(Task.project_id == project_id).order_by(
        Task.sort_order.desc()
    ).first()
    next_sort = (max_sort[0] + 1) if max_sort else 0

    # id マッピング（テンプレート内の旧ID → 新Task.id）
    old_to_new: dict[int, int] = {}

    created_tasks: list[Task] = []
    for i, td in enumerate(task_dicts):
        old_id = td.get("id")

        start_d = date.fromisoformat(td["start_date"]) if td.get("start_date") else base
        end_d = date.fromisoformat(td["end_date"]) if td.get("end_date") else base

        from datetime import timedelta
        new_start = start_d + timedelta(days=day_shift)
        new_end = end_d + timedelta(days=day_shift)

        task = Task(
            project_id=project_id,
            name=td.get("name", "タスク"),
            task_type=td.get("task_type", "task"),
            start_date=new_start,
            end_date=new_end,
            progress=0.0,
            category_large=td.get("category_large"),
            category_medium=td.get("category_medium"),
            notes=td.get("notes"),
            sort_order=next_sort + i,
        )
        db.add(task)
        db.flush()  # ID を確定させる
        created_tasks.append(task)
        if old_id is not None:
            old_to_new[old_id] = task.id

    # 依存関係を復元
    for td in task_dicts:
        old_id = td.get("id")
        if old_id is None or old_id not in old_to_new:
            continue
        new_successor_id = old_to_new[old_id]
        for dep in td.get("dependencies", []):
            old_pred_id = dep.get("depends_on_id")
            if old_pred_id in old_to_new:
                db.add(TaskDependency(
                    task_id=new_successor_id,
                    depends_on_id=old_to_new[old_pred_id],
                ))

    db.commit()
    return {"added": len(created_tasks)}


class SaveAsTemplateRequest(BaseModel):
    """プロジェクトをテンプレートとして保存するリクエスト。
    tasks_json はバックエンドで自動生成するため不要。
    """
    name: str
    description: str | None = None


@router.post("/projects/{project_id}/save_as_template", status_code=status.HTTP_201_CREATED)
def save_project_as_template(
    project_id: int,
    payload: SaveAsTemplateRequest,
    db: Session = Depends(get_db),
) -> dict:
    """現在のプロジェクトのタスクをテンプレートとして保存する。

    payload.tasks_json は無視され、プロジェクトの現在タスクから生成する。
    """
    get_or_404(db, Project, project_id, "Project not found")

    tasks = (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .order_by(Task.sort_order, Task.id)
        .all()
    )

    task_list = []
    for task in tasks:
        deps = [{"depends_on_id": d.depends_on_id} for d in task.dependencies]
        task_list.append({
            "id": task.id,
            "name": task.name,
            "task_type": task.task_type,
            "start_date": task.start_date.isoformat() if task.start_date else None,
            "end_date": task.end_date.isoformat() if task.end_date else None,
            "category_large": task.category_large,
            "category_medium": task.category_medium,
            "notes": task.notes,
            "sort_order": task.sort_order,
            "dependencies": deps,
        })

    t = TaskTemplate(
        name=payload.name,
        description=payload.description,
        tasks_json=json.dumps(task_list, ensure_ascii=False),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _template_to_response(t)
