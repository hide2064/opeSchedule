"""snapshots / changelog エンドポイントのテスト。

対象:
  GET  /api/v1/projects/{id}/snapshots
  POST /api/v1/projects/{id}/snapshots
  GET  /api/v1/projects/{id}/snapshots/{snap_id}
  GET  /api/v1/projects/{id}/changelog
"""
import json

import pytest


# ── フィクスチャ ─────────────────────────────────────────────────────────────


def _create_project(client, name="テストPJ"):
    res = client.post(
        "/api/v1/projects",
        json={"name": name, "color": "#4A90D9", "project_status": "作業中"},
    )
    assert res.status_code == 201
    return res.json()


def _create_task(client, project_id, name="タスクA", start="2026-04-01", end="2026-04-10"):
    res = client.post(
        f"/api/v1/projects/{project_id}/tasks",
        json={
            "name": name,
            "start_date": start,
            "end_date": end,
            "task_type": "task",
            "sort_order": 0,
            "dependency_ids": [],
        },
    )
    assert res.status_code == 201
    return res.json()


# ── スナップショット一覧 ───────────────────────────────────────────────────────


def test_list_snapshots_empty(client):
    """スナップショットが 0件の場合に空リストを返すこと。"""
    proj = _create_project(client)
    res = client.get(f"/api/v1/projects/{proj['id']}/snapshots")
    assert res.status_code == 200
    assert res.json() == []


def test_list_snapshots_not_found(client):
    """存在しないプロジェクトへのアクセスで 404 を返すこと。"""
    res = client.get("/api/v1/projects/9999/snapshots")
    assert res.status_code == 404


# ── バージョンUP（スナップショット作成）─────────────────────────────────────────


