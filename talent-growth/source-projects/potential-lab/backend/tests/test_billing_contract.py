"""计费状态机合同测试：created→paid→refunded 生命周期 + 非法迁移拒绝 + 多设备一致性。"""

from app.config import settings
from app.services.session import issue_session_token


def _buy(client, headers, product="child_plan_monthly"):
    body = {"product_code": product}
    order = client.post("/api/billing/orders", json=body, headers=headers).json()
    paid = client.post(f"/api/billing/orders/{order['id']}/mock-pay", headers=headers).json()
    assert paid["status"] == "paid"
    return paid


def test_full_lifecycle_pay_then_refund(client):
    resp = client.post("/api/auth/mock-login", json={"nickname": "生命周期"})
    h = {"Authorization": f"Bearer {resp.json()['token']}"}
    order = _buy(client, h)

    refunded = client.post(f"/api/billing/orders/{order['id']}/refund", headers=h).json()
    assert refunded["status"] == "refunded"
    assert refunded["expires_at"] is not None  # 月订阅权益立即失效

    me = client.get("/api/billing/me", headers=h).json()
    assert me["subscription_active_until"] is None

    # 状态机非法迁移拒绝：refunded→refund / refunded→pay
    assert client.post(f"/api/billing/orders/{order['id']}/refund", headers=h).status_code == 400
    assert client.post(f"/api/billing/orders/{order['id']}/mock-pay", headers=h).status_code == 400


def test_cancelled_order_cannot_be_paid(client):
    resp = client.post("/api/auth/mock-login", json={"nickname": "取消用户"})
    h = {"Authorization": f"Bearer {resp.json()['token']}"}
    order = client.post(
        "/api/billing/orders", json={"product_code": "child_plan_monthly"}, headers=h
    ).json()
    assert client.post(f"/api/billing/orders/{order['id']}/cancel", headers=h).status_code == 200
    pay = client.post(f"/api/billing/orders/{order['id']}/mock-pay", headers=h)
    assert pay.status_code == 400
    assert "已取消" in pay.json()["detail"]


def test_logout_revokes_all_devices_and_relogin_restores(client):
    """同一用户两个会话（两台设备）：登出一台，该用户全部会话撤销；重新登录恢复。"""
    from app.services.session import issue_session_token

    # 建号
    uid = client.post("/api/auth/mock-login", json={"nickname": "多设备"}).json()["user_id"]

    # 同一用户两台设备各持一个会话
    tok1, _ = issue_session_token(uid, settings.secret_key)
    tok2, _ = issue_session_token(uid, settings.secret_key)
    h1 = {"Authorization": f"Bearer {tok1}"}
    h2 = {"Authorization": f"Bearer {tok2}"}

    assert client.get("/api/gamification/me", headers=h1).status_code == 200
    assert client.get("/api/gamification/me", headers=h2).status_code == 200

    # 设备 1 登出 → 撤销水位 → 该用户全部会话失效（含设备 2）
    assert client.post("/api/auth/logout", headers=h1).status_code == 200
    assert client.get("/api/gamification/me", headers=h1).status_code == 401
    assert client.get("/api/gamification/me", headers=h2).status_code == 401

    # 重新登录 → 新会话可用
    t3 = client.post("/api/auth/mock-login", json={"nickname": "多设备"}).json()["token"]
    assert (
        client.get(
            "/api/gamification/me", headers={"Authorization": f"Bearer {t3}"}
        ).status_code
        == 200
    )
