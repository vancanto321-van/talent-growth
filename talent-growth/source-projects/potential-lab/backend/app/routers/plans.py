"""周计划：查看本周、打卡、（未开始时）重新生成。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, attributes

from app.database import get_db
from app.deps import get_current_user
from app.content_loader import directions
from app.models import Checkin, ExplorationCycle, User, WeeklyPlan
from app.schemas import CheckinRequest, PlanOut
from app.services.gamification import award
from app.services.planning import ensure_current_plan, generate_plan, week_index_for
from app.utils import utcnow

router = APIRouter(prefix="/api/plans", tags=["plans"])


def _plan_out(plan: WeeklyPlan) -> PlanOut:
    focus_name = directions().get(plan.focus_direction, {}).get("name", "")
    return PlanOut(
        id=plan.id,
        week_index=plan.week_index,
        week_start=plan.week_start.isoformat(),
        focus_direction=plan.focus_direction,
        focus_direction_name=focus_name,
        items=[
            {
                "kind": i["kind"],
                "title": i["title"],
                "detail": i.get("detail", ""),
                "done": i.get("done", False),
                "checkin": i.get("checkin"),
            }
            for i in plan.items
        ],
        ai_note=plan.ai_note or "",
    )


def _active_cycle(db: Session, user: User) -> ExplorationCycle:
    cycle = (
        db.query(ExplorationCycle)
        .filter(ExplorationCycle.user_id == user.id, ExplorationCycle.status == "active")
        .first()
    )
    if not cycle:
        raise HTTPException(status_code=404, detail="还没有进行中的探索周期，先去「探测」页完成访谈")
    return cycle


@router.get("/current", response_model=PlanOut)
def current_plan(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cycle = _active_cycle(db, user)
    plan = ensure_current_plan(db, user.id, cycle)
    return _plan_out(plan)


@router.post("/checkin")
def checkin(body: CheckinRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = db.get(WeeklyPlan, body.plan_id)
    if not plan or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="计划不存在")
    if body.item_index >= len(plan.items):
        raise HTTPException(status_code=404, detail="计划项不存在")
    items = plan.items
    item = items[body.item_index]
    if item.get("done"):
        raise HTTPException(status_code=400, detail="这一项已经打过卡了")
    item["done"] = True
    item["checkin"] = {"minutes": body.minutes, "feeling": body.feeling[:500], "at": utcnow().isoformat()}
    attributes.flag_modified(plan, "items")
    db.add(
        Checkin(
            user_id=user.id,
            plan_id=plan.id,
            item_index=body.item_index,
            minutes=body.minutes,
            feeling=body.feeling[:1000],
        )
    )
    db.commit()
    db.refresh(plan)
    reward = award(db, user, "checkin", week_complete=all(i.get("done") for i in plan.items))
    return {"plan": _plan_out(plan), "reward": reward}


@router.post("/regenerate", response_model=PlanOut)
def regenerate(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """仅当本周计划一个都没打卡时允许重新生成。"""
    cycle = _active_cycle(db, user)
    week_index = week_index_for(cycle)
    plan = (
        db.query(WeeklyPlan)
        .filter(WeeklyPlan.user_id == user.id, WeeklyPlan.cycle_id == cycle.id, WeeklyPlan.week_index == week_index)
        .first()
    )
    if plan and any(i.get("done") for i in plan.items):
        raise HTTPException(status_code=400, detail="本周已有打卡记录，不能重新生成")
    if plan:
        db.delete(plan)
        db.flush()
    plan = generate_plan(db, user.id, cycle, week_index)
    db.commit()
    db.refresh(plan)
    return _plan_out(plan)
