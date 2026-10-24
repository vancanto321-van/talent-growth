"""任务流：今日任务 → 做任务 → 提交（安全检查 + AI 初评）→ 自评/读者反馈。

关键设计：
- 独立完成与 AI 辅助的成绩分开记录；
- AI 初评降级不阻塞流程（任务停在 submitted，可先自评）；
- 入门/进阶任务评估后自动安排 7 天后的保持性重测。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.content_loader import task_templates
from app.models import Clue, EvalFeedback, Evaluation, ExplorationCycle, Submission, TaskInstance, User
from app.schemas import (
    EvalFeedbackRequest,
    EvaluationOut,
    FromTemplateRequest,
    ReaderFeedbackRequest,
    SelfReviewRequest,
    TaskInstanceOut,
    TaskSubmitRequest,
)
from app.services.ai.base import AIError, get_ai
from app.services.gamification import award
from app.services.planning import ensure_current_plan
from app.services.retention import schedule_retention_if_due
from app.services.safety import check_text
from app.utils import utcnow

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

_OPEN_STATUSES = ["assigned", "in_progress"]


def _instance_out(inst: TaskInstance) -> TaskInstanceOut:
    from app.content_loader import template_out

    tpl = template_out(inst.template_code) if inst.template_code in task_templates() else None
    return TaskInstanceOut(
        id=inst.id,
        template=tpl,
        mode=inst.mode,
        status=inst.status,
        is_retention=inst.is_retention,
        scheduled_for=inst.scheduled_for.isoformat() if inst.scheduled_for else None,
        time_spent_min=inst.time_spent_min,
        self_investment=inst.self_investment,
        self_willingness=inst.self_willingness,
        self_feeling=inst.self_feeling,
        needs_evaluation=inst.status == "submitted",
    )


def _get_own_instance(db: Session, user: User, instance_id: int) -> TaskInstance:
    inst = db.get(TaskInstance, instance_id)
    if not inst or inst.user_id != user.id:
        raise HTTPException(status_code=404, detail="任务不存在")
    return inst


def _active_cycle(db: Session, user: User) -> ExplorationCycle | None:
    return (
        db.query(ExplorationCycle)
        .filter(ExplorationCycle.user_id == user.id, ExplorationCycle.status == "active")
        .first()
    )


@router.get("/today")
def today(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cycle = _active_cycle(db, user)
    if not cycle:
        return {"cycle": None, "items": []}
    plan = ensure_current_plan(db, user.id, cycle)
    from app.services.planning import week_index_for

    items_out = []
    now = utcnow()

    # 1) 到期的保持性重测
    due = (
        db.query(TaskInstance)
        .filter(
            TaskInstance.user_id == user.id,
            TaskInstance.is_retention.is_(True),
            TaskInstance.status.in_(_OPEN_STATUSES),
            TaskInstance.scheduled_for.isnot(None),
            TaskInstance.scheduled_for <= now,
        )
        .order_by(TaskInstance.scheduled_for)
        .all()
    )
    for inst in due:
        tpl = task_templates().get(inst.template_code)
        title = f"保持性重测：{tpl['title']}" if tpl else "保持性重测"
        items_out.append(
            {
                "type": "retention",
                "title": title,
                "detail": "换了个陌生题目、隔了几天再做一次，检验能力是否保持。",
                "task_instance_id": inst.id,
                "template": tpl,
                "plan_id": None,
                "item_index": None,
            }
        )

    # 2) 本周计划里未完成的任务/体验/回顾 —— 任务项按已完成情况动态推进
    #    （周计划生成后用户可能已完成前面的任务：今日任务必须反映真实进度，
    #     而不是按日历展示周初排下的旧任务）
    from app.services.retention import next_task_for_direction

    focus_clue = None
    focus_done_codes: list[str] | None = None
    if plan.focus_direction:
        focus_clue = (
            db.query(Clue)
            .filter(
                Clue.user_id == user.id,
                Clue.direction_code == plan.focus_direction,
                Clue.status == "active",
            )
            .first()
        )
        if focus_clue:
            rows = (
                db.query(TaskInstance.template_code)
                .filter(
                    TaskInstance.clue_id == focus_clue.id,
                    TaskInstance.status.in_(["submitted", "evaluated"]),
                    TaskInstance.is_retention.is_(False),
                )
                .all()
            )
            focus_done_codes = [r[0] for r in rows]
            # 已排期未到期的保持性重测：不出现在日常推进里，到期由"保持性重测"区块展示
            reserved = (
                db.query(TaskInstance.template_code)
                .filter(
                    TaskInstance.clue_id == focus_clue.id,
                    TaskInstance.is_retention.is_(True),
                    TaskInstance.status.in_(["assigned", "in_progress"]),
                )
                .all()
            )
            focus_done_codes += [r[0] for r in reserved]

    for idx, item in enumerate(plan.items):
        if item.get("done"):
            continue
        kind = item["kind"]
        if kind in ("task", "experience"):
            inst = db.get(TaskInstance, item["task_instance_id"]) if item.get("task_instance_id") else None
            if inst and inst.status in ("submitted", "evaluated"):
                continue
            # 主方向任务：动态取"下一个该做的任务"（已完成的不重排）
            if kind == "task" and focus_clue is not None and focus_done_codes is not None:
                nxt = next_task_for_direction(plan.focus_direction, focus_done_codes)
                code = nxt["code"] if nxt else item.get("template_code")
            else:
                code = item.get("template_code")
            tpl = task_templates().get(code, {})
            if not tpl:
                continue
            items_out.append(
                {
                    "type": kind,
                    "title": tpl.get("title", item["title"]),
                    "detail": item.get("detail", ""),
                    "task_instance_id": inst.id if inst else None,
                    "template": tpl or None,
                    "plan_id": plan.id,
                    "item_index": idx,
                }
            )
        elif kind == "reflect":
            items_out.append(
                {
                    "type": "reflect",
                    "title": item["title"],
                    "detail": item.get("detail", ""),
                    "task_instance_id": None,
                    "template": None,
                    "plan_id": plan.id,
                    "item_index": idx,
                }
            )

    week_index = week_index_for(cycle)
    return {"cycle": {"id": cycle.id, "week_index": week_index, "weeks": cycle.weeks}, "items": items_out}


@router.post("/from-template", response_model=TaskInstanceOut)
def create_from_template(
    body: FromTemplateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """按模板开任务（同一模板有进行中的实例则复用）。体验类任务可不挂线索。"""
    tpl = task_templates().get(body.template_code)
    if not tpl:
        raise HTTPException(status_code=404, detail="任务模板不存在")

    existing = (
        db.query(TaskInstance)
        .filter(TaskInstance.user_id == user.id, TaskInstance.template_code == body.template_code, TaskInstance.status.in_(_OPEN_STATUSES))
        .first()
    )
    if existing:
        return _instance_out(existing)

    clue = None
    if body.clue_id is not None:
        clue = db.get(Clue, body.clue_id)
        if not clue or clue.user_id != user.id:
            raise HTTPException(status_code=404, detail="线索不存在")
    else:
        clue = (
            db.query(Clue)
            .filter(Clue.user_id == user.id, Clue.direction_code == tpl["direction_code"], Clue.status == "active")
            .first()
        )

    inst = TaskInstance(
        user_id=user.id,
        clue_id=clue.id if clue else None,
        template_code=body.template_code,
        status="assigned",
        created_at=utcnow(),
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return _instance_out(inst)


@router.get("/{instance_id}")
def get_task(instance_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """任务详情：实例 + 模板 + 全部评估（AI/读者），供任务页渲染。"""
    inst = _get_own_instance(db, user, instance_id)
    evals = (
        db.query(Evaluation)
        .filter(Evaluation.task_instance_id == inst.id, Evaluation.superseded.is_(False))
        .order_by(Evaluation.created_at)
        .all()
    )
    evaluations = [
        EvaluationOut(
            id=e.id,
            source=e.source,
            scores=e.scores or [],
            evidence_quotes=e.evidence_quotes or [],
            overall_comment=e.overall_comment or "",
            suggestions=e.suggestions or [],
            degraded=False,
            ai_model=e.ai_model or "",
        )
        for e in evals
    ]
    return {"instance": _instance_out(inst), "evaluations": evaluations}


@router.post("/{instance_id}/start", response_model=TaskInstanceOut)
def start_task(instance_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inst = _get_own_instance(db, user, instance_id)
    if inst.status in ("submitted", "evaluated"):
        raise HTTPException(status_code=400, detail="这个任务已经提交过了")
    if inst.status == "assigned":
        inst.status = "in_progress"
        inst.started_at = utcnow()
        db.commit()
        db.refresh(inst)
    return _instance_out(inst)


@router.post("/{instance_id}/submit")
def submit_task(
    instance_id: int,
    body: TaskSubmitRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inst = _get_own_instance(db, user, instance_id)
    if inst.status in ("submitted", "evaluated"):
        raise HTTPException(status_code=400, detail="这个任务已经提交过了")

    ok, reason = check_text(body.text_content, user.open_id)
    if not ok:
        raise HTTPException(status_code=422, detail=reason)

    now = utcnow()
    inst.status = "submitted"
    inst.mode = body.mode
    inst.submitted_at = now
    inst.time_spent_min = body.time_spent_min
    inst.difficulty_feedback = body.difficulty_feedback
    db.add(Submission(task_instance_id=inst.id, text_content=body.text_content, image_paths=[], created_at=now))
    db.flush()

    evaluation_payload = None
    degraded = False
    try:
        tpl = task_templates().get(inst.template_code)
        if tpl is None:
            raise AIError(f"任务模板 {inst.template_code} 已更新，暂无法自动评估，请完成自评")
        adapter = get_ai()
        result = adapter.evaluate_submission(tpl, body.text_content, body.mode)
        evaluation = Evaluation(
            task_instance_id=inst.id,
            source="ai",
            scores=[s.model_dump() for s in result.scores],
            evidence_quotes=result.evidence_quotes,
            overall_comment=result.overall_comment,
            suggestions=result.suggestions,
            ai_model=getattr(adapter, "model_tag", settings.ai_provider),
            prompt_version=getattr(adapter, "prompt_version", "v1"),
            created_at=now,
        )
        db.add(evaluation)
        inst.status = "evaluated"
        db.flush()
        evaluation_payload = EvaluationOut(
            id=evaluation.id,
            source="ai",
            scores=evaluation.scores,
            evidence_quotes=evaluation.evidence_quotes,
            overall_comment=evaluation.overall_comment,
            suggestions=evaluation.suggestions,
            degraded=False,
            ai_model=evaluation.ai_model or "",
        )
    except AIError as e:
        # 降级：任务保持 submitted，先自评，之后可以请求重新评估
        degraded = True
        evaluation_payload = EvaluationOut(
            id=0,
            source="ai",
            scores=[],
            evidence_quotes=[],
            overall_comment=f"AI 初评暂不可用（{e}）。你可以先完成自评，AI 恢复后可在任务记录里重新评估。",
            suggestions=[],
            degraded=True,
        )

    # 保持性重测排期不依赖 AI 是否成功：只要提交了就该安排
    if inst.clue_id:
        clue = db.get(Clue, inst.clue_id)
        if clue:
            schedule_retention_if_due(db, clue, inst)

    db.commit()
    db.refresh(inst)

    # 游戏化：奖励的是"提交验证"这个动作（保持性重测加成）
    reward = award(db, user, "task_retention" if inst.is_retention else "task_submit")
    return {"instance": _instance_out(inst), "evaluation": evaluation_payload, "degraded": degraded, "reward": reward}


@router.post("/{instance_id}/re-evaluate")
def reevaluate(instance_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """AI 初评降级或模型升级后，对已提交作品重新评估。"""
    inst = _get_own_instance(db, user, instance_id)
    if inst.status not in ("submitted", "evaluated"):
        raise HTTPException(status_code=400, detail="先提交作品再评估")
    submission = (
        db.query(Submission)
        .filter(Submission.task_instance_id == inst.id)
        .order_by(Submission.created_at.desc())
        .first()
    )
    if not submission:
        raise HTTPException(status_code=400, detail="找不到原始作品，无法评估")
    try:
        tpl = task_templates().get(inst.template_code)
        if tpl is None:
            raise HTTPException(status_code=400, detail="任务模板已更新，无法重新评估；请以自评和读者反馈为准")
        adapter = get_ai()
        result = adapter.evaluate_submission(tpl, submission.text_content, inst.mode)
    except AIError as e:
        raise HTTPException(status_code=503, detail=f"AI 暂不可用：{e}") from e

    # 取代旧的 AI 初评：历史保留（superseded=true），不计入画像与展示
    db.query(Evaluation).filter(
        Evaluation.task_instance_id == inst.id,
        Evaluation.source == "ai",
    ).update({"superseded": True})
    evaluation = Evaluation(
        task_instance_id=inst.id,
        source="ai",
        scores=[s.model_dump() for s in result.scores],
        evidence_quotes=result.evidence_quotes,
        overall_comment=result.overall_comment,
        suggestions=result.suggestions,
        ai_model=getattr(adapter, "model_tag", settings.ai_provider),
        prompt_version=getattr(adapter, "prompt_version", "v1"),
        created_at=utcnow(),
    )
    db.add(evaluation)
    inst.status = "evaluated"
    db.commit()
    db.refresh(inst)
    return {
        "instance": _instance_out(inst),
        "evaluation": EvaluationOut(
            id=evaluation.id,
            source="ai",
            scores=evaluation.scores,
            evidence_quotes=evaluation.evidence_quotes,
            overall_comment=evaluation.overall_comment,
            suggestions=evaluation.suggestions,
            degraded=False,
            ai_model=evaluation.ai_model or "",
        ),
    }


@router.post("/{instance_id}/self-review", response_model=TaskInstanceOut)
def self_review(
    instance_id: int,
    body: SelfReviewRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inst = _get_own_instance(db, user, instance_id)
    if inst.status not in ("submitted", "evaluated"):
        raise HTTPException(status_code=400, detail="先提交作品再自评")
    if inst.self_investment is not None:
        raise HTTPException(status_code=400, detail="已完成过自评，不能重复提交")
    inst.self_investment = body.investment
    inst.self_willingness = body.willingness
    inst.self_feeling = body.feeling
    db.commit()
    db.refresh(inst)
    award(db, user, "self_review")
    return _instance_out(inst)


@router.post("/{instance_id}/eval-feedback")
def eval_feedback(
    instance_id: int,
    body: EvalFeedbackRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """用户对 AI 评价的纠错反馈：记录并关联评价，供复核。"""
    inst = _get_own_instance(db, user, instance_id)
    if inst.status not in ("submitted", "evaluated"):
        raise HTTPException(status_code=400, detail="先提交作品")
    target = db.get(Evaluation, body.evaluation_id)
    if not target or target.task_instance_id != inst.id:
        raise HTTPException(status_code=404, detail="评价不存在或不属于该任务")
    fb = EvalFeedback(user_id=user.id, evaluation_id=body.evaluation_id, comment=body.comment[:500], created_at=utcnow())
    db.add(fb)
    db.commit()
    return {"recorded": True, "message": "反馈已记录，我们会用于改进评价质量"}


@router.post("/{instance_id}/reader-feedback", response_model=EvaluationOut)
def reader_feedback(
    instance_id: int,
    body: ReaderFeedbackRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """真实读者的反馈（用户线下把作品发给别人看后，代读者录入）。每任务限一条。"""
    inst = _get_own_instance(db, user, instance_id)
    if inst.status not in ("submitted", "evaluated"):
        raise HTTPException(status_code=400, detail="先提交作品再录入反馈")
    exists = (
        db.query(Evaluation)
        .filter(Evaluation.task_instance_id == inst.id, Evaluation.source == "reader")
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="这个任务已经录入过读者反馈")
    evaluation = Evaluation(
        task_instance_id=inst.id,
        source="reader",
        scores=[{"dimension": "总体印象", "score": body.rating, "comment": body.comment[:300]}],
        evidence_quotes=[],
        overall_comment=body.comment[:800],
        suggestions=[],
        created_at=utcnow(),
    )
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)
    award(db, user, "reader_feedback")
    return EvaluationOut(
        id=evaluation.id,
        source="reader",
        scores=evaluation.scores,
        evidence_quotes=[],
        overall_comment=evaluation.overall_comment,
        suggestions=[],
        degraded=False,
    )


@router.get("/{instance_id}/evaluations", response_model=list[EvaluationOut])
def list_evaluations(instance_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inst = _get_own_instance(db, user, instance_id)
    evals = (
        db.query(Evaluation)
        .filter(Evaluation.task_instance_id == inst.id, Evaluation.superseded.is_(False))
        .order_by(Evaluation.created_at)
        .all()
    )
    return [
        EvaluationOut(
            id=e.id,
            source=e.source,
            scores=e.scores or [],
            evidence_quotes=e.evidence_quotes or [],
            overall_comment=e.overall_comment or "",
            suggestions=e.suggestions or [],
            degraded=False,
            ai_model=e.ai_model or "",
        )
        for e in evals
    ]
