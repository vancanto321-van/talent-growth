"""审计修复回归：XP 重放防护、重测重排、结业放弃、mock 认证开关。"""

from tests.test_flow import _do_one_task


def test_checkin_idempotent(client, full_cycle):
    headers, _ = full_cycle
    plan = client.get("/api/plans/current", headers=headers).json()
    idx = next(i for i, it in enumerate(plan["items"]) if it["kind"] == "reflect")
    body = {"plan_id": plan["id"], "item_index": idx, "minutes": 5, "feeling": ""}
    first = client.post("/api/plans/checkin", json=body, headers=headers)
    assert first.status_code == 200
    xp1 = first.json()["reward"]["total_xp"]
    second = client.post("/api/plans/checkin", json=body, headers=headers)
    assert second.status_code == 400  # 已打卡项拒绝重复
    me = client.get("/api/gamification/me", headers=headers).json()
    assert me["xp"] == xp1  # XP 不再重复发放


def test_self_review_and_reader_feedback_once_only(client, full_cycle):
    headers, _ = full_cycle
    inst_id, _ = _do_one_task(client, headers, "exp_intro_explain")
    body = {"investment": 4, "willingness": 4, "feeling": "ok"}
    assert client.post(f"/api/tasks/{inst_id}/self-review", json=body, headers=headers).status_code == 200
    again = client.post(f"/api/tasks/{inst_id}/self-review", json=body, headers=headers)
    assert again.status_code == 400

    fb = {"rating": 4, "comment": "不错"}
    assert client.post(f"/api/tasks/{inst_id}/reader-feedback", json=fb, headers=headers).status_code == 200
    again = client.post(f"/api/tasks/{inst_id}/reader-feedback", json=fb, headers=headers)
    assert again.status_code == 400

    me = client.get("/api/gamification/me", headers=headers).json()
    unlocked = {a["code"] for a in me["achievements"] if a["unlocked"]}
    assert {"self_aware", "feedback_first"} <= unlocked


