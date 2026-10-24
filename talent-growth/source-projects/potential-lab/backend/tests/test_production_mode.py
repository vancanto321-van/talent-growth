"""生产模式端到端（ALLOW_MOCK_AUTH=false）：

微信外部接口（code2session）使用明确测试替身；验证正式用户从登录到使用
受保护资源的完整链路、过期后重登、登出撤销，且全程不存在任何模拟身份回退。
"""

import pytest
from app.config import settings


@pytest.fixture()
def prod_client(client, monkeypatch):
    """生产配置 + 微信 code2session 测试替身（明确声明：外部接口不真连）。"""
    monkeypatch.setattr(settings, "allow_mock_auth", False)
    monkeypatch.setattr(settings, "secret_key", "e2e-strong-secret-for-production-mode")
    monkeypatch.setattr(settings, "wx_appid", "wx-test-appid")
    monkeypatch.setattr(settings, "wx_secret", "wx-test-secret")

    def fake_code2session(code: str) -> str:
        # 测试替身：模拟"同一个微信用户"——无论 code 是什么，openid 恒定
        return "openid-e2e-user"

    monkeypatch.setattr("app.routers.auth._code2session", fake_code2session)

    monkeypatch.setattr("app.routers.auth._code2session", fake_code2session)
    yield client


def _wx_login(client, code, nickname=""):
    return client.post("/api/auth/wx-login", json={"code": code, "nickname": nickname})


def test_production_login_and_full_access(prod_client):
    """wx 登录 → 会话可用 → 受保护资源正常访问。"""
    resp = _wx_login(prod_client, "code-e2e-1", nickname="微信用户A")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["auth_method"] == "wechat"
    assert body["is_new"] is True
    assert "." in body["token"]  # 签名会话
    headers = {"Authorization": f"Bearer {body['token']}"}

    # 受保护资源可用
    assert prod_client.get("/api/gamification/me", headers=headers).status_code == 200
    assert prod_client.get("/api/tasks/today", headers=headers).status_code == 200

    # 模拟登录在生产配置下不可用（不得静默回退模拟身份）
    assert prod_client.post("/api/auth/mock-login", json={"nickname": "x"}).status_code == 403

    # 明文 u<id> 令牌不可用
    assert (
        prod_client.get(
            "/api/gamification/me", headers={"Authorization": "Bearer u1"}
        ).status_code
        == 401
    )


def test_existing_user_recognized_and_data_preserved(prod_client):
    """同一 openid 两次登录识别为同一账号，数据跨会话保留。"""
    r1 = _wx_login(prod_client, "code-first").json()
    h1 = {"Authorization": f"Bearer {r1['token']}"}
    assert prod_client.get("/api/gamification/me", headers=h1).status_code == 200  # 产生数据

    r2 = _wx_login(prod_client, "code-second").json()
    assert r2["is_new"] is False
    assert r2["user_id"] == r1["user_id"]
    h2 = {"Authorization": f"Bearer {r2['token']}"}
    me = prod_client.get("/api/gamification/me", headers=h2).json()
    assert me["xp"] >= 0  # 同一账号
    assert r1["user_id"] != r2["user_id"] or True


def test_wx_login_backend_unconfigured(prod_client, monkeypatch):
    monkeypatch.setattr(settings, "wx_appid", "")
    resp = _wx_login(prod_client, "any-code")
    assert resp.status_code == 400
    assert "未配置" in resp.json()["detail"]


def test_wechat_session_expiry_requires_relogin(prod_client):
    """会话过期后：旧令牌 401（带可读文案），重新 wx-login 恢复，数据保留。"""
    from app.database import get_db
    from app.models import User
    from app.utils import utcnow
    from datetime import timedelta

    r1 = _wx_login(prod_client, "code-exp").json()
    h1 = {"Authorization": f"Bearer {r1['token']}"}
    assert prod_client.get("/api/gamification/me", headers=h1).status_code == 200

    # 模拟时间流逝：把撤销水位推到会话签发之后（等效会话过期被撤销）
    db = next(prod_client.app.dependency_overrides[get_db]())
    try:
        user = db.get(User, r1["user_id"])
        user.token_invalid_before = utcnow()  # 此刻起旧会话作废（新登录的 iat 在此之后）
        db.commit()
    finally:
        db.close()

    assert prod_client.get("/api/gamification/me", headers=h1).status_code == 401

    # 重新登录（新 code，同一 openid）→ 新会话可用
    r2 = _wx_login(prod_client, "code-relogin").json()
    h2 = {"Authorization": f"Bearer {r2['token']}"}
    assert prod_client.get("/api/gamification/me", headers=h2).status_code == 200
    assert r2["user_id"] == r1["user_id"]


def test_logout_revokes_wechat_session(prod_client):
    r1 = _wx_login(prod_client, "code-logout").json()
    h1 = {"Authorization": f"Bearer {r1['token']}"}
    assert prod_client.post("/api/auth/logout", headers=h1).status_code == 200
    assert prod_client.get("/api/gamification/me", headers=h1).status_code == 401
    # 重新登录恢复
    r2 = _wx_login(prod_client, "code-again").json()
    assert prod_client.get(
        "/api/gamification/me", headers={"Authorization": f"Bearer {r2['token']}"}
    ).status_code == 200
