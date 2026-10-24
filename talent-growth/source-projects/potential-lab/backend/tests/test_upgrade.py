"""升级与生产守卫：旧库迁移可复现、生产密钥缺失拒绝启动、退出后重登。"""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import run_migrations
from app.main import create_app


def test_old_db_migration_reproducible(tmp_path):
    """用旧版结构建库并放入真实数据行 → 迁移 → 新列存在且数据完好。"""
    db_file = tmp_path / "old_app.db"
    engine = create_engine(f"sqlite:///{db_file}")
    with engine.begin() as conn:
        # 旧版 users（无 token_invalid_before / auth_method）
        conn.exec_driver_sql(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, open_id VARCHAR(128), "
            "nickname VARCHAR(64), age_band VARCHAR(32), created_at DATETIME)"
        )
        conn.exec_driver_sql(
            "INSERT INTO users (id, open_id, nickname) VALUES (1, 'oX-legacy', '老用户')"
        )
        # 旧版 evaluations（无 superseded / ai_model / prompt_version）
        conn.exec_driver_sql(
            "CREATE TABLE evaluations (id INTEGER PRIMARY KEY, task_instance_id INTEGER, "
            "source VARCHAR(16), scores JSON, created_at DATETIME)"
        )
        conn.exec_driver_sql(
            "INSERT INTO evaluations (id, task_instance_id, source) VALUES (1, 1, 'ai')"
        )
        # 旧版 orders（无 scope_id）
        conn.exec_driver_sql(
            "CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, product_code VARCHAR(32), "
            "status VARCHAR(16))"
        )
        conn.exec_driver_sql(
            "INSERT INTO orders (id, user_id, product_code, status) VALUES (1, 1, 'cycle_report', 'paid')"
        )

    # 迁移应幂等可重复执行
    run_migrations(engine)
    run_migrations(engine)

    with engine.connect() as conn:
        users_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(users)")]
        evals_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(evaluations)")]
        orders_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(orders)")]
        assert "token_invalid_before" in users_cols and "auth_method" in users_cols
        assert {"superseded", "ai_model", "prompt_version"} <= set(evals_cols)
        assert "scope_id" in orders_cols
        nickname = conn.exec_driver_sql("SELECT nickname FROM users WHERE id=1").scalar()
        assert nickname == "老用户"
        status = conn.exec_driver_sql("SELECT status FROM orders WHERE id=1").scalar()
        assert status == "paid"


def test_production_without_secret_key_refuses_to_start(monkeypatch):
    """ALLOW_MOCK_AUTH=false 且 SECRET_KEY 为开发默认值 → 明确拒绝启动。"""
    monkeypatch.setattr(settings, "allow_mock_auth", False)
    monkeypatch.setattr(settings, "secret_key", "dev-secret-change-me")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app()


def test_relogin_after_logout(client):
    """登出撤销旧会话后，立即重新登录获得的新会话必须可用。"""
    resp = client.post("/api/auth/mock-login", json={"nickname": "重登用户"})
    old_headers = {"Authorization": f"Bearer {resp.json()['token']}"}
    assert client.post("/api/auth/logout", headers=old_headers).status_code == 200
    assert client.get("/api/gamification/me", headers=old_headers).status_code == 401

    resp = client.post("/api/auth/mock-login", json={"nickname": "重登用户"})
    new_headers = {"Authorization": f"Bearer {resp.json()['token']}"}
    assert client.get("/api/gamification/me", headers=new_headers).status_code == 200


def test_cross_user_order_access(client):
    """订单归属：用户 B 不能支付/取消用户 A 的订单。"""
    a = client.post("/api/auth/mock-login", json={"nickname": "A"}).json()["token"]
    b = client.post("/api/auth/mock-login", json={"nickname": "B"}).json()["token"]
    ha = {"Authorization": f"Bearer {a}"}
    hb = {"Authorization": f"Bearer {b}"}

    order = client.post(
        "/api/billing/orders", json={"product_code": "child_plan_monthly"}, headers=ha
    ).json()
    assert order["status"] == "created"  # 未 scope 的月度商品可正常下单
    assert client.post(f"/api/billing/orders/{order['id']}/mock-pay", headers=hb).status_code == 404
    assert client.post(f"/api/billing/orders/{order['id']}/cancel", headers=hb).status_code == 404
