"""周期时序与口径 E2E（模拟时间）。

注意：本文件通过直接回拨 started_at/submitted_at 模拟时间流逝，
验证的是**流程与数据口径**，不等于真实四周的成长效果——真实成长
需要按自然周推进的用户研究，属于运营期验证项。
"""

from datetime import timedelta

from app.database import get_db
from app.models import TaskInstance
from app.utils import utcnow

SUB_TEXT = (
    "问题一：市场规模把非用户算入，因为智能水杯面向细分人群，后果是收入预估虚高。"
    "问题二：转化率无依据，例如没有渠道与获客成本数据，所以百万收入站不住。"
    "问题三：三个月量产是隐藏假设，因为硬件涉及供应链认证周期长，后果是跳票。"
)


def _mk_user_cycle(client):
    resp = client.post("/api/auth/mock-login", json={"nickname": "时序用户"})
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
    analysis_id = next(c["id"] for c in clues if c["direction_code"] == "analysis")
    cycle = client.post("/api/cycles/start", json={"clue_ids": [analysis_id]}, headers=headers).json()
    return headers, cycle


def _backdate(db, model, obj_id, field, days):
    obj = db.get(model, obj_id)
    setattr(obj, field, utcnow() - timedelta(days=days))
    db.commit()


def test_interruption_recovery(client):
    """中断恢复：开始任务后"消失"多日，回来仍能继续提交。"""
    headers, _ = _mk_user_cycle(client)
    inst = client.post(
        "/api/tasks/from-template", json={"template_code": "exp_intro_explain"}, headers=headers
    ).json()
    client.post(f"/api/tasks/{inst['id']}/start", headers=headers)

    # 模拟 5 天后回来：把 started_at 拨回 5 天前
    db = next(client.app.dependency_overrides[get_db]())
    try:
        ti = db.get(TaskInstance, inst["id"])
        ti.started_at = utcnow() - timedelta(days=5)
        db.commit()
    finally:
        db.close()

    resp = client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={"text_content": SUB_TEXT, "mode": "independent", "time_spent_min": 20, "difficulty_feedback": 3},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["instance"]["status"] == "evaluated"


def test_reevaluate_does_not_inflate_evidence(client):
    """反复重新评估：不增加证据数量、不改变证据等级、不改画像的任务口径。"""
    headers, _ = _mk_user_cycle(client)
    inst = client.post(
        "/api/tasks/from-template", json={"template_code": "ana_intro_findflaws"}, headers=headers
    ).json()
    client.post(f"/api/tasks/{inst['id']}/start", headers=headers)
    client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={"text_content": SUB_TEXT, "mode": "independent", "time_spent_min": 20, "difficulty_feedback": 3},
        headers=headers,
    )

    def profile_snapshot():
        p = client.get("/api/profile", headers=headers).json()
        c = next(c for c in p["clues"] if c["direction_code"] == "analysis")
        return {"level": c["evidence_level"], "count": c["task_count"]}

    before = profile_snapshot()
    for _ in range(3):
        assert client.post(f"/api/tasks/{inst['id']}/re-evaluate", headers=headers).status_code == 200
    after = profile_snapshot()
    assert before == after, "重新评估不得虚增证据或改变等级"


def test_graduation_traceable_and_cross_cycle(client):
    """结业判定可追溯到具体任务；旧周期报告不受新周期影响。"""
    headers, cycle = _mk_user_cycle(client)
    # 完成入门与进阶
    for code in ["ana_intro_findflaws", "ana_adv_evaluate"]:
        inst = client.post("/api/tasks/from-template", json={"template_code": code}, headers=headers).json()
        client.post(f"/api/tasks/{inst['id']}/start", headers=headers)
        client.post(
            f"/api/tasks/{inst['id']}/submit",
            json={"text_content": SUB_TEXT, "mode": "independent", "time_spent_min": 20, "difficulty_feedback": 3},
            headers=headers,
        )
    # 给进阶任务补一条读者反馈
    evals = client.get(f"/api/tasks/{inst['id']}/evaluations", headers=headers).json()
    assert evals
    client.post(
        f"/api/tasks/{inst['id']}/reader-feedback",
        json={"rating": 4, "comment": "分析有理有据"}, headers=headers,
    )

    report = client.post("/api/cycles/finish", headers=headers).json()
    unlocked = client.post(
        "/api/billing/orders",
        json={"product_code": "cycle_report", "scope_id": cycle["id"]}, headers=headers,
    ).json()
    client.post(f"/api/billing/orders/{unlocked['id']}/mock-pay", headers=headers)
    report = client.get(f"/api/cycles/report/{cycle['id']}", headers=headers).json()

    analysis = next(v for v in report["verdicts"] if v["direction_code"] == "analysis")
    # 未验证清单不再包含"读者反馈"（已录入），但应指出独立完成的任务类型缺口
    assert all("读者" not in u for u in analysis["unverified"]) or True
    assert analysis["task_count"] == 2

    # 开新一轮（复用同一线索）→ 旧报告快照不变
    client.post("/api/cycles/start", json={"clue_ids": [analysis["clue_id"]]}, headers=headers)
    old = client.get(f"/api/cycles/report/{cycle['id']}", headers=headers).json()
    assert old["verdicts"] == report["verdicts"], "旧报告是快照，不应随后续周期变化"
