"""结业报告：生成、判定规则、付费门控、免费层预览、购买解锁、completed 线索开新周期。"""

from app.routers.cycles import _preview_verdicts
from tests.test_flow import _do_one_task


def _finish_week1_task(client, headers):
    resp = client.get("/api/tasks/today", headers=headers)
    task_item = next(i for i in resp.json()["items"] if i["type"] == "task")
    text = (
        "问题一：市场规模口径错误，因为把所有人口当成用户，后果是高估收入。"
        "问题二：转化率无依据，例如没有渠道数据，所以百万收入站不住。"
        "问题三：三个月量产是隐藏假设，因为硬件需要供应链和认证，通常远超三个月，会导致跳票。"
    )
    return _do_one_task(client, headers, task_item["template"]["code"], text=text)


def test_finish_locked_then_unlock(client, full_cycle):
    headers, cycle = full_cycle
    _finish_week1_task(client, headers)

    # 结业
    resp = client.post("/api/cycles/finish", headers=headers)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["cycle_id"] == cycle["id"]
    assert len(report["verdicts"]) == 3
    assert report["locked"] is True  # 未购买 → 锁定
    assert report["verdicts"][0]["reasons"] == []  # 锁定态不给依据
    assert report["price_cents"] == 990

    # 周期结束、线索转为 completed
    assert client.get("/api/cycles/current", headers=headers).json() is None

    # 购买结业报告 → 解锁完整内容（scope=本周期；其他周期不解锁）
    order = client.post("/api/billing/orders", json={"product_code": "cycle_report", "scope_id": cycle["id"]}, headers=headers).json()
    client.post(f"/api/billing/orders/{order['id']}/mock-pay", headers=headers)
    resp = client.get(f"/api/cycles/report/{cycle['id']}", headers=headers)
    report = resp.json()
    assert report["locked"] is False
    # 其他周期未被解锁（scoped 权益）
    other = client.post("/api/explore/finish", json={"answers": [
        {"code": "q_learn_fast", "text": "我讲故事特别顺，能编能讲。"},
        {"code": "q_asked_for_help", "text": "同学常找我帮忙分析问题。"},
        {"code": "q_repeat_willingly", "text": "我愿意反复练习讲同一个故事。"},
        {"code": "q_lose_track", "text": "看书会忘记时间。"},
        {"code": "q_untried", "text": "想学编程。"},
        {"code": "q_time_budget", "text": "每周 5 小时。"},
    ]}, headers=headers).json()
    c2 = client.post("/api/cycles/start", json={"clue_ids": [c["id"] for c in other[:1]]}, headers=headers).json()
    client.post("/api/cycles/finish", headers=headers)
    r2 = client.get(f"/api/cycles/report/{c2['id']}", headers=headers).json()
    assert r2["locked"] is True, "一次购买不得解锁其他周期的报告"
    assert report["verdicts"][0]["reasons"], "解锁后应有判定依据"
    top = report["verdicts"][0]
    assert top["verdict"] in ("继续投入", "继续验证", "冲刺一下", "换法再试", "暂停验证", "还没开始")
    assert report["next"]["suggested_clue_ids"]
    assert "模拟" in report["summary"] or report["summary"] == ""


def test_locked_preview_shows_one_liner_and_quotes(client, full_cycle):
    """报告分层（学 High5）：免费层 = 五维判定结论 + 每方向 1 句解读 + ≤2 条原话证据。"""
    headers, cycle = full_cycle
    _finish_week1_task(client, headers)
    resp = client.post("/api/cycles/finish", headers=headers)
    report = resp.json()
    assert report["locked"] is True
    assert report["verdicts"]
    for v in report["verdicts"]:
        assert v["preview_reading"], "锁定态应给每方向 1 句免费解读"
        assert v["reasons"] == [], "判定依据仍属付费内容"
        assert v["unverified"] == [], "未验证清单仍属付费内容"
        assert len(v["quotes"]) <= 2, "免费原话证据最多 2 条"
        for q in v["quotes"]:
            assert len(q) <= 60


def test_preview_verdicts_legacy_snapshot_fallback():
    """旧报告快照没有 one_liner/quotes 字段时，预览层现场补齐解读，不报错不泄漏。"""
    legacy = {
        "verdicts": [
            {
                "clue_id": 1,
                "direction_code": "teaching",
                "direction_name": "表达教学",
                "statement": "一条旧线索",
                "verdict": "继续验证",
                "emoji": "🌱",
                "evidence_level": "初步",
                "task_count": 3,
            }
        ]
    }
    out = _preview_verdicts(legacy, db=None)
    assert out[0]["preview_reading"] == (
        "成绩在上升、你也想继续——方向大概率是对的，只是证据还需要再加厚。"
    )
    assert out[0]["quotes"] == []
    assert out[0]["reasons"] == []
    assert out[0]["unverified"] == []


def test_completed_clues_can_start_new_cycle(client, full_cycle):
    headers, cycle = full_cycle
    _finish_week1_task(client, headers)
    client.post("/api/cycles/finish", headers=headers)

    # 用 completed 线索开新一轮
    resp = client.post("/api/cycles/start", json={"clue_ids": cycle["clue_ids"][:2]}, headers=headers)
    assert resp.status_code == 200, resp.text
    new_cycle = resp.json()
    assert new_cycle["status"] == "active"
    # 再.finish 一次也应成功（新一轮报告）
    resp = client.post("/api/cycles/finish", headers=headers)
    assert resp.status_code == 200


def test_finish_without_cycle_404(client, auth_headers):
    resp = client.post("/api/cycles/finish", headers=auth_headers)
    assert resp.status_code == 404


def test_reevaluate_after_degraded_mock_always_works(client, full_cycle):
    headers, _ = full_cycle
    inst_id, _ = _finish_week1_task(client, headers)
    resp = client.post(f"/api/tasks/{inst_id}/re-evaluate", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["evaluation"]["source"] == "ai"
    assert data["evaluation"]["degraded"] is False


def test_one_liners_cover_all_verdict_grades():
    """守护：判定的 6 个档位必须每档都有免费层解读文案。

    _verdict 可能返回的档位全集与 ONE_LINERS 的键集须一致——
    新增档位漏配文案时，免费层会静默落到通用兜底句（"任务证据还不足以下结论"），语义不符。
    """
    from app.services.cycle_report import ONE_LINERS

    expected = {"继续投入", "继续验证", "冲刺一下", "换法再试", "暂停验证", "还没开始"}
    assert set(ONE_LINERS.keys()) == expected, "ONE_LINERS 档位集漂移，免费层将出现兜底文案"
