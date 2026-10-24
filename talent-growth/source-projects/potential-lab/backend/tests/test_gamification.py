"""游戏化：XP 发放、连击、每日目标、成就解锁、等级。"""

from datetime import timedelta

from app.database import get_db
from app.models import GamificationState
from app.services.gamification import level_of
from app.utils import utcnow

from tests.test_flow import _do_one_task  # 复用提交任务的辅助函数


def test_levels_monotonic():
    assert level_of(0)["level"] == 1
    assert level_of(50)["level"] == 2
    assert level_of(3000)["level"] == 9
    assert level_of(3000)["next_level_xp"] is None


def test_submit_awards_xp_and_streak(client, full_cycle):
    headers, _ = full_cycle
    me = client.get("/api/gamification/me", headers=headers).json()
    assert me["xp"] == 10  # cycle_start
    assert me["streak_days"] == 1
    assert me["today_xp"] == 10
    assert me["daily_done"] is False
    assert me["mascot"]["name"] == "小潜"

    # 提交一次任务 +20
    inst = client.post("/api/tasks/from-template", json={"template_code": "exp_intro_explain"}, headers=headers).json()
    client.post(f"/api/tasks/{inst['id']}/start", headers=headers)
    res = client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={
            "text_content": "问题一：市场规模口径错误，因为把所有人口当成用户，后果是高估收入。问题二：转化率无依据，例如没有渠道数据，所以百万收入站不住。问题三：三个月量产的隐藏假设，因为硬件需要供应链和认证，通常远超三个月，会导致跳票。",
            "mode": "independent",
            "time_spent_min": 20,
            "difficulty_feedback": 3,
        },
        headers=headers,
    )
    reward = res.json()["reward"]
    assert reward["xp_awarded"] == 20
    assert reward["total_xp"] == 30
    assert reward["streak_days"] == 1  # 同一天不重复加
    assert any(a["code"] == "first_steps" for a in reward["new_achievements"])

    me = client.get("/api/gamification/me", headers=headers).json()
    assert me["today_xp"] == 30
    assert me["daily_done"] is True  # 达到 30 XP 日目标


def test_streak_increases_next_day(client, full_cycle):
    headers, _ = full_cycle
    # 把 last_active_date 改成昨天，下一次动作应 +1 连击
    db = next(client.app.dependency_overrides[get_db]())
    try:
        state = db.query(GamificationState).filter(GamificationState.user_id == 1).first()
        state.last_active_date = (utcnow() - timedelta(days=1)).date()  # UTC 的昨天
        db.commit()
    finally:
        db.close()

    inst = client.post("/api/tasks/from-template", json={"template_code": "exp_intro_explain"}, headers=headers).json()
    client.post(f"/api/tasks/{inst['id']}/start", headers=headers)
    res = client.post(
        f"/api/tasks/{inst['id']}/submit",
        json={
            "text_content": "第一个问题：10 亿人市场把非用户算入，依据是产品面向细分人群，后果是预估虚高。第二个问题：1% 无依据，比如没有获客成本数据，后果是预算失真。第三个问题：无硬件经验三个月量产的假设，因为认证和供应链周期长，后果是跳票。",
            "mode": "independent",
            "time_spent_min": 15,
            "difficulty_feedback": 2,
        },
        headers=headers,
    )
    reward = res.json()["reward"]
    assert reward["streak_days"] == 2
    me = client.get("/api/gamification/me", headers=headers).json()
    unlocked = {a["code"] for a in me["achievements"] if a["unlocked"]}
    assert "streak_3" not in unlocked  # 才 2 天


def test_self_review_and_reader_feedback_rewards(client, full_cycle):
    headers, _ = full_cycle
    inst_id, _ = _do_one_task(client, headers, "exp_intro_explain")
    client.post(
        f"/api/tasks/{inst_id}/self-review",
        json={"investment": 4, "willingness": 4, "feeling": "ok"},
        headers=headers,
    )
    client.post(
        f"/api/tasks/{inst_id}/reader-feedback",
        json={"rating": 4, "comment": "清楚"},
        headers=headers,
    )
    me = client.get("/api/gamification/me", headers=headers).json()
    unlocked = {a["code"] for a in me["achievements"] if a["unlocked"]}
    assert {"self_aware", "feedback_first"} <= unlocked
    # XP: cycle_start 10 + task 20 + self 5 + reader 10 = 45，仍未到 50 的第二级
    assert me["level"] == 1