def test_create_snapshot(client):
    """バージョンUP でスナップショットが作成され、version_number が 1 から始まること。"""
    proj = _create_project(client)
    _create_task(client, proj["id"])

    res = client.post(
        f"/api/v1/projects/{proj['id']}/snapshots",
        json={"label": "初回リリース"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["version_number"] == 1
    assert data["label"] == "初回リリース"
    assert data["task_count"] == 1


def test_create_snapshot_increments_version(client):
    """連続してバージョンUP すると version_number がインクリメントされること。"""
    proj = _create_project(client)
    _create_task(client, proj["id"])

    client.post(f"/api/v1/projects/{proj['id']}/snapshots", json={"label": "v1"})
    _create_task(client, proj["id"], name="タスクB", start="2026-05-01", end="2026-05-10")
    res2 = client.post(
        f"/api/v1/projects/{proj['id']}/snapshots", json={"label": "v2"}
    )
    assert res2.status_code == 201
    assert res2.json()["version_number"] == 2
    assert res2.json()["task_count"] == 2


def test_create_snapshot_empty_label_uses_default(client):
    """空のラベルを送信した場合、デフォルトラベルが適用されること。"""
    proj = _create_project(client)
    res = client.post(
        f"/api/v1/projects/{proj['id']}/snapshots",
        json={"label": ""},
    )
    assert res.status_code == 201
    assert res.json()["label"] == "バージョンUP"


def test_create_snapshot_not_found(client):
    """存在しないプロジェクトへのバージョンUP で 404 を返すこと。"""
    res = client.post(
        "/api/v1/projects/9999/snapshots",
        json={"label": "test"},
    )
    assert res.status_code == 404


def test_list_snapshots_newest_first(client):
    """スナップショット一覧は新しい順（version_number 降順）で返ること。"""
    proj = _create_project(client)
    _create_task(client, proj["id"])

    client.post(f"/api/v1/projects/{proj['id']}/snapshots", json={"label": "v1"})
    client.post(f"/api/v1/projects/{proj['id']}/snapshots", json={"label": "v2"})
    client.post(f"/api/v1/projects/{proj['id']}/snapshots", json={"label": "v3"})

    res = client.get(f"/api/v1/projects/{proj['id']}/snapshots")
    assert res.status_code == 200
    versions = [s["version_number"] for s in res.json()]
    assert versions == [3, 2, 1]


# ── スナップショット詳細 ───────────────────────────────────────────────────────


def test_get_snapshot_detail(client):
    """スナップショット詳細に tasks_json が含まれること。"""
    proj = _create_project(client)
    _create_task(client, proj["id"], name="詳細タスク")

    snap = client.post(
        f"/api/v1/projects/{proj['id']}/snapshots", json={"label": "detail test"}
    ).json()

    res = client.get(f"/api/v1/projects/{proj['id']}/snapshots/{snap['id']}")
    assert res.status_code == 200
    data = res.json()
    assert "tasks_json" in data
    tasks = json.loads(data["tasks_json"])
    assert len(tasks) == 1
    assert tasks[0]["name"] == "詳細タスク"


def test_get_snapshot_wrong_project(client):
    """別プロジェクトのスナップショット ID を指定すると 404 を返すこと。"""
    proj1 = _create_project(client, "PJ1")
    proj2 = _create_project(client, "PJ2")
    _create_task(client, proj1["id"])

    snap = client.post(
        f"/api/v1/projects/{proj1['id']}/snapshots", json={"label": "v1"}
    ).json()

    res = client.get(f"/api/v1/projects/{proj2['id']}/snapshots/{snap['id']}")
    assert res.status_code == 404


def test_get_snapshot_not_found(client):
    """存在しないスナップショット ID で 404 を返すこと。"""
    proj = _create_project(client)
    res = client.get(f"/api/v1/projects/{proj['id']}/snapshots/9999")
    assert res.status_code == 404


# ── 変更ログ ─────────────────────────────────────────────────────────────────


def test_changelog_empty(client):
    """タスク操作前は変更ログが空であること。"""
    proj = _create_project(client)
    res = client.get(f"/api/v1/projects/{proj['id']}/changelog")
    assert res.status_code == 200
    assert res.json() == []


def test_changelog_records_task_operations(client):
    """タスク作成・更新・削除が変更ログに記録されること。"""
    proj = _create_project(client)
    task = _create_task(client, proj["id"])

    client.patch(
        f"/api/v1/projects/{proj['id']}/tasks/{task['id']}",
        json={"name": "更新後タスク"},
    )
    client.delete(f"/api/v1/projects/{proj['id']}/tasks/{task['id']}")

    res = client.get(f"/api/v1/projects/{proj['id']}/changelog")
    assert res.status_code == 200
    logs = res.json()
    operations = [l["operation"] for l in logs]
    assert "タスク追加" in operations
    assert "タスク更新" in operations
    assert "タスク削除" in operations


def test_changelog_after_version_up_is_empty(client):
    """バージョンUP 後の変更ログは空になること（未コミット変更がリセットされる）。"""
    proj = _create_project(client)
    _create_task(client, proj["id"])

    # バージョンUP 前は変更あり
    res_before = client.get(f"/api/v1/projects/{proj['id']}/changelog")
    assert len(res_before.json()) > 0

    # バージョンUP
    client.post(f"/api/v1/projects/{proj['id']}/snapshots", json={"label": "v1"})

    # バージョンUP 後は変更なし
    res_after = client.get(f"/api/v1/projects/{proj['id']}/changelog")
    assert res_after.json() == []


def test_changelog_only_shows_since_last_snapshot(client):
    """changelog はスナップショット以降の変更のみ返すこと。"""
    proj = _create_project(client)
    task1 = _create_task(client, proj["id"], name="タスク1")

    # バージョンUP でタスク1を確定
    client.post(f"/api/v1/projects/{proj['id']}/snapshots", json={"label": "v1"})

    # バージョンUP 後に新しいタスクを追加
    _create_task(client, proj["id"], name="タスク2", start="2026-05-01", end="2026-05-10")

    res = client.get(f"/api/v1/projects/{proj['id']}/changelog")
    logs = res.json()
    # タスク1の追加ログはスナップショット前なので含まれない
    task_names = [l["task_name"] for l in logs if l["task_name"]]
    assert "タスク2" in task_names
    assert "タスク1" not in task_names


def test_changelog_not_found(client):
    """存在しないプロジェクトへのアクセスで 404 を返すこと。"""
    res = client.get("/api/v1/projects/9999/changelog")
    assert res.status_code == 404


def test_changelog_dates_change_recorded(client):
    """日程変更（D&D）が変更ログに operation='日程変更' で記録されること。"""
    proj = _create_project(client)
    task = _create_task(client, proj["id"])

    client.patch(
        f"/api/v1/projects/{proj['id']}/tasks/{task['id']}/dates",
        json={"start_date": "2026-04-05", "end_date": "2026-04-15"},
    )

    res = client.get(f"/api/v1/projects/{proj['id']}/changelog")
    logs = res.json()
    date_logs = [l for l in logs if l["operation"] == "日程変更"]
    assert len(date_logs) == 1
    assert date_logs[0]["detail"] == "2026-04-05〜2026-04-15"
