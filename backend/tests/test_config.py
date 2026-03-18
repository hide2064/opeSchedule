def test_get_config_creates_default(client):
    res = client.get("/api/v1/config")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == 1
    assert data["theme"] == "light"
    assert data["default_view_mode"] == "Week"
    assert data["timezone"] == "Asia/Tokyo"


def test_update_config(client):
    res = client.patch("/api/v1/config", json={"theme": "dark", "default_view_mode": "Month"})
    assert res.status_code == 200
    data = res.json()
    assert data["theme"] == "dark"
    assert data["default_view_mode"] == "Month"


def test_update_config_invalid_theme(client):
    res = client.patch("/api/v1/config", json={"theme": "purple"})
    assert res.status_code == 422


def test_update_config_invalid_view_mode(client):
    res = client.patch("/api/v1/config", json={"default_view_mode": "Yearly"})
    assert res.status_code == 422


def test_update_config_holidays(client):
    res = client.patch(
        "/api/v1/config",
        json={"holiday_dates": ["2026-01-01", "2026-12-25"]},
    )
    assert res.status_code == 200
