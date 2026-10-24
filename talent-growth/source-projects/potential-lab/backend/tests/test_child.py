"""儿童版：类型判定、态度分、付费门控（锁定→购买→解锁）、月度订阅。"""

from app.content_loader import child_assessment as load_assessment


def _answers(form: str, by_trait: dict[str, int]) -> dict[str, int]:
    """按维度统一给同一档分，便于精确控制得分。"""
    out = {}
    for it in load_assessment()["items"][form]:
        out[it["code"]] = by_trait.get(it["trait"], 3)
    return out


def test_questions_parent_and_self(client, auth_headers):
    resp = client.get("/api/child/questions?form=parent", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 48
    assert len(data["items"]) == 48
    assert "自编" in data["declaration"]
    resp2 = client.get("/api/child/questions?form=self", headers=auth_headers)
    assert resp2.status_code == 200


def test_type_assignment_and_locked_result(client, auth_headers):
    # 把"身体动觉"拉满、其余压低：类型应为 身体小健将(bodily)
    answers = _answers("parent", {"bodily": 5, "grit": 2, "mindset": 2})
    resp = client.post(
        "/api/child/submit",
        json={"form": "parent", "child_age_band": "3-6", "child_nickname": "小宝", "parent_confirmed": True, "answers": answers},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    result = resp.json()
    # 未付费 → 锁定，只给预告
    assert result["locked"] is True
    assert result["teaser"]["type_name"] == "身体小健将"
    assert result["mi_scores"] == []
    assert result["type_content"] is None
    assert result["price_cents"] == 500

    # 拉取详情同样锁定
    resp = client.get(f"/api/child/result/{result['id']}", headers=auth_headers)
    assert resp.json()["locked"] is True


def test_purchase_unlocks_report_and_plan_gated(client, auth_headers):
    answers = _answers("parent", {"linguistic": 5, "grit": 2, "mindset": 2})
    result = client.post(
        "/api/child/submit",
        json={"form": "parent", "parent_confirmed": True, "answers": answers},
        headers=auth_headers,
    ).json()

    # 查报价
    pricing = client.get("/api/billing/pricing", headers=auth_headers).json()
    codes = {p["code"]: p for p in pricing}
    assert codes["child_assessment"]["price_cents"] == 500
    assert "/月" in codes["child_plan_monthly"]["price_label"]

    # 下单 + 模拟支付 → 报告解锁（scope=本份结果）
    order = client.post("/api/billing/orders", json={"product_code": "child_assessment", "scope_id": result["id"]}, headers=auth_headers).json()
    assert order["status"] == "created"
    paid = client.post(f"/api/billing/orders/{order['id']}/mock-pay", headers=auth_headers).json()
    assert paid["status"] == "paid"

    me = client.get("/api/billing/me", headers=auth_headers).json()
    assert me["child_assessment_unlocked"] is True  # 存在有效按次订单
    assert me["subscription_active_until"] is None

    detail = client.get(f"/api/child/result/{result['id']}", headers=auth_headers).json()
    assert detail["locked"] is False
    assert len(detail["mi_scores"]) == 8
    assert detail["mi_scores"][0]["code"] == "linguistic"
    assert detail["type_content"]["type_name"] == "语言小达人"
    assert len(detail["type_content"]["weekly_plan"]) == 4
    # 态度分低于 60 → 有专项建议
    assert detail["grit_score"] == 40
    assert any(a["key"] == "grit" for a in detail["attitude_advice"])
    # 报告解锁 ≠ 培养方案解锁
    assert detail["plan_locked"] is True

    # 培养方案未订阅 → 只给第一周预告
    plan = client.get("/api/child/plan?trait=linguistic", headers=auth_headers).json()
    assert plan["locked"] is True
    assert len(plan["weekly_plan"]) == 1
    assert plan["weekly_plan"][0].get("preview") is True

    # 订阅月度方案 → 全量解锁
    sub = client.post("/api/billing/orders", json={"product_code": "child_plan_monthly"}, headers=auth_headers).json()
    client.post(f"/api/billing/orders/{sub['id']}/mock-pay", headers=auth_headers)
    me = client.get("/api/billing/me", headers=auth_headers).json()
    assert me["subscription_active_until"]
    plan = client.get("/api/child/plan?trait=linguistic", headers=auth_headers).json()
    assert plan["locked"] is False
    assert len(plan["weekly_plan"]) == 4
    assert plan["principles"] and plan["pitfalls"] and plan["resources"]


def test_incomplete_and_invalid_rejected(client, auth_headers):
    # 未答完（业务层 400）
    resp = client.post(
        "/api/child/submit",
        json={"form": "parent", "answers": {"pl1": 4}},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    # 非法版本（请求校验层 422）
    resp = client.post(
        "/api/child/submit",
        json={"form": "alien", "answers": {}},
        headers=auth_headers,
    )
    assert resp.status_code in (400, 422)


def test_neutral_answers_no_advice(client, auth_headers):
    answers = _answers("self", {})
    result = client.post(
        "/api/child/submit",
        json={"form": "self", "answers": answers},
        headers=auth_headers,
    ).json()
    order = client.post("/api/billing/orders", json={"product_code": "child_assessment", "scope_id": result["id"]}, headers=auth_headers).json()
    client.post(f"/api/billing/orders/{order['id']}/mock-pay", headers=auth_headers)
    detail = client.get(f"/api/child/result/{result['id']}", headers=auth_headers).json()
    assert detail["grit_score"] == 60
    assert detail["attitude_advice"] == []
    # 全中性作答时类型按维度顺序取先（linguistic）
    assert detail["teaser"]["type_name"] == "语言小达人"
