"""数据生命周期：导出与注销（PIPL 要求：用户可见、可导出、可删除）。

- 导出：一次性打包该用户全部数据的 JSON（含任务、作品、评估、报告、订单）；
- 注销：删除该用户全部数据行（无外键约束，按表逐一清理），操作不可逆，
  前端必须二次确认后才调用。
- 注意：Submission / Evaluation 没有 user_id 列，经 TaskInstance 关联到人，
  导出用 JOIN、删除用子查询，两处口径一致。
"""

import json

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    AchievementUnlock,
    AssessmentResult,
    Checkin,
    ChildAssessmentResult,
    Clue,
    CycleReport,
    EvalFeedback,
    Evaluation,
    ExplorationCycle,
    InterviewSession,
    Order,
    PushSubscription,
    Submission,
    TaskInstance,
    User,
    WeeklyPlan,
    XPEvent,
    GamificationState,
)
from app.utils import utcnow

router = APIRouter(prefix="/api/me", tags=["me"])

# 直接带 user_id 的表（删除/导出按 user_id 过滤）
_USER_TABLES = [
    InterviewSession,
    Clue,
    ExplorationCycle,
    TaskInstance,
    WeeklyPlan,
    Checkin,
    CycleReport,
    AssessmentResult,
    ChildAssessmentResult,
    XPEvent,
    AchievementUnlock,
    PushSubscription,
    GamificationState,
    EvalFeedback,
    Order,
]
# 经 task_instance 关联到人的表（删除时先按实例子查询清理）
_INSTANCE_TABLES = [Submission, Evaluation]


def _model_rows(model, rows):
    out = []
    for r in rows:
        item = {}
        for col in model.__table__.columns:
            v = getattr(r, col.name)
            item[col.name] = v.isoformat() if hasattr(v, "isoformat") else v
        out.append(item)
    return out


@router.get("/export")
def export_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """导出本人全部数据（JSON）。"""

    def rows(model):
        return _model_rows(model, db.query(model).filter(model.user_id == user.id).all())

    submissions = _model_rows(
        Submission,
        db.query(Submission)
        .join(TaskInstance, Submission.task_instance_id == TaskInstance.id)
        .filter(TaskInstance.user_id == user.id)
        .all(),
    )
    evaluations = _model_rows(
        Evaluation,
        db.query(Evaluation)
        .join(TaskInstance, Evaluation.task_instance_id == TaskInstance.id)
        .filter(TaskInstance.user_id == user.id)
        .all(),
    )

    try:
        with open("VERSION", encoding="utf-8") as vf:
            app_version = vf.read().strip()
    except FileNotFoundError:
        app_version = "dev"
    # 隐式标识（《人工智能生成合成内容标识办法》GB 45438-2025）：
    # 导出文件携带元数据，声明哪些字段为 AI 生成、由哪些模型产出。
    ai_models_seen = sorted(
        {e.get("ai_model") for e in evaluations if e.get("ai_model")}
    )
    ai_disclosure = {
        "regulation": "《人工智能生成合成内容标识办法》（GB 45438-2025）",
        "notice": "下列字段由人工智能模型生成，仅供参考，不构成专业结论；其余字段为用户输入或程序计算结果。",
        "ai_fields": {
            "clues": ["statement", "evidence", "based_on"],
            "evaluations（source=ai）": ["scores", "evidence_quotes", "overall_comment", "suggestions"],
            "cycle_reports": ["ai_summary"],
        },
        "models_seen": ai_models_seen,
    }
    payload = {
        "exported_at": utcnow().isoformat(),
        "app_version": app_version,
        "ai_content_disclosure": ai_disclosure,
        "user": {
            "id": user.id,
            "nickname": user.nickname,
            "age_band": user.age_band,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "interview_sessions": rows(InterviewSession),
        "clues": rows(Clue),
        "cycles": rows(ExplorationCycle),
        "task_instances": rows(TaskInstance),
        "submissions": submissions,
        "evaluations": evaluations,
        "weekly_plans": rows(WeeklyPlan),
        "checkins": rows(Checkin),
        "cycle_reports": rows(CycleReport),
        "assessment_results": rows(AssessmentResult),
        "child_assessment_results": rows(ChildAssessmentResult),
        "xp_events": rows(XPEvent),
        "achievements": rows(AchievementUnlock),
        "eval_feedbacks": rows(EvalFeedback),
        "orders": rows(Order),
    }
    return Response(
        content=json.dumps(payload, ensure_ascii=False, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="potential-lab-export-u{user.id}.json"'},
    )


@router.post("/delete")
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """注销：不可逆删除本人全部数据。前端必须二次确认。"""
    instance_ids = db.query(TaskInstance.id).filter(TaskInstance.user_id == user.id)
    for model in _INSTANCE_TABLES:
        db.query(model).filter(model.task_instance_id.in_(instance_ids)).delete(synchronize_session=False)
    for model in _USER_TABLES:
        db.query(model).filter(model.user_id == user.id).delete()
    db.delete(user)
    db.commit()
    return {"deleted": True, "message": "账号与全部数据已删除"}
