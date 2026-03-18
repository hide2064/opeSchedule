import pytest


@pytest.fixture
def project_with_tasks(client):
    r = client.post("/api/v1/projects", json={"name": "Reorder Test"})
    pid = r.json()["id"]
    t1 = client.post(f"/api/v1/projects/{pid}/tasks",
                     json={"name": "Task A", "start_date": "2026-04-01", "end_date": "2026-04-03",
                           "sort_order": 0}).json()
    t2 = client.post(f"/api/v1/projects/{pid}/tasks",
                     json={"name": "Task B", "start_date": "2026-04-05", "end_date": "2026-04-07",
                           "sort_order": 1}).json()
    t3 = client.post(f"/api/v1/projects/{pid}/tasks",
                     json={"name": "Task C", "start_date": "2026-04-10", "end_date": "2026-04-14",
                           "sort_order": 2}).json()
    return pid, [t1, t2, t3]


def test_reorder_tasks(client, project_with_tasks):
    pid, tasks = project_with_tasks
    # A=0, B=1, C=2  →  C=0, A=1, B=2 に変更
    payload = [
        {"id": tasks[2]["id"], "sort_order": 0},
        {"id": tasks[0]["id"], "sort_order": 1},
        {"id": tasks[1]["id"], "sort_order": 2},
    ]
    res = client.post(f"/api/v1/projects/{pid}/tasks/reorder", json=payload)
    assert res.status_code == 204

    # 並び順を確認
    listed = client.get(f"/api/v1/projects/{pid}/tasks").json()
    names = [t["name"] for t in listed]
    assert names == ["Task C", "Task A", "Task B"]


def test_reorder_unknown_project(client):
    res = client.post("/api/v1/projects/9999/tasks/reorder",
                      json=[{"id": 1, "sort_order": 0}])
    assert res.status_code == 404


def test_reorder_ignores_foreign_tasks(client, project_with_tasks):
    pid, tasks = project_with_tasks
    # 別プロジェクトのタスク ID を混ぜても 204 で正常終了（無視される）
    payload = [
        {"id": tasks[0]["id"], "sort_order": 99},
        {"id": 99999, "sort_order": 0},   # 存在しない ID
    ]
    res = client.post(f"/api/v1/projects/{pid}/tasks/reorder", json=payload)
    assert res.status_code == 204
