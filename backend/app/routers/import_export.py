import csv
import io
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.task import Task, TaskDependency

router = APIRouter(tags=["import_export"])

# ── Export ──────────────────────────────────────────────────────────────────


def _project_or_404(project_id: int, db: Session) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _tasks_to_export_dicts(tasks: list[Task]) -> list[dict]:
    result = []
    for task in tasks:
        result.append(
            {
                "id": task.id,
                "name": task.name,
                "start_date": task.start_date.isoformat(),
                "end_date": task.end_date.isoformat(),
                "task_type": task.task_type,
                "progress": task.progress,
                "parent_id": task.parent_id,
                "sort_order": task.sort_order,
                "color": task.color,
                "notes": task.notes,
                "dependencies": [d.depends_on_id for d in task.dependencies],
            }
        )
    return result


@router.get("/projects/{project_id}/export")
def export_project(
    project_id: int,
    format: str = "json",
    db: Session = Depends(get_db),
) -> StreamingResponse:
    project = _project_or_404(project_id, db)
    tasks = (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .order_by(Task.sort_order, Task.id)
        .all()
    )
    task_dicts = _tasks_to_export_dicts(tasks)

    if format == "json":
        from datetime import datetime, timezone

        payload = {
            "version": "1.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "project": {
                "name": project.name,
                "description": project.description,
                "color": project.color,
                "view_mode": project.view_mode,
            },
            "tasks": task_dicts,
        }
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        return StreamingResponse(
            io.StringIO(content),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="project_{project_id}.json"'
            },
        )

    elif format == "csv":
        output = io.StringIO()
        fieldnames = [
            "name", "start_date", "end_date", "task_type", "progress",
            "color", "notes", "dependencies", "sort_order",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for t in task_dicts:
            writer.writerow(
                {
                    "name": t["name"],
                    "start_date": t["start_date"],
                    "end_date": t["end_date"],
                    "task_type": t["task_type"],
                    "progress": t["progress"],
                    "color": t["color"] or "",
                    "notes": t["notes"] or "",
                    "dependencies": ",".join(str(d) for d in t["dependencies"]),
                    "sort_order": t["sort_order"],
                }
            )
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="project_{project_id}.csv"'
            },
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="format must be json or csv",
    )


# ── Import ───────────────────────────────────────────────────────────────────


def _validate_no_circular(tasks_data: list[dict]) -> None:
    """DFS check for circular dependencies within the import data."""
    id_to_deps: dict[int, list[int]] = {t["id"]: t["dependencies"] for t in tasks_data}

    def dfs(node: int, visited: set[int], stack: set[int]) -> bool:
        visited.add(node)
        stack.add(node)
        for dep in id_to_deps.get(node, []):
            if dep not in visited:
                if dfs(dep, visited, stack):
                    return True
            elif dep in stack:
                return True
        stack.discard(node)
        return False

    visited: set[int] = set()
    for task_id in id_to_deps:
        if task_id not in visited:
            if dfs(task_id, visited, set()):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Circular dependency detected in import data",
                )


def _import_tasks(tasks_data: list[dict], project_id: int, db: Session) -> None:
    """Insert tasks and remap old IDs to new DB IDs."""
    old_to_new: dict[int, int] = {}

    # Sort by sort_order to preserve order
    tasks_data.sort(key=lambda t: t.get("sort_order", 0))

    # First pass: insert tasks without dependencies
    for t in tasks_data:
        task = Task(
            project_id=project_id,
            name=t["name"],
            start_date=date.fromisoformat(t["start_date"]),
            end_date=date.fromisoformat(t["end_date"]),
            task_type=t.get("task_type", "task"),
            progress=float(t.get("progress", 0.0)),
            sort_order=int(t.get("sort_order", 0)),
            color=t.get("color") or None,
            notes=t.get("notes") or None,
        )
        db.add(task)
        db.flush()
        old_to_new[t["id"]] = task.id

    # Second pass: add dependencies using remapped IDs
    for t in tasks_data:
        new_task_id = old_to_new[t["id"]]
        for old_dep_id in t.get("dependencies", []):
            new_dep_id = old_to_new.get(old_dep_id)
            if new_dep_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Dependency references unknown task id={old_dep_id}",
                )
            db.add(TaskDependency(task_id=new_task_id, depends_on_id=new_dep_id))


@router.post("/projects/import", response_model=dict, status_code=status.HTTP_201_CREATED)
async def import_project(file: UploadFile, db: Session = Depends(get_db)) -> dict:
    content = await file.read()

    if file.filename and file.filename.endswith(".json"):
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON: {e}")

        proj_data = data.get("project", {})
        tasks_data: list[dict] = data.get("tasks", [])

    elif file.filename and file.filename.endswith(".csv"):
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        # Build minimal project data from filename
        proj_data = {"name": file.filename.removesuffix(".csv")}
        tasks_data = []
        for i, row in enumerate(rows):
            dep_str = row.get("dependencies", "").strip()
            deps = [int(d) for d in dep_str.split(",") if d.strip().isdigit()]
            tasks_data.append(
                {
                    "id": i,  # temporary local ID
                    "name": row["name"],
                    "start_date": row["start_date"],
                    "end_date": row["end_date"],
                    "task_type": row.get("task_type", "task"),
                    "progress": float(row.get("progress", 0)),
                    "color": row.get("color") or None,
                    "notes": row.get("notes") or None,
                    "sort_order": int(row.get("sort_order", i)),
                    "dependencies": deps,
                }
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be .json or .csv",
        )

    if not proj_data.get("name"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Project name is required"
        )

    _validate_no_circular(tasks_data)

    project = Project(
        name=proj_data["name"],
        description=proj_data.get("description"),
        color=proj_data.get("color", "#4A90D9"),
        view_mode=proj_data.get("view_mode"),
    )
    db.add(project)
    db.flush()

    _import_tasks(tasks_data, project.id, db)
    db.commit()

    return {"project_id": project.id, "task_count": len(tasks_data)}
