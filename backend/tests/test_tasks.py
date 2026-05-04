import pytest


@pytest.fixture
def project(client):
    r = client.post("/api/v1/projects", json={"name": "Test Project"})
    return r.json()


def test_create_task(client, project):
    pid = project["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"name": "Task 1", "start_date": "2026-04-01", "end_date": "2026-04-07"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Task 1"
    assert data["task_type"] == "task"
    assert data["progress"] == 0.0


def test_create_milestone(client, project):
    pid = project["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={
            "name": "Go Live",
            "start_date": "2026-05-01",
            "end_date": "2026-05-01",
            "task_type": "milestone",
        },
    )
    assert res.status_code == 201
    assert res.json()["task_type"] == "milestone"


def test_create_milestone_with_range_fails(client, project):
    pid = project["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={
            "name": "Bad Milestone",
            "start_date": "2026-05-01",
            "end_date": "2026-05-05",
            "task_type": "milestone",
        },
    )
    assert res.status_code == 422


def test_list_tasks(client, project):
    pid = project["id"]
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-03"})
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "T2", "start_date": "2026-04-05", "end_date": "2026-04-10"})
    res = client.get(f"/api/v1/projects/{pid}/tasks")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_update_task_dates(client, project):
    pid = project["id"]
    r = client.post(f"/api/v1/projects/{pid}/tasks",
                    json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07"})
    tid = r.json()["id"]
    res = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/dates",
        json={"start_date": "2026-04-10", "end_date": "2026-04-15"},
    )
    assert res.status_code == 200
    assert res.json()["start_date"] == "2026-04-10"


def test_update_task_with_dependencies(client, project):
    pid = project["id"]
    r1 = client.post(f"/api/v1/projects/{pid}/tasks",
                     json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07"})
    r2 = client.post(f"/api/v1/projects/{pid}/tasks",
                     json={"name": "T2", "start_date": "2026-04-08", "end_date": "2026-04-14",
                           "dependency_ids": [r1.json()["id"]]})
    assert r2.status_code == 201
    assert len(r2.json()["dependencies"]) == 1


def test_delete_task(client, project):
    pid = project["id"]
    r = client.post(f"/api/v1/projects/{pid}/tasks",
                    json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07"})
    tid = r.json()["id"]
    res = client.delete(f"/api/v1/projects/{pid}/tasks/{tid}")
    assert res.status_code == 204


def test_task_end_before_start_fails(client, project):
    pid = project["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"name": "Bad", "start_date": "2026-04-10", "end_date": "2026-04-01"},
    )
    assert res.status_code == 422


def test_dependency_cross_project_rejected(client):
    """別プロジェクトのタスクへの依存は 400 を返すことを確認する。"""
    pid_a = client.post("/api/v1/projects", json={"name": "Project A"}).json()["id"]
    pid_b = client.post("/api/v1/projects", json={"name": "Project B"}).json()["id"]
    # Project A にタスクを作成
    t_a = client.post(f"/api/v1/projects/{pid_a}/tasks",
                      json={"name": "A-Task", "start_date": "2026-04-01",
                            "end_date": "2026-04-07"}).json()
    # Project B のタスクが Project A のタスクに依存しようとする → 拒否される
    res = client.post(f"/api/v1/projects/{pid_b}/tasks",
                      json={"name": "B-Task", "start_date": "2026-04-08",
                            "end_date": "2026-04-14",
                            "dependency_ids": [t_a["id"]]})
    assert res.status_code == 400
    assert "different project" in res.json()["detail"]


def test_delete_project_cascades_tasks(client, project):
    pid = project["id"]
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07"})
    client.delete(f"/api/v1/projects/{pid}")
    res = client.get(f"/api/v1/projects/{pid}/tasks")
    assert res.status_code == 404


def test_shift_task_dates(client, project):
    """全タスクの日程が指定日数だけシフトされることを確認する。"""
    pid = project["id"]
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-10",
        "task_type": "task", "progress": 0.0, "dependency_ids": [],
    })
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T2", "start_date": "2026-04-11", "end_date": "2026-04-20",
        "task_type": "task", "progress": 0.0, "dependency_ids": [],
    })

    res = client.post(f"/api/v1/projects/{pid}/tasks/shift_dates", json={"days": 7})
    assert res.status_code == 200
    data = res.json()
    assert data["shifted"] == 2
    assert data["days"] == 7

    tasks = client.get(f"/api/v1/projects/{pid}/tasks").json()
    by_name = {t["name"]: t for t in tasks}
    assert by_name["T1"]["start_date"] == "2026-04-08"
    assert by_name["T1"]["end_date"]   == "2026-04-17"


