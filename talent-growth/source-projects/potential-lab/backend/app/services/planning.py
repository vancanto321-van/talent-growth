"""周计划生成：结构完全由规则决定，AI 只写一段附言。

每周计划四件套：
  1. task       主方向任务（入门→进阶→迁移 顺序推进）
  2. experience 新方向体验（从未激活的方向轮换，防止探索范围被过早固定）
  3. retention  保持性重测（到期自动出现在今日任务里，不在计划里预排）
  4. reflect    周回顾（记录哪步最费劲/最顺、反馈应用情况）
"""

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.content_loader import directions
from app.models import Clue, ExplorationCycle, TaskInstance, WeeklyPlan
from app.services.ai.base import AIError, get_ai
from app.services.retention import next_task_for_direction
from app.utils import utcnow


def week_index_for(cycle: ExplorationCycle) -> int:
    started = cycle.started_at.date() if isinstance(cycle.started_at, datetime) else cycle.started_at
    delta_days = (utcnow().date() - started).days
    return max(1, min(cycle.weeks, delta_days // 7 + 1))


def week_start_for(cycle: ExplorationCycle, week_index: int) -> date:
    started = cycle.started_at.date() if isinstance(cycle.started_at, datetime) else cycle.started_at
    return started + timedelta(weeks=week_index - 1)


def _done_codes(db: Session, clue: Clue) -> list[str]:
    """该线索下已提交任务模板 code，按提交先后排序（用于任务级轮换）。"""
    rows = (
        db.query(TaskInstance)
        .filter(
            TaskInstance.clue_id == clue.id,
            TaskInstance.status.in_(["submitted", "evaluated"]),
            TaskInstance.is_retention.is_(False),
        )
        .order_by(TaskInstance.submitted_at)
        .all()
    )
    return [i.template_code for i in rows]


def generate_plan(db: Session, user_id: int, cycle: ExplorationCycle, week_index: int) -> WeeklyPlan:
    clues = db.query(Clue).filter(Clue.id.in_(cycle_clue_ids(db, cycle)), Clue.status == "active").all()
    clues.sort(key=lambda c: c.id)
    focus = clues[(week_index - 1) % len(clues)] if clues else None

    items: list[dict] = []

    # 1) 主方向任务
    if focus:
        tpl = next_task_for_direction(focus.direction_code, _done_codes(db, focus))
        if tpl:
            items.append(
                {
                    "kind": "task",
                    "title": tpl["title"],
                    "detail": tpl["description"][:80] + "…",
                    "template_code": tpl["code"],
                    "done": False,
                }
            )

    # 2) 新方向体验：从未激活的方向里轮换一个的入门任务
    active_codes = {c.direction_code for c in clues}
    inactive = [code for code in directions() if code not in active_codes]
    if inactive:
        exp_code = inactive[(week_index - 1) % len(inactive)]
        exp_tpl = next_task_for_direction(exp_code, [])
        if exp_tpl:
            items.append(
                {
                    "kind": "experience",
                    "title": f"新方向体验：{exp_tpl['title']}",
                    "detail": f"来自未探索方向「{directions()[exp_code]['name']}」，只为了解自己，不评判结果。",
                    "template_code": exp_tpl["code"],
                    "done": False,
                }
            )

    # 3) 周回顾
    items.append(
        {
            "kind": "reflect",
            "title": "周回顾",
            "detail": "写下：本周哪一步最费劲、哪一步最顺；读者/他人反馈你打算怎么用。",
            "done": False,
        }
    )

    # AI 附言（失败不影响计划本身）
    ai_note = ""
    if focus:
        try:
            ai_note = get_ai().plan_note(week_index, directions()[focus.direction_code]["name"])
        except AIError:
            ai_note = ""

    plan = WeeklyPlan(
        user_id=user_id,
        cycle_id=cycle.id,
        week_index=week_index,
        week_start=week_start_for(cycle, week_index),
        focus_direction=focus.direction_code if focus else "",
        items=items,
        ai_note=ai_note,
    )
    db.add(plan)
    db.flush()
    return plan


def cycle_clue_ids(db: Session, cycle: ExplorationCycle) -> list[int]:
    return [c.id for c in db.query(Clue).filter(Clue.cycle_id == cycle.id).all()]


def ensure_current_plan(db: Session, user_id: int, cycle: ExplorationCycle) -> WeeklyPlan:
    week_index = week_index_for(cycle)
    plan = (
        db.query(WeeklyPlan)
        .filter(WeeklyPlan.user_id == user_id, WeeklyPlan.cycle_id == cycle.id, WeeklyPlan.week_index == week_index)
        .first()
    )
    if not plan:
        plan = generate_plan(db, user_id, cycle, week_index)
        db.commit()
        db.refresh(plan)
    return plan
