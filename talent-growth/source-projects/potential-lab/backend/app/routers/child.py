"""儿童版测评：问卷 → 计分 → 类型 + 月度培养方案（付费门控）。

门控设计（对应产品定价）：
- 作答免费，提交后立即看到"类型预告"（类型名 + 最强的 2 个维度）；
- 完整报告（8 维度全分 + 类型深度解读 + 态度建议）需单次购买 child_assessment（¥5）；
- 月度培养方案（8 类型 × 4 周计划）需订阅 child_plan_monthly（¥29/月）。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.content_loader import child_assessment as load_assessment
from app.content_loader import item_rationales
from app.models import ChildAssessmentResult, User
from app.schemas import (
    AssessmentOption,
    ChildFormOut,
    ChildPlanOut,
    ChildQuestionsOut,
    ChildResultOut,
    ChildSubmitRequest,
    ChildTeaserOut,
)
from app.services.billing import has_entitlement
from app.services.child_assessment import (
    DECLARATION,
    attitude_advice,
    compute_scores,
    type_content,
)
from app.utils import utcnow

router = APIRouter(prefix="/api/child", tags=["child"])


def _get_result(db: Session, user: User, result_id: int) -> ChildAssessmentResult:
    result = db.get(ChildAssessmentResult, result_id)
    if not result or result.user_id != user.id:
        raise HTTPException(status_code=404, detail="测评记录不存在")
    return result


def _trait_meta() -> dict:
    return {t["code"]: t for t in load_assessment()["traits"]}


def _teaser(result: ChildAssessmentResult) -> ChildTeaserOut:
    meta = _trait_meta()
    scores = result.mi_scores or {}
    top = sorted(scores.items(), key=lambda kv: -kv[1])[:2]
    return ChildTeaserOut(
        type_trait=result.type_trait,
        type_name=meta[result.type_trait]["type_name"],
        type_tagline=meta[result.type_trait]["type_tagline"],
        top_traits=[{"name": meta[t]["name"], "score": s} for t, s in top],
    )


@router.get("/questions", response_model=ChildQuestionsOut)
def get_questions(form: str, user: User = Depends(get_current_user)):
    if form not in ("parent", "self"):
        raise HTTPException(status_code=400, detail="form 必须是 parent 或 self")
    data = load_assessment()
    rationales = item_rationales()["child"].get(form, {})
    items = [{**it, "why": rationales.get(it["code"], "")} for it in data["items"][form]]
    return ChildQuestionsOut(
        forms=[ChildFormOut(code=code, **meta) for code, meta in data["forms"].items()],
        options=[AssessmentOption(**o) for o in data["options"]],
        count=len(items),
        items=items,
        declaration=DECLARATION,
    )


@router.post("/submit", response_model=ChildResultOut)
def submit(body: ChildSubmitRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.form not in ("parent", "self"):
        raise HTTPException(status_code=400, detail="form 必须是 parent 或 self")
    if body.form == "parent" and not body.parent_confirmed:
        raise HTTPException(status_code=400, detail="家长观察版需由监护人填写并确认")
    items = load_assessment()["items"][body.form]
    unknown = set(body.answers) - {it["code"] for it in items}
    if unknown:
        raise HTTPException(status_code=400, detail=f"存在未知题目编号：{sorted(unknown)[:5]}")
    if len(body.answers) < len(items):
        raise HTTPException(status_code=400, detail=f"还有 {len(items) - len(body.answers)} 题未作答")
    try:
        scores = compute_scores(body.answers, body.form)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    result = ChildAssessmentResult(
        user_id=user.id,
        form=body.form,
        child_age_band=body.child_age_band[:16],
        child_nickname=body.child_nickname[:32],
        answers={k: int(v) for k, v in body.answers.items()},
        mi_scores=scores["mi_scores"],
        grit_score=scores["grit_score"],
        mindset_score=scores["mindset_score"],
        type_trait=scores["type_trait"],
        created_at=utcnow(),
    )
    db.add(result)
    db.commit()
    db.refresh(result)

    # 提交免费看预告；完整报告 ¥5 按 result 解锁（scope=result.id）
    unlocked = has_entitlement(db, user, "child_assessment", scope_id=result.id)
    return _result_out(db, user, result, unlocked)


def _result_out(db: Session, user: User, result: ChildAssessmentResult, unlocked: bool) -> ChildResultOut:
    meta = _trait_meta()
    teaser = _teaser(result)
    base = ChildResultOut(
        id=result.id,
        form=result.form,
        child_nickname=result.child_nickname,
        child_age_band=result.child_age_band,
        created_at=result.created_at.isoformat(),
        locked=not unlocked,
        teaser=teaser,
        declaration=DECLARATION,
        plan_locked=True,
        price_cents=settings.price_child_assessment_cents,
    )
    if not unlocked:
        return base

    trait_scores = [
        {"code": t, "name": meta[t]["name"], "score": (result.mi_scores or {}).get(t, 0)}
        for t in meta
    ]
    trait_scores.sort(key=lambda x: -x["score"])
    content = type_content(result.type_trait)
    # 月度计划始终随订阅解锁；单次购买只解锁报告
    plan_unlocked = has_entitlement(db, user, "child_plan_monthly")
    base.mi_scores = trait_scores
    base.grit_score = result.grit_score
    base.mindset_score = result.mindset_score
    base.type_content = content
    base.attitude_advice = attitude_advice(result.grit_score, result.mindset_score)
    base.plan_locked = not plan_unlocked
    return base


@router.get("/result/{result_id}", response_model=ChildResultOut)
def get_result(result_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = _get_result(db, user, result_id)
    unlocked = has_entitlement(db, user, "child_assessment", scope_id=result.id)
    return _result_out(db, user, result, unlocked)


@router.get("/latest", response_model=ChildResultOut | None)
def latest(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = (
        db.query(ChildAssessmentResult)
        .filter(ChildAssessmentResult.user_id == user.id)
        .order_by(ChildAssessmentResult.created_at.desc(), ChildAssessmentResult.id.desc())
        .first()
    )
    if not result:
        return None
    unlocked = has_entitlement(db, user, "child_assessment", scope_id=result.id)
    return _result_out(db, user, result, unlocked)


@router.delete("/result/{result_id}")
def withdraw_result(result_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """撤回（删除）单份儿童测评结果：监护人可随时行使删除权（PIPL）。"""
    result = db.get(ChildAssessmentResult, result_id)
    if not result or result.user_id != user.id:
        raise HTTPException(status_code=404, detail="测评记录不存在")
    db.delete(result)
    db.commit()
    return {"deleted": True, "result_id": result_id}


@router.get("/plan", response_model=ChildPlanOut)
def get_plan(trait: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """月度培养方案（¥29/月订阅解锁）。未订阅时可见第一周主题作为预告。"""
    meta = _trait_meta()
    if trait not in meta:
        raise HTTPException(status_code=404, detail="未知类型维度")
    try:
        content = type_content(trait)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    subscribed = has_entitlement(db, user, "child_plan_monthly")
    out = ChildPlanOut(
        trait=trait,
        type_name=content["type_name"],
        headline=content["headline"],
        locked=not subscribed,
        subscription_active=subscribed,
        price_cents=settings.price_child_plan_monthly_cents,
    )
    if subscribed:
        out.principles = content["principles"]
        out.weekly_plan = content["weekly_plan"]
        out.pitfalls = content["pitfalls"]
        out.resources = content["resources"]
    else:
        first_week = content["weekly_plan"][0]
        out.weekly_plan = [{**first_week, "activities": first_week["activities"][:1], "preview": True}]
    return out
