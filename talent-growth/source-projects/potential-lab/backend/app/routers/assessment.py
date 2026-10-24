"""行业潜力测评：题库 → 计分 → 行业排序 → 培训/收入详情 → 转验证线索。

得分全部由程序规则计算；问卷结果定位为"潜力参照"，转线索时自动带上
"需任务验证"的标注，与产品"线索 → 验证 → 培养"的原则保持一致。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.content_loader import assessment as load_assessment
from app.content_loader import directions as load_directions
from app.content_loader import industries as load_industries
from app.content_loader import item_rationales
from app.models import AssessmentResult, Clue, User
from app.schemas import (
    AssessmentQuestionsOut,
    AssessmentResultOut,
    AssessmentSubmitRequest,
    AssessmentTraitScore,
    IndustryDetailOut,
    IndustryListItem,
)
from app.services.assessment import (
    NOTE,
    build_result_payload,
    compute_trait_scores,
    industry_breakdown,
    rank_industries,
)
from app.utils import utcnow

router = APIRouter(prefix="/api/assessment", tags=["assessment"])


def _result_out(result: AssessmentResult) -> AssessmentResultOut:
    trait_scores: dict = result.trait_scores
    industry_scores: list = result.industry_scores
    payload = build_result_payload(trait_scores, industry_scores)
    return AssessmentResultOut(
        id=result.id,
        version=result.version,
        created_at=result.created_at.isoformat(),
        trait_scores=[AssessmentTraitScore(**t) for t in payload["trait_scores"]],
        industries=payload["industries"],
        note=payload["note"],
    )


def _latest_result(db: Session, user: User) -> AssessmentResult | None:
    return (
        db.query(AssessmentResult)
        .filter(AssessmentResult.user_id == user.id)
        .order_by(AssessmentResult.created_at.desc(), AssessmentResult.id.desc())
        .first()
    )


@router.get("/questions", response_model=AssessmentQuestionsOut)
def get_questions(user: User = Depends(get_current_user)):
    data = load_assessment()
    rationales = item_rationales()["assessment"]
    items = [{**it, "why": rationales.get(it["code"], "")} for it in data["items"]]
    return AssessmentQuestionsOut(
        count=len(items),
        options=data["options"],
        items=items,
        declaration=NOTE,
    )


@router.post("/submit", response_model=AssessmentResultOut)
def submit(body: AssessmentSubmitRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = load_assessment()["items"]
    unknown = set(body.answers) - {it["code"] for it in items}
    if unknown:
        raise HTTPException(status_code=400, detail=f"存在未知题目编号：{sorted(unknown)[:5]}")
    if len(body.answers) < len(items):
        missing = len(items) - len(body.answers)
        raise HTTPException(status_code=400, detail=f"还有 {missing} 题未作答")

    try:
        trait_scores = compute_trait_scores(body.answers)
        ranked = rank_industries(trait_scores)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    result = AssessmentResult(
        user_id=user.id,
        answers={k: int(v) for k, v in body.answers.items()},
        trait_scores=trait_scores,
        industry_scores=ranked,
        item_count=len(items),
        created_at=utcnow(),
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return _result_out(result)


@router.get("/latest", response_model=AssessmentResultOut | None)
def latest(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = _latest_result(db, user)
    return _result_out(result) if result else None


@router.get("/industries", response_model=list[IndustryListItem])
def list_industries(user: User = Depends(get_current_user)):
    return [
        IndustryListItem(code=i["code"], name=i["name"], tagline=i["tagline"])
        for i in load_industries().values()
    ]


@router.get("/industries/{code}", response_model=IndustryDetailOut)
def industry_detail(code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ind = load_industries().get(code)
    if not ind:
        raise HTTPException(status_code=404, detail="行业不存在")
    meta = {t["code"]: t["name"] for t in load_assessment()["traits"]}

    my_score = None
    my_breakdown = None
    result = _latest_result(db, user)
    if result and result.trait_scores:
        for item in result.industry_scores:
            if item["code"] == code:
                my_score = item["score"]
                break
        my_breakdown = industry_breakdown(ind, result.trait_scores)

    return IndustryDetailOut(
        code=ind["code"],
        name=ind["name"],
        tagline=ind["tagline"],
        description=ind["description"],
        weights=ind["weights"],
        trait_names=meta,
        training_path=ind["training_path"],
        income=ind["income"],
        requirements=ind.get("requirements", []),
        self_checks=ind["self_checks"],
        direction_codes=ind.get("direction_codes") or [],
        my_score=my_score,
        my_breakdown=my_breakdown,
    )


@router.post("/industries/{code}/to-clues")
def industry_to_clues(code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """把行业测评结果转成候选线索（沿用该行业关联的线上方向），供 4 周周期验证。"""
    ind = load_industries().get(code)
    if not ind:
        raise HTTPException(status_code=404, detail="行业不存在")
    direction_codes = ind.get("direction_codes") or []
    if not direction_codes:
        raise HTTPException(
            status_code=400,
            detail=f"「{ind['name']}」以线下验证为主，请先完成行业详情页的 3 条自查任务（线上验证任务在后续版本加入）",
        )
    result = _latest_result(db, user)
    score_text = f"问卷潜力 {result and next((i['score'] for i in result.industry_scores if i['code'] == code), '—')} 分"
    created = []
    for d in direction_codes[:2]:
        existing = (
            db.query(Clue)
            .filter(Clue.user_id == user.id, Clue.direction_code == d, Clue.status.in_(["candidate", "active"]))
            .first()
        )
        if existing:
            continue
        clue = Clue(
            user_id=user.id,
            direction_code=d,
            statement=f"与「{ind['name']}」相关的{load_directions()[d]['name']}优势（{score_text}，来自自答问卷）",
            evidence=f"你在行业潜力测评中给「{ind['name']}」打出了 {score_text}。问卷只是参照，需要通过实践任务验证。",
            based_on=[f"行业潜力测评：{ind['name']}"],
            status="candidate",
        )
        db.add(clue)
        created.append(clue)
    db.commit()
    for c in created:
        db.refresh(c)
    return {
        "clue_ids": [c.id for c in created],
        "message": (
            f"已生成 {len(created)} 条候选线索，去「探测」页勾选并开启 4 周验证周期"
            if created
            else "这些方向已有待验证的线索，直接去「探测」页查看即可"
        ),
    }
