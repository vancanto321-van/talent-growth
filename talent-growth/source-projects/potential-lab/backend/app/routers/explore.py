"""探测访谈：脚本化问题 + AI 抽取候选线索（每条必带依据，可回溯原话）。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.content_loader import directions, interview, item_rationales
from app.models import Clue, InterviewSession, User
from app.schemas import ClueOut, InterviewFinishRequest, InterviewQuestion
from app.services.ai.base import AIAdapter, AIError, get_ai
from app.utils import utcnow

router = APIRouter(prefix="/api/explore", tags=["explore"])


def _clue_out(clue: Clue) -> ClueOut:
    d = directions().get(clue.direction_code)
    return ClueOut(
        id=clue.id,
        direction_code=clue.direction_code,
        direction_name=d["name"] if d else clue.direction_code,
        statement=clue.statement,
        evidence=clue.evidence,
        based_on=clue.based_on or [],
        status=clue.status,
    )


@router.get("/questions", response_model=list[InterviewQuestion])
def get_questions(user: User = Depends(get_current_user)):
    rationales = item_rationales()["interview"]
    return [
        InterviewQuestion(**q, why=rationales.get(q["code"], ""))
        for q in interview()["questions"]
    ]


@router.post("/finish", response_model=list[ClueOut])
def finish_interview(body: InterviewFinishRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    questions = {q["code"]: q for q in interview()["questions"]}
    messages = []
    for a in body.answers:
        q = questions.get(a.code)
        if not q:
            raise HTTPException(status_code=400, detail=f"未知的问题编号：{a.code}")
        if a.text.strip():
            messages.append({"code": a.code, "category": q["category"], "question": q["text"], "answer": a.text.strip()})
    if not messages:
        raise HTTPException(status_code=400, detail="至少回答一个问题才能生成线索")

    session = InterviewSession(user_id=user.id, messages=messages, status="finished", created_at=utcnow())

    try:
        adapter: AIAdapter = get_ai()
        extraction = adapter.extract_clues(messages)
        session.extraction = extraction.model_dump()
    except AIError as e:
        # 真实 AI 不可用时降级到本地模拟抽取，保证流程可用（结果会带模拟标记语义）
        session.extraction = {"degraded": True, "error": str(e)}
        db.add(session)
        db.commit()
        raise HTTPException(status_code=503, detail=f"AI 暂不可用：{e}。请稍后重试或切换 AI_PROVIDER=mock") from e

    db.add(session)
    db.flush()

    clues: list[Clue] = []
    seen = set()
    for c in extraction.clues:
        if c.direction_code not in directions() or c.direction_code in seen:
            continue
        seen.add(c.direction_code)
        clue = Clue(
            user_id=user.id,
            session_id=session.id,
            direction_code=c.direction_code,
            statement=c.statement,
            evidence=c.evidence,
            based_on=c.based_on,
            status="candidate",
        )
        db.add(clue)
        clues.append(clue)
    if not clues:
        raise HTTPException(status_code=422, detail="这次访谈没有提炼出有效线索，换个例子再聊聊试试")
    db.commit()
    for c in clues:
        db.refresh(c)
    return [_clue_out(c) for c in clues]