def test_shift_task_dates_negative(client, project):
    """負の日数（前倒し）シフトも正しく動作することを確認する。"""
    pid = project["id"]
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T1", "start_date": "2026-04-10", "end_date": "2026-04-20",
        "task_type": "task", "progress": 0.0, "dependency_ids": [],
    })
    res = client.post(f"/api/v1/projects/{pid}/tasks/shift_dates", json={"days": -3})
    assert res.status_code == 200
    tasks = client.get(f"/api/v1/projects/{pid}/tasks").json()
    assert tasks[0]["start_date"] == "2026-04-07"
    assert tasks[0]["end_date"]   == "2026-04-17"


# ── Comment tests ──────────────────────────────────────────────────────────

@pytest.fixture
def task(client, project):
    pid = project["id"]
    r = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"name": "Task A", "start_date": "2026-06-01", "end_date": "2026-06-05"},
    )
    return r.json()


def test_list_comments_empty(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.get(f"/api/v1/projects/{pid}/tasks/{tid}/comments")
    assert res.status_code == 200
    assert res.json() == []


def test_create_and_list_comment(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "Hello comment"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["text"] == "Hello comment"
    assert data["task_id"] == tid

    lst = client.get(f"/api/v1/projects/{pid}/tasks/{tid}/comments").json()
    assert len(lst) == 1
    assert lst[0]["id"] == data["id"]


def test_delete_comment(client, project, task):
    pid, tid = project["id"], task["id"]
    cid = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "to delete"},
    ).json()["id"]

    res = client.delete(f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}")
    assert res.status_code == 204

    lst = client.get(f"/api/v1/projects/{pid}/tasks/{tid}/comments").json()
    assert lst == []


def test_delete_comment_not_found(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.delete(f"/api/v1/projects/{pid}/tasks/{tid}/comments/99999")
    assert res.status_code == 404


def test_create_comment_blank_text(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "   "},
    )
    assert res.status_code == 422


def test_create_todo_comment(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "Fix the bug", "is_todo": True},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["is_todo"] is True
    assert data["is_done"] is False


def test_update_comment_toggle_is_done(client, project, task):
    pid, tid = project["id"], task["id"]
    cid = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "ToDo item", "is_todo": True},
    ).json()["id"]

    res = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"is_done": True},
    )
    assert res.status_code == 200
    assert res.json()["is_done"] is True

    res2 = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"is_done": False},
    )
    assert res2.status_code == 200
    assert res2.json()["is_done"] is False


def test_update_comment_text(client, project, task):
    pid, tid = project["id"], task["id"]
    cid = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "original"},
    ).json()["id"]

    res = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"text": "updated text"},
    )
    assert res.status_code == 200
    assert res.json()["text"] == "updated text"


def test_update_comment_blank_text_fails(client, project, task):
    pid, tid = project["id"], task["id"]
    cid = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "original"},
    ).json()["id"]

    res = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"text": "   "},
    )
    assert res.status_code == 400


def test_update_comment_not_found(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/99999",
        json={"is_done": True},
    )
    assert res.status_code == 404


def test_update_comment_toggle_is_todo(client, project, task):
    pid, tid = project["id"], task["id"]
    cid = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "Need todo", "is_todo": False},
    ).json()["id"]

    res = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"is_todo": True},
    )
    assert res.status_code == 200
    assert res.json()["is_todo"] is True

    res2 = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"is_todo": False},
    )
    assert res2.status_code == 200
    assert res2.json()["is_todo"] is False


def test_update_comment_is_todo_false_resets_is_done(client, project, task):
    """is_todo を False にすると is_done も False にリセットされる。"""
    pid, tid = project["id"], task["id"]
    cid = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "done item", "is_todo": True},
    ).json()["id"]
    client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"is_done": True},
    )
    res = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"is_todo": False},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["is_todo"] is False
    assert body["is_done"] is False
