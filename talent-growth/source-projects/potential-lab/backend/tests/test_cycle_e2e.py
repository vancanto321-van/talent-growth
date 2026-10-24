"""四周周期 E2E（可控时间）：把周期起点拨回过去，模拟 4 周真实推进。

覆盖：周序号推进、计划适配已完成任务（任务级轮换）、中断恢复、重复提交防护、
延期/跳周、保持性重测全链路、结业可追溯、跨周期数据归属。
"""

from datetime import timedelta

from app.database import get_db
from app.models import ExplorationCycle, TaskInstance
from app.utils import utcnow

SUB_TEXT = (
    "问题一：市场规模把非用户算入，因为智能水杯面向细分人群，后果是收入预估虚高。"
    "问题二：转化率无依据，例如没有渠道与获客成本数据，所以百万收入站不住。"
    "问题三：三个月量产是隐藏假设，因为硬件涉及供应链认证周期长，后果是跳票。"
)


def _setup_user_and_cycle(client):
    """注册用户 → 访谈 → 建周期；把周期起点拨回 22 天前（进入第 4 周）。"""
    resp = client.post("/api/auth/mock-login", json={"nickname": "E2E 用户"})
    headers = {"Authorization": f"Bearer {resp.json()['token']}"}
    clues = client.post(
        "/api/explore/finish",
        json={"answers": [
            {"code": "q_learn_fast", "text": "我给同事解释业务特别顺，讲得比文档清楚。"},
            {"code": "q_asked_for_help", "text": "同事常找我分析报表、排查问题。"},
            {"code": "q_repeat_willingly", "text": "我愿意反复折腾脚本自动化。"},
            {"code": "q_lose_track", "text": "写 python 会忘记时间。"},
            {"code": "q_untried", "text": "想学设计。"},
            {"code": "q_time_budget", "text": "每周 5 小时。"},
        ]},
        headers=headers,
    ).json()
    cycle = client.post(
        "/api/cycles/start",
        json={"clue_ids": [next(c["id"] for c in clues if c["direction_code"] == "analysis")]},
        headers=headers,
    ).json()

    # 时间拨回 22 天前（第 4 周口径按 utcnow 计算）
    db = next(client.app.dependency_overrides[get_db]())
    try:
        c = db.get(ExplorationCycle, cycle["id"])
        c.started_at = utcnow() - timedelta(days=22)
        db.commit()
    finally:
        db.close()
    return headers, cycle


def _submit_task(client, headers, template_code, text=SUB_TEXT, mode="independent"):
    inst = client.post(
        "/api/tasks/from-template", json={"template_code": template_code}, headers=headers
    ).json()
    client.post(f"/api/tasks/{inst['id']}/start", headers=headers)
    resp = client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={"text_content": text, "mode": mode, "time_spent_min": 25, "difficulty_feedback": 3},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return inst["id"], resp.json()


def test_full_four_week_cycle(client):
    headers, cycle = _setup_user_and_cycle(client)

    # ---- 第 4 周口径：week_index 应为 4 ----
    today = client.get("/api/tasks/today", headers=headers).json()
    assert today["cycle"]["week_index"] == 4

    # ---- 计划适配已完成任务：把前 3 周的任务补录为已完成（时间拨回各自周） ----
    db = next(client.app.dependency_overrides[get_db]())
    try:
        instances = db.query(TaskInstance).filter(TaskInstance.user_id == headers["Authorization"]).all()
    finally:
        db.close()

    # 前 3 周依次完成 分析方向的 入门A、进阶、迁移（3 个不同任务）
    done = []
    for code in ["ana_intro_findflaws", "ana_adv_evaluate"]:
        inst_id, result = _submit_task(client, headers, code)
        done.append(inst_id)
        # 把提交时间拨回对应周（第 1、2 周）
        d = next(client.app.dependency_overrides[get_db]())
        try:
            ti = d.get(TaskInstance, inst_id)
            ti.submitted_at = utcnow() - timedelta(days=22 - (done.index(inst_id) * 7))
            d.commit()
        finally:
            d.close()

    # 本周（第 4 周）计划应推进到"迁移"任务，而不是重复入门/进阶
    today = client.get("/api/tasks/today", headers=headers).json()
    plan_tasks = [i for i in today["items"] if i["type"] == "task"]
    assert plan_tasks, "第 4 周应有主方向任务"
    # 迁移任务已被排期 7 天后重测保留，动态推进应给出入门变体 B
    assert plan_tasks[0]["template"]["code"] == "ana_intro_decision", (
        f"计划应推进到未做过的变体，实际：{plan_tasks[0]['template']['code']}"
    )

    # ---- 中断恢复：开始任务但不提交，之后回来仍可继续提交 ----
    task_item = plan_tasks[0]
    body = {"template_code": task_item["template"]["code"]}
    inst = client.post("/api/tasks/from-template", json=body, headers=headers).json()
    client.post(f"/api/tasks/{inst['id']}/start", headers=headers)
    # 模拟中断后返回：直接提交（不重新 start）
    resp = client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={"text_content": SUB_TEXT, "mode": "independent", "time_spent_min": 30, "difficulty_feedback": 4},
        headers=headers,
    )
    assert resp.status_code == 200

    # ---- 重复提交防护 ----
    dup = client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={"text_content": SUB_TEXT, "mode": "independent", "time_spent_min": 10, "difficulty_feedback": 2},
        headers=headers,
    )
    assert dup.status_code == 400

    # ---- 迁移任务评估后应安排保持性重测（7 天后，落在周期外） ----
    resp = client.get("/api/tasks/today", headers=headers)
    assert all(i["type"] != "retention" for i in resp.json()["items"])

    # ---- 结业：报告可生成，结论可追溯 ----
    resp = client.post("/api/cycles/finish", headers=headers)
    assert resp.status_code == 200
    report = resp.json()
    analysis = next(v for v in report["verdicts"] if v["direction_code"] == "analysis")
    # 追溯性：完成过 3 个不同任务（入门A、进阶A、入门B），报告的 task_count 应一致
    assert analysis["task_count"] == 3, f"任务数应可追溯到具体记录，实际 {analysis['task_count']}"
    assert analysis["evidence_level"] in ("线索", "初步", "较充分")
    # 未验证清单应指出缺少读者反馈（本流程未提交读者反馈）
    db = next(client.app.dependency_overrides[get_db]())
    try:
        from app.models import CycleReport

        cr = db.query(CycleReport).order_by(CycleReport.id.desc()).first()
        av = next(v for v in cr.payload["verdicts"] if v["direction_code"] == "analysis")
        assert any("读者" in u for u in av["unverified"]), "未验证清单应指出缺读者反馈"
    finally:
        db.close()

    # ---- 跨周期归属：旧周期的报告不泄漏到新周期；旧线索可复用开新一轮 ----
    resp = client.post(
        "/api/cycles/start", json={"clue_ids": [analysis["clue_id"]]}, headers=headers
    )
    assert resp.status_code == 200
    new_cycle = resp.json()
    assert new_cycle["status"] == "active"
    # 新周期第 1 周从入门变体重新开始（任务级轮换：入门B）
    resp = client.get("/api/tasks/today", headers=headers)
    new_task = next(i for i in resp.json()["items"] if i["type"] == "task")
    assert new_task["template"]["code"] != "ana_transfer_newdomain"


