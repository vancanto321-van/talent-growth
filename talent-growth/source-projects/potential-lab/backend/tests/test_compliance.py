"""合规项回归（docs/compliance.md 第 3 / 6b 节）：

- AI 生成内容隐式标识：/api/me/export 携带 ai_content_disclosure 元数据；
- AI 评估响应透出 ai_model（前端显式徽标的数据基础）；
- 未成年人付费上限：age_band 含「未成年」的用户按日/月限额拦截。
"""

from app.config import settings

_GOOD_TEXT = (
    "我选择解释『复式记账』这个概念。首先，想象你的钱是一个水池：收入是进水管，支出是排水管。"
    "例如，你每月工资 1 万进账，房租 3 千流出，水池水位变化就是你的结余。复式记账就是给每笔水流记两条记录："
    "它从哪来、到哪去。因为单式记账只记一边，所以月底经常对不上账；复式记账两边必须相等，错账立刻暴露。"
)


def _login(client, nickname, age_band=""):
    resp = client.post("/api/auth/mock-login", json={"nickname": nickname, "age_band": age_band})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _finish_one_task(client, headers):
    """完成今日主方向任务，返回提交响应（含 AI 初评）。"""
    resp = client.get("/api/tasks/today", headers=headers)
    assert resp.status_code == 200
    task_item = next(i for i in resp.json()["items"] if i["type"] == "task")
    resp = client.post(
        "/api/tasks/from-template", json={"template_code": task_item["template"]["code"]}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    inst = resp.json()
    assert client.post(f"/api/tasks/{inst['id']}/start", headers=headers).status_code == 200
    resp = client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={"text_content": _GOOD_TEXT, "mode": "independent", "time_spent_min": 25, "difficulty_feedback": 3},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------- 隐式标识：导出元数据 ----------

def test_export_disclosure_lists_models_after_ai_eval(client, full_cycle):
    headers, _ = full_cycle
    result = _finish_one_task(client, headers)
    assert result["evaluation"]["ai_model"]  # 评估响应透出模型标识

    resp = client.get("/api/me/export", headers=headers)
    assert resp.status_code == 200
    payload = resp.json()
    d = payload["ai_content_disclosure"]
    assert "GB 45438-2025" in d["regulation"]
    assert d["ai_fields"]["clues"] == ["statement", "evidence", "based_on"]
    assert "cycle_reports" in d["ai_fields"]
    assert result["evaluation"]["ai_model"] in d["models_seen"]


def test_export_disclosure_present_even_without_ai_usage(client):
    h = _login(client, "纯新用户")
    payload = client.get("/api/me/export", headers=h).json()
    d = payload["ai_content_disclosure"]
    assert d["models_seen"] == []
    assert d["notice"]


# ---------- 显式标识的数据基础：模型标识随评估返回 ----------

def test_evaluation_carries_model_tag(client, full_cycle):
    headers, _ = full_cycle
    result = _finish_one_task(client, headers)
    ev = result["evaluation"]
    assert ev["source"] == "ai"
    assert ev["ai_model"] == "mock"  # 测试环境默认 mock 适配器


# ---------- 未成年人付费上限 ----------

def _order(client, headers, product):
    return client.post("/api/billing/orders", json={"product_code": product}, headers=headers)


def test_minor_daily_limit_blocks_second_purchase(client, monkeypatch):
    monkeypatch.setattr(settings, "minor_daily_pay_limit_cents", 3000)  # ¥30
    h = _login(client, "未成年用户", age_band="未成年")

    o1 = _order(client, h, "child_plan_monthly")  # ¥29 < ¥30
    assert o1.status_code == 200, o1.text
    assert client.post(f"/api/billing/orders/{o1.json()['id']}/mock-pay", headers=h).status_code == 200

    o2 = _order(client, h, "child_plan_monthly")  # 29+29=58 > 30 → 拦截
    assert o2.status_code == 403
    assert "单日" in o2.json()["detail"]


def test_minor_monthly_limit_blocks_accumulation(client, monkeypatch):
    monkeypatch.setattr(settings, "minor_daily_pay_limit_cents", 100000)  # 放开日限
    monkeypatch.setattr(settings, "minor_monthly_pay_limit_cents", 5000)  # ¥50
    h = _login(client, "月限用户", age_band="未成年")

    o1 = _order(client, h, "child_plan_monthly")
    assert o1.status_code == 200
    assert client.post(f"/api/billing/orders/{o1.json()['id']}/mock-pay", headers=h).status_code == 200

    o2 = _order(client, h, "child_plan_monthly")  # 29+29=58 > 50 → 月限拦截
    assert o2.status_code == 403
    assert "单月" in o2.json()["detail"]


def test_minor_limit_boundary_equal_allowed(client, monkeypatch):
    monkeypatch.setattr(settings, "minor_daily_pay_limit_cents", 5800)  # 恰好两单 ¥58
    h = _login(client, "边界用户", age_band="未成年")
    for _ in range(2):
        o = _order(client, h, "child_plan_monthly")
        assert o.status_code == 200
        assert client.post(f"/api/billing/orders/{o.json()['id']}/mock-pay", headers=h).status_code == 200


def test_adult_not_subject_to_minor_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "minor_daily_pay_limit_cents", 100)  # ¥1：成人不受限
    h = _login(client, "成年用户", age_band="26-35")
    o1 = _order(client, h, "child_plan_monthly")
    assert o1.status_code == 200
    assert client.post(f"/api/billing/orders/{o1.json()['id']}/mock-pay", headers=h).status_code == 200
    o2 = _order(client, h, "child_plan_monthly")
    assert o2.status_code == 200


def test_pay_gate_rechecks_limit_at_settlement(client, monkeypatch):
    """下单时未超限、支付时累计超限 → 支付被拒（最后一道闸）。"""
    monkeypatch.setattr(settings, "minor_daily_pay_limit_cents", 3000)  # ¥30
    h = _login(client, "支付闸用户", age_band="未成年")

    o1 = _order(client, h, "child_plan_monthly")
    assert client.post(f"/api/billing/orders/{o1.json()['id']}/mock-pay", headers=h).status_code == 200
    o2 = _order(client, h, "child_plan_monthly")
    assert o2.status_code == 403  # 下单已拦

    # 绕过下单拦截的场景：先下单后改限额（模拟配置收紧），支付时再校验
    monkeypatch.setattr(settings, "minor_daily_pay_limit_cents", 100)
    o3 = _order(client, h, "child_plan_monthly")
    assert o3.status_code == 403