def test_retention_rescheduled_after_advanced(client, full_cycle):
    """入门→重测(快进)→完成重测→完成进阶：应再排一次新重测。"""
    from datetime import datetime, timedelta

    from app.database import get_db
    from app.models import TaskInstance

    headers, _ = full_cycle
    # 完成入门任务（会安排第一次重测）
    _do_one_task(client, headers, "exp_intro_explain")
    db = next(client.app.dependency_overrides[get_db]())
    try:
        rows = db.query(TaskInstance).filter(TaskInstance.is_retention.is_(True)).all()
        assert len(rows) == 1
        rows[0].scheduled_for = datetime.utcnow() - timedelta(days=1)
        db.commit()
        retention_id = rows[0].id
    finally:
        db.close()

    # 到期重测：提交（应得到 AI 评估且为保留性奖励）
    resp = client.post(
        f"/api/tasks/{retention_id}/submit",
        json={
            "text_content": "障碍一：老人看不见小字，因此要放大字号并语音播报；障碍二：流程步骤多，所以合并成一步扫码直达；障碍三：怕点错不敢按，于是加大按钮并允许无限次返回。三个障碍分别对应视觉、认知、心理，干预后老人完成率应明显提升。",
            "mode": "independent",
            "time_spent_min": 30,
            "difficulty_feedback": 3,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["reward"]["xp_awarded"] == 30  # 保持性重测加成

    # 完成进阶任务后，应再排一次新的重测（旧重测已 evaluated 不再阻挡）
    resp = client.post("/api/tasks/from-template", json={"template_code": "exp_adv_rewrite"}, headers=headers)
    inst = resp.json()
    client.post(f"/api/tasks/{inst['id']}/start", headers=headers)
    resp = client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={
            "text_content": "反馈一：新手总在第三步卡住，因为术语『镜像』没解释，我改成了『一模一样的副本』并加了截图。反馈二：有读者说找不到入口，所以我把入口从底部移到了开头加粗。反馈三：老读者嫌啰嗦，所以我把两段合并成了一张对照表。每次修改都先问自己：这条反馈指向的是理解问题还是操作问题。",
            "mode": "independent",
            "time_spent_min": 30,
            "difficulty_feedback": 3,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    db = next(client.app.dependency_overrides[get_db]())
    try:
        in_flight = (
            db.query(TaskInstance)
            .filter(TaskInstance.is_retention.is_(True), TaskInstance.status.in_(["assigned", "in_progress"]))
            .count()
        )
        assert in_flight == 1, "进阶评估后应再排一次在途重测"
    finally:
        db.close()


def test_abandon_cycle(client, full_cycle):
    headers, cycle = full_cycle
    resp = client.post("/api/cycles/abandon", headers=headers)
    assert resp.status_code == 200
    assert client.get("/api/cycles/current", headers=headers).json() is None
    # 放弃的周期线索被归档，不可直接复用（重新访谈产生新线索）
    resp = client.post("/api/cycles/start", json={"clue_ids": cycle["clue_ids"][:1]}, headers=headers)
    assert resp.status_code == 404
    # 重新访谈后可再开周期
    answers = [
        {"code": "q_learn_fast", "text": "我给同事解释业务特别顺，讲得比文档清楚。"},
        {"code": "q_asked_for_help", "text": "同事常找我分析报表、排查问题。"},
        {"code": "q_repeat_willingly", "text": "我愿意反复折腾脚本自动化。"},
        {"code": "q_lose_track", "text": "写 python 会忘记时间。"},
        {"code": "q_untried", "text": "想学设计。"},
        {"code": "q_time_budget", "text": "每周 5 小时。"},
    ]
    clues = client.post("/api/explore/finish", json={"answers": answers}, headers=headers).json()
    resp = client.post("/api/cycles/start", json={"clue_ids": [c["id"] for c in clues[:1]]}, headers=headers)
    assert resp.status_code == 200


def test_mock_auth_kill_switch(client, auth_headers, monkeypatch):
    """ALLOW_MOCK_AUTH=false：明文 u<id> 令牌与 mock-login 接口关闭；
    签名会话不受影响（不可伪造，正式微信用户依赖它）。"""
    from app.config import settings
    from app.services.session import issue_session_token
    from app.models import User
    from app.database import get_db

    monkeypatch.setattr(settings, "allow_mock_auth", False)

    # 1) 明文 u<id> 令牌被拒（开发期遗留格式）
    resp = client.get("/api/gamification/me", headers={"Authorization": "Bearer u1"})
    assert resp.status_code == 401
    # 2) mock-login 接口被拒
    resp = client.post("/api/auth/mock-login", json={"nickname": "x"})
    assert resp.status_code == 403
    # 3) 签名会话仍有效（正式通道，不可伪造）
    db = next(client.app.dependency_overrides[get_db]())
    try:
        user = db.query(User).filter(User.id == 1).first()
    finally:
        db.close()
    signed, _ = issue_session_token(user.id, settings.secret_key)
    resp = client.get(
        "/api/gamification/me",
        headers={"Authorization": f"Bearer {signed}"},
    )
    assert resp.status_code == 200


def test_session_lifecycle(client):
    """签名会话：签发→可用；伪造/篡改→拒绝；登出→撤销。"""
    import base64
    import json as jsonlib

    from app.config import settings

    resp = client.post("/api/auth/mock-login", json={"nickname": "会话用户"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    assert "." in token  # 签名格式
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/gamification/me", headers=headers).status_code == 200

    # 伪造签名被拒
    forged = token[:-4] + "beef"
    assert client.get(
        "/api/gamification/me", headers={"Authorization": f"Bearer {forged}"}
    ).status_code == 401

    # 篡改 payload（把自己变成 user 999）被拒：签名不再匹配
    p64, sig = token.rsplit(".", 1)
    padded = p64 + "=" * (-len(p64) % 4)
    payload = jsonlib.loads(base64.urlsafe_b64decode(padded))
    payload["uid"] = 999
    forged_p64 = base64.urlsafe_b64encode(
        jsonlib.dumps(payload, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    assert (
        client.get(
            "/api/gamification/me",
            headers={"Authorization": f"Bearer {forged_p64}.{sig}"},
        ).status_code
        == 401
    )

    # 登出撤销后再用被拒
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    resp = client.get("/api/gamification/me", headers=headers)
    assert resp.status_code == 401
    assert "撤销" in resp.json()["detail"]
