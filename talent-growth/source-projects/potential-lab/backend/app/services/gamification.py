"""游戏化：借鉴多邻国的"愉快坚持"机制，但奖励对象是我们的核心动作——
真实的任务提交、自评、读者反馈和打卡（奖励行为，不奖励分数）。

- XP 经验值 + 等级称号（探索新手 → 自由探索家，共 9 级）
- 连续探索天数（🔥 按自然日；今天没动明天就归零重攒，归零不是惩罚，是重新开始）
- 每日目标（默认 30 XP/天，完成即"今日达标"）
- 成就徽章（自动解锁，全部与"验证行为"挂钩）
- 吉祥物"小潜"🦉：陪伴式的务实鼓励台词（不夸天赋，只夸行动）
"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AchievementUnlock, GamificationState, User, XPEvent
from app.config import settings
from app.utils import utcnow

LEVELS = [
    (0, "探索新手"),
    (50, "好奇学徒"),
    (120, "线索猎人"),
    (250, "任务行者"),
    (450, "习惯锻造者"),
    (700, "优势进阶者"),
    (1000, "证据收藏家"),
    (1400, "潜能开拓者"),
    (1900, "自由探索家"),
]

XP_RULES = {
    "task_submit": 20,
    "task_retention": 30,
    "self_review": 5,
    "reader_feedback": 10,
    "checkin": 10,
    "cycle_start": 10,
}

DAILY_GOAL = 30

ACHIEVEMENTS = [
    {"code": "first_steps", "emoji": "🌱", "name": "初次提交", "desc": "完成第一次任务提交"},
    {"code": "self_aware", "emoji": "🪞", "name": "自我认识", "desc": "完成第一次任务自评"},
    {"code": "feedback_first", "emoji": "💌", "name": "第一位读者", "desc": "收到第一条真实读者反馈"},
    {"code": "streak_3", "emoji": "🔥", "name": "三日之约", "desc": "连续 3 天有探索动作"},
    {"code": "streak_7", "emoji": "⚡", "name": "七日连燃", "desc": "连续 7 天有探索动作"},
    {"code": "ten_tasks", "emoji": "🎯", "name": "十全十美", "desc": "累计提交 10 次任务"},
    {"code": "retention_done", "emoji": "🔁", "name": "保持大师", "desc": "完成一次保持性重测"},
    {"code": "week_complete", "emoji": "🏅", "name": "一周圆满", "desc": "本周计划全部打卡完成"},
]
ACHIEVEMENT_META = {a["code"]: a for a in ACHIEVEMENTS}

MASCOT_LINES = [
    "小潜又来啦！今天想验证哪一个方向？",
    "不求快，做完一件是一件。",
    "别怕答案不好看，证据才会说话。",
    "连续行动的你，比『有天分』更难得。",
    "卡住的地方，往往就是线索。",
    "今天的每一小步，都在攒证据。",
    "累了就休息，回来继续也算连续哦。",
]


def level_of(xp: int) -> dict:
    level, name, level_xp = 1, LEVELS[0][1], 0
    next_xp = LEVELS[1][0]
    for i, (threshold, n) in enumerate(LEVELS):
        if xp >= threshold:
            level, name, level_xp = i + 1, n, threshold
            next_xp = LEVELS[i + 1][0] if i + 1 < len(LEVELS) else None
    return {"level": level, "name": name, "next_level_xp": next_xp, "level_xp": level_xp}


def _get_state(db: Session, user: User) -> GamificationState:
    state = db.query(GamificationState).filter(GamificationState.user_id == user.id).first()
    if not state:
        state = GamificationState(user_id=user.id, xp=0, streak_days=0, last_active_date=None)
        db.add(state)
        db.flush()
    return state


def _unlock(db: Session, user: User, codes: list[str]) -> list[str]:
    new_codes = []
    for code in codes:
        exists = (
            db.query(AchievementUnlock)
            .filter(AchievementUnlock.user_id == user.id, AchievementUnlock.code == code)
            .first()
        )
        if not exists:
            db.add(AchievementUnlock(user_id=user.id, code=code, created_at=utcnow()))
            new_codes.append(code)
    return new_codes


def award(db: Session, user: User, code: str, week_complete: bool = False) -> dict:
    """记录一次探索动作：发 XP、更新连击、检查成就。返回给前端做庆祝动效。"""
    xp = XP_RULES.get(code, 0)
    prev_level = level_of(_get_state(db, user).xp)["level"]

    db.add(XPEvent(user_id=user.id, code=code, xp=xp, created_at=utcnow()))
    db.flush()  # 会话是 autoflush=False：先落库，下面的成就计数才能看到本次事件
    state = _get_state(db, user)
    state.xp += xp

    today = utcnow().date()  # 全链路统一用 UTC 日，避免本地/UTC 混用
    if state.last_active_date == today:
        pass  # 今天已有动作，连击不变
    elif state.last_active_date == today - timedelta(days=1):
        state.streak_days += 1
    else:
        state.streak_days = 1
    state.last_active_date = today
    state.updated_at = utcnow()

    checks: list[str] = []
    event_count = lambda c: (  # noqa: E731
        db.query(func.count(XPEvent.id)).filter(XPEvent.user_id == user.id, XPEvent.code == c).scalar() or 0
    )
    if event_count("task_submit") + event_count("task_retention") >= 1:
        checks.append("first_steps")
    if event_count("self_review") >= 1:
        checks.append("self_aware")
    if event_count("reader_feedback") >= 1:
        checks.append("feedback_first")
    if state.streak_days >= 3:
        checks.append("streak_3")
    if state.streak_days >= 7:
        checks.append("streak_7")
    if event_count("task_submit") + event_count("task_retention") >= 10:
        checks.append("ten_tasks")
    if event_count("task_retention") >= 1:
        checks.append("retention_done")
    if week_complete:
        checks.append("week_complete")
    new_achievements = _unlock(db, user, checks)

    db.commit()
    new_level = level_of(state.xp)
    return {
        "xp_awarded": xp,
        "total_xp": state.xp,
        "streak_days": state.streak_days,
        "level": new_level["level"],
        "level_name": new_level["name"],
        "level_up": new_level["level"] > prev_level,
        "new_achievements": [
            {"code": c, **{k: ACHIEVEMENT_META[c][k] for k in ("emoji", "name", "desc")}}
            for c in new_achievements
        ],
    }


def today_xp(db: Session, user: User) -> int:
    midnight = datetime.combine(utcnow().date(), time.min)  # UTC 当日零点
    rows = (
        db.query(func.coalesce(func.sum(XPEvent.xp), 0))
        .filter(XPEvent.user_id == user.id, XPEvent.created_at >= midnight)
        .scalar()
    )
    return int(rows or 0)


def me_payload(db: Session, user: User) -> dict:
    state = _get_state(db, user)
    lvl = level_of(state.xp)
    unlocked_codes = {
        a.code
        for a in db.query(AchievementUnlock).filter(AchievementUnlock.user_id == user.id).all()
    }
    today = utcnow().date()
    # 连击是否仍然有效（昨天/今天有动作即有效）
    streak_alive = state.last_active_date in (today, today - timedelta(days=1)) if state.last_active_date else False
    # 遗忘临界点：昨天有动作、今天还没动——连击命悬一线，最需要提醒的时刻
    streak_at_risk = bool(
        streak_alive
        and state.streak_days > 0
        and state.last_active_date == today - timedelta(days=1)
    )
    # 台词按日期轮换，同一天看到的稳定
    line = MASCOT_LINES[(today.toordinal() + user.id) % len(MASCOT_LINES)]
    if not streak_alive and state.streak_days > 0:
        line = "连击断了没关系，今天动一动就从 1 重新烧起来 🔥"
    return {
        "xp": state.xp,
        "streak_days": state.streak_days if streak_alive else 0,
        "streak_at_risk": streak_at_risk,
        "level": lvl["level"],
        "level_name": lvl["name"],
        "next_level_xp": lvl["next_level_xp"],
        "level_xp": lvl["level_xp"],
        "daily_goal": DAILY_GOAL,
        "today_xp": today_xp(db, user),
        "daily_done": today_xp(db, user) >= DAILY_GOAL,
        "reminder_template_id": settings.wx_weekly_reminder_template_id,
        "mascot": {"emoji": "🦉", "name": "小潜", "line": line},
        "achievements": [
            {**a, "unlocked": a["code"] in unlocked_codes} for a in ACHIEVEMENTS
        ],
    }
