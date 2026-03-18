import io
import json


def _make_project_with_tasks(client):
    r = client.post("/api/v1/projects", json={"name": "Export Test"})
    pid = r.json()["id"]
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "Phase 1", "start_date": "2026-04-01", "end_date": "2026-04-14"})
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "Launch", "start_date": "2026-04-15", "end_date": "2026-04-15",
                      "task_type": "milestone"})
    return pid


def test_export_json(client):
    pid = _make_project_with_tasks(client)
    res = client.get(f"/api/v1/projects/{pid}/export?format=json")
    assert res.status_code == 200
    data = json.loads(res.content)
    assert data["version"] == "1.0"
    assert data["project"]["name"] == "Export Test"
    assert len(data["tasks"]) == 2


def test_export_csv(client):
    pid = _make_project_with_tasks(client)
    res = client.get(f"/api/v1/projects/{pid}/export?format=csv")
    assert res.status_code == 200
    assert b"Phase 1" in res.content
    assert b"Launch" in res.content


def test_import_json(client):
    payload = {
        "version": "1.0",
        "project": {"name": "Imported Project"},
        "tasks": [
            {"id": 1, "name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07",
             "task_type": "task", "progress": 0.0, "sort_order": 0, "dependencies": []},
            {"id": 2, "name": "T2", "start_date": "2026-04-08", "end_date": "2026-04-14",
             "task_type": "task", "progress": 0.5, "sort_order": 1, "dependencies": [1]},
        ],
    }
    content = json.dumps(payload).encode()
    res = client.post(
        "/api/v1/projects/import",
        files={"file": ("schedule.json", io.BytesIO(content), "application/json")},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["task_count"] == 2

    # Verify the project was created
    pid = data["project_id"]
    tasks = client.get(f"/api/v1/projects/{pid}/tasks").json()
    assert len(tasks) == 2
    assert tasks[1]["dependencies"][0]["depends_on_id"] == tasks[0]["id"]


def test_import_csv(client):
    csv_content = (
        "name,start_date,end_date,task_type,progress,color,notes,dependencies,sort_order\n"
        "Phase 1,2026-04-01,2026-04-14,task,0.0,,,, 0\n"
        "Milestone,2026-04-15,2026-04-15,milestone,0.0,,,,1\n"
    )
    res = client.post(
        "/api/v1/projects/import",
        files={"file": ("project.csv", io.BytesIO(csv_content.encode()), "text/csv")},
    )
    assert res.status_code == 201
    assert res.json()["task_count"] == 2


def test_import_invalid_format(client):
    res = client.post(
        "/api/v1/projects/import",
        files={"file": ("data.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert res.status_code == 400


def test_export_not_found(client):
    res = client.get("/api/v1/projects/9999/export?format=json")
    assert res.status_code == 404
