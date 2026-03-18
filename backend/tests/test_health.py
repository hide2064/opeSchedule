def test_health_ok(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["db"] == "ok"
    assert "timestamp" in data
    assert data["version"] == "0.1.0"