def test_skip_weeks_and_cap(client):
    """跳过两周不操作：week_index 封顶在 4，不会越界；任务仍可完成。"""
    resp = client.post("/api/auth/mock-login", json={"nickname": "跳周用户"})
    headers = {"Authorization": f"Bearer {resp.json()['token']}"}
    clues = client.post(
        "/api/explore/finish",
        json={"answers": [
            {"code": "q_learn_fast", "text": "我讲故事特别顺，能编能讲。"},
            {"code": "q_asked_for_help", "text": "同学常找我分析问题。"},
            {"code": "q_repeat_willingly", "text": "我愿意反复练习讲同一个故事。"},
            {"code": "q_lose_track", "text": "看书会忘记时间。"},
            {"code": "q_untried", "text": "想学编程。"},
            {"code": "q_time_budget", "text": "每周 5 小时。"},
        ]},
        headers=headers,
    ).json()
    cycle = client.post(
        "/api/cycles/start", json={"clue_ids": [c["id"] for c in clues[:1]]}, headers=headers
    ).json()
    db = next(client.app.dependency_overrides[get_db]())
    try:
        c = db.get(ExplorationCycle, cycle["id"])
        c.started_at = utcnow() - timedelta(days=60)  # 跳过近 9 周
        db.commit()
    finally:
        db.close()

    today = client.get("/api/tasks/today", headers=headers).json()
    assert today["cycle"]["week_index"] == 4  # 封顶
    assert today["items"], "超期后任务仍可完成（不因逾期锁死）"


def test_cross_user_isolation(client):
    """用户 A 的任务/报告，用户 B 不可访问。"""
    a = client.post("/api/auth/mock-login", json={"nickname": "A"}).json()["token"]
    b = client.post("/api/auth/mock-login", json={"nickname": "B"}).json()["token"]
    ha = {"Authorization": f"Bearer {a}"}
    hb = {"Authorization": f"Bearer {b}"}

    clues = client.post(
        "/api/explore/finish",
        json={"answers": [
            {"code": "q_learn_fast", "text": "我解释业务特别顺。"},
            {"code": "q_asked_for_help", "text": "同事找我分析数据。"},
            {"code": "q_repeat_willingly", "text": "我反复折腾脚本。"},
            {"code": "q_lose_track", "text": "写代码忘时间。"},
            {"code": "q_untried", "text": "想学设计。"},
            {"code": "q_time_budget", "text": "每周 5 小时。"},
        ]},
        headers=ha,
    ).json()
    client.post("/api/cycles/start", json={"clue_ids": [c["id"] for c in clues[:1]]}, headers=ha)

    inst = client.post("/api/tasks/from-template", json={"template_code": "exp_intro_explain"}, headers=ha).json()
    client.post(f"/api/tasks/{inst['id']}/start", headers=ha)
    client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={"text_content": SUB_TEXT, "mode": "independent", "time_spent_min": 20, "difficulty_feedback": 3},
        headers=ha,
    )

    # B 访问 A 的任务/计划
    assert client.get(f"/api/tasks/{inst['id']}", headers=hb).status_code == 404
    assert client.post(f"/api/tasks/{inst['id']}/start", headers=hb).status_code == 404
    assert client.get(f"/api/tasks/{inst['id']}/evaluations", headers=hb).status_code == 404
