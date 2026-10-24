"""端到端闭环：登录 → 访谈 → 建周期 → 今日任务 → 提交评估 → 自评 → 读者反馈 → 计划 → 画像。"""


def _do_one_task(client, headers, template_code, clue_id=None, text=None):
    body = {"template_code": template_code}
    if clue_id:
        body["clue_id"] = clue_id
    resp = client.post("/api/tasks/from-template", json=body, headers=headers)
    assert resp.status_code == 200, resp.text
    inst = resp.json()
    resp = client.post(f"/api/tasks/{inst['id']}/start", headers=headers)
    assert resp.status_code == 200
    submit = {
        "text_content": text
        or (
            "我选择解释『复式记账』这个概念。首先，想象你的钱是一个水池：收入是进水管，支出是排水管。"
            "例如，你每月工资 1 万进账，房租 3 千流出，水池水位变化就是你的结余。复式记账就是给每笔水流记两条记录："
            "它从哪来、到哪去。因为单式记账只记一边，所以月底经常对不上账；复式记账两边必须相等，错账立刻暴露。"
            "结果就是，你可以随时回答两个问题：钱从哪来的、花到哪去了。"
        ),
        "mode": "independent",
        "time_spent_min": 25,
        "difficulty_feedback": 3,
    }
    resp = client.post(f"/api/tasks/{inst['id']}/submit", json=submit, headers=headers)
    assert resp.status_code == 200, resp.text
    return inst["id"], resp.json()


def test_full_loop(client, full_cycle):
    headers, cycle = full_cycle
    assert cycle["status"] == "active"
    assert len(cycle["clue_ids"]) == 3

    # 今日任务：第 1 周计划应有 task + experience + reflect
    resp = client.get("/api/tasks/today", headers=headers)
    assert resp.status_code == 200
    today = resp.json()
    kinds = [i["type"] for i in today["items"]]
    assert "task" in kinds and "experience" in kinds and "reflect" in kinds

    # 找到主方向任务并完成
    task_item = next(i for i in today["items"] if i["type"] == "task")
    assert task_item["template"] is not None
    inst_id, result = _do_one_task(client, headers, task_item["template"]["code"])
    assert result["degraded"] is False
    evaluation = result["evaluation"]
    assert evaluation["source"] == "ai"
    assert len(evaluation["scores"]) == 3
    assert all(1 <= s["score"] <= 5 for s in evaluation["scores"])
    assert result["instance"]["status"] == "evaluated"

    # 入门任务评估后应自动安排 7 天后的保持性重测
    resp = client.get("/api/tasks/today", headers=headers)
    later = client.get("/api/tasks/today", headers=headers)
    # 重测未到期不应出现在今日列表；但计划打卡后画像应可用
    assert all(i["type"] != "retention" for i in later.json()["items"])

    # 自评
    resp = client.post(
        f"/api/tasks/{inst_id}/self-review",
        json={"investment": 4, "willingness": 5, "feeling": "写类比的时候最顺"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["self_willingness"] == 5

    # 读者反馈
    resp = client.post(
        f"/api/tasks/{inst_id}/reader-feedback",
        json={"rating": 4, "comment": "例子很贴切，我一读就懂了"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["source"] == "reader"

    # 计划与打卡
    resp = client.get("/api/plans/current", headers=headers)
    assert resp.status_code == 200
    plan = resp.json()
    assert plan["week_index"] == 1
    assert plan["focus_direction_name"]
    reflect_idx = next(i for i, item in enumerate(plan["items"]) if item["kind"] == "reflect")
    resp = client.post(
        "/api/plans/checkin",
        json={"plan_id": plan["id"], "item_index": reflect_idx, "minutes": 10, "feeling": "这周最大的发现是讲东西要先搭框架"},
        headers=headers,
    )
    assert resp.status_code == 200
    checked = resp.json()
    assert checked["reward"]["xp_awarded"] == 10
    assert checked["plan"]["items"][reflect_idx]["done"] is True

    # 画像：有评估数据后应有五维
    resp = client.get("/api/profile", headers=headers)
    assert resp.status_code == 200
    profile = resp.json()
    assert len(profile["clues"]) >= 1
    clue = next(c for c in profile["clues"] if c["direction_code"] == "expression")
    keys = {d["key"] for d in clue["dimensions"]}
    assert keys == {"current", "progress", "retention", "willingness", "evidence"}
    assert clue["evidence_level"] in ("线索", "初步", "较充分")
    assert "先天" in profile["note"] or "名次" in profile["note"]


def test_content_safety_blocks(client, full_cycle):
    headers, _ = full_cycle
    resp = client.post("/api/tasks/from-template", json={"template_code": "exp_intro_explain"}, headers=headers)
    inst = resp.json()
    resp = client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={"text_content": "这是关于赌博的内容", "mode": "independent", "time_spent_min": 5, "difficulty_feedback": 3},
        headers=headers,
    )
    assert resp.status_code == 422


def test_retention_scheduled_and_due(client, full_cycle):
    from datetime import datetime, timedelta

    from app.database import get_db
    from app.models import TaskInstance

    headers, cycle = full_cycle
    _, result = _do_one_task(client, headers, "exp_intro_explain")
    assert result["instance"]["status"] == "evaluated"

    # 重测已排期但未到期：不应出现在今日列表
    resp = client.get("/api/tasks/today", headers=headers)
    assert all(i["type"] != "retention" for i in resp.json()["items"])

    # 把 scheduled_for 快进到过去，重测应出现在今日
    db = next(client.app.dependency_overrides[get_db]())
    try:
        rows = db.query(TaskInstance).filter(TaskInstance.is_retention.is_(True)).all()
        assert len(rows) == 1
        rows[0].scheduled_for = datetime.utcnow() - timedelta(days=1)
        db.commit()
    finally:
        db.close()

    resp = client.get("/api/tasks/today", headers=headers)
    retentions = [i for i in resp.json()["items"] if i["type"] == "retention"]
    assert len(retentions) == 1
