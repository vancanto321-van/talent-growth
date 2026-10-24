"""探索周期：选 ≤3 个方向开 4 周验证循环；结业生成报告；活跃线索转为 completed 可复用。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Clue, CycleReport, ExplorationCycle, User
from app.schemas import CycleOut, CycleReportOut, CycleStartRequest
from app.services.ai.base import AIAdapter, AIError, get_ai
from app.services.billing import has_entitlement
from app.services.cycle_report import build_report, one_liner_for
from app.services.gamification import award
from app.services.planning import ensure_current_plan
from app.utils import utcnow

router = APIRouter(prefix="/api/cycles", tags=["cycles"])


def _report_out(db: Session, user: User, report: CycleReport) -> CycleReportOut:
    unlocked = has_entitlement(db, user, "cycle_report", scope_id=report.cycle_id)
    payload = report.payload or {}
    return CycleReportOut(
        id=report.id,
        cycle_id=report.cycle_id,
        finished_at=report.created_at.isoformat(),
        locked=not unlocked,
        price_cents=settings.price_cycle_report_cents,
        verdicts=payload.get("verdicts", []) if unlocked else _preview_verdicts(payload, db),
        next=payload.get("next", {}) if unlocked else {},
        summary=(report.ai_summary or "") if unlocked else "",
        suggested_clue_ids=payload.get("next", {}).get("suggested_clue_ids", []) if unlocked else [],
    )


def _preview_verdicts(payload: dict, db: Session | None = None) -> list[dict]:
    """锁定态免费层：五维判定结论 + 每方向 1 句解读 + ≤2 条用户原话证据。

    免费不给的：判定依据（reasons）、未验证清单（unverified）、
    36 任务验证明细、下期计划、AI 总结——这些付费解锁。
    兼容旧报告快照：one_liner/quotes 缺失时现场补齐（quotes 尽量从线索原话回填）。
    """
    out = []
    for v in payload.get("verdicts", []):
        quotes = [q for q in (v.get("quotes") or []) if q]
        if not quotes and db is not None:
            clue = db.get(Clue, v.get("clue_id") or 0)
            if clue is not None:
                quotes = [(q or "")[:60] for q in (clue.based_on or []) if (q or "").strip()][:2]
        out.append(
            {
                "clue_id": v.get("clue_id"),
                "direction_code": v.get("direction_code"),
                "direction_name": v.get("direction_name"),
                "statement": v.get("statement", ""),
                "verdict": v.get("verdict"),
                "emoji": v.get("emoji"),
                "preview_reading": v.get("one_liner") or one_liner_for(v.get("verdict", "")),
                "quotes": quotes,
                "reasons": [],
                "evidence_level": v.get("evidence_level", ""),
                "evidence_detail": "解锁后查看完整依据",
                "current": None,
                "task_count": v.get("task_count", 0),
                "unverified": [],
            }
        )
    return out


@router.post("/start", response_model=CycleOut)
def start_cycle(body: CycleStartRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    active = db.query(ExplorationCycle).filter(ExplorationCycle.user_id == user.id, ExplorationCycle.status == "active").first()
    if active:
        raise HTTPException(status_code=400, detail="已有进行中的探索周期，先完成或结束它")

    # candidate（新线索）与 completed（往期已验证）都可以再次选用
    clues = (
        db.query(Clue)
        .filter(Clue.user_id == user.id, Clue.id.in_(body.clue_ids), Clue.status.in_(["candidate", "completed"]))
        .all()
    )
    if len(clues) != len(body.clue_ids):
        raise HTTPException(status_code=404, detail="部分线索不存在或不可用")
    codes = {c.direction_code for c in clues}
    if len(codes) != len(clues):
        raise HTTPException(status_code=400, detail="同一方向选了多条线索，请按方向去重")

    cycle = ExplorationCycle(user_id=user.id)
    db.add(cycle)
    db.flush()
    for c in clues:
        c.status = "active"
        c.cycle_id = cycle.id
    db.commit()
    db.refresh(cycle)
    ensure_current_plan(db, user.id, cycle)  # 直接生成第 1 周计划
    award(db, user, "cycle_start")
    return CycleOut(
        id=cycle.id,
        weeks=cycle.weeks,
        started_at=cycle.started_at.isoformat(),
        clue_ids=[c.id for c in clues],
        status=cycle.status,
    )


@router.get("/current", response_model=CycleOut | None)
def current_cycle(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cycle = db.query(ExplorationCycle).filter(ExplorationCycle.user_id == user.id, ExplorationCycle.status == "active").first()
    if not cycle:
        return None
    clue_ids = [c.id for c in db.query(Clue).filter(Clue.cycle_id == cycle.id).all()]
    return CycleOut(
        id=cycle.id,
        weeks=cycle.weeks,
        started_at=cycle.started_at.isoformat(),
        clue_ids=clue_ids,
        status=cycle.status,
    )


@router.post("/abandon")
def abandon_cycle(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """放弃当前周期（不生成报告）：用于内容更新导致无法结业等极端情况的逃生通道。"""
    cycle = (
        db.query(ExplorationCycle)
        .filter(ExplorationCycle.user_id == user.id, ExplorationCycle.status == "active")
        .first()
    )
    if not cycle:
        raise HTTPException(status_code=404, detail="没有进行中的周期")
    cycle.status = "finished"
    cycle.finished_at = utcnow()
    db.query(Clue).filter(Clue.cycle_id == cycle.id, Clue.status == "active").update({"status": "archived"})
    db.commit()
    return {"abandoned": True, "cycle_id": cycle.id}


@router.post("/finish", response_model=CycleReportOut)
def finish_cycle(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """结业：生成报告快照、结束周期、活跃线索转为 completed（可再次选用）。"""
    cycle = (
        db.query(ExplorationCycle)
        .filter(ExplorationCycle.user_id == user.id, ExplorationCycle.status == "active")
        .first()
    )
    if not cycle:
        raise HTTPException(status_code=404, detail="没有进行中的周期")

    payload = build_report(db, user.id, cycle)
    ai_summary = ""
    try:
        adapter: AIAdapter = get_ai()
        ai_summary = adapter.cycle_summary(payload)
    except AIError:
        ai_summary = ""

    cycle.status = "finished"
    cycle.finished_at = utcnow()
    db.query(Clue).filter(Clue.cycle_id == cycle.id, Clue.status == "active").update({"status": "completed"})

    report = CycleReport(
        user_id=user.id,
        cycle_id=cycle.id,
        payload=payload,
        ai_summary=ai_summary,
        created_at=utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _report_out(db, user, report)


@router.get("/report/{cycle_id}", response_model=CycleReportOut)
def get_report(cycle_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = (
        db.query(CycleReport)
        .filter(CycleReport.user_id == user.id, CycleReport.cycle_id == cycle_id)
        .order_by(CycleReport.created_at.desc(), CycleReport.id.desc())
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="该周期还没有结业报告")
    return _report_out(db, user, report)
