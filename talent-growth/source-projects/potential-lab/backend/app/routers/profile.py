"""优势画像：五维呈现，只和自己比；组合建议 + 固定的诚实声明。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.content_loader import directions
from app.models import Clue, ExplorationCycle, User
from app.schemas import ProfileOut
from app.services.ai.base import AIError, get_ai
from app.services.planning import week_index_for
from app.services.scoring import build_clue_profile, match_combinations

router = APIRouter(prefix="/api/profile", tags=["profile"])

HONESTY_NOTE = (
    "本画像只比较你自己的不同阶段，不输出「超过多少人」的名次。"
    "「线索」表示仅来自自述；「初步」表示有少量任务证据；「较充分」表示独立完成成绩和真实读者反馈都到位。"
    "进步只是值得继续探索的证据，不能自动归因于先天因素。"
)


@router.get("", response_model=ProfileOut)
def profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cycle = (
        db.query(ExplorationCycle)
        .filter(ExplorationCycle.user_id == user.id, ExplorationCycle.status == "active")
        .first()
    )
    clues = db.query(Clue).filter(Clue.user_id == user.id, Clue.status == "active").all() if cycle else []
    clue_profiles = [build_clue_profile(db, c) for c in clues]

    direction_codes = [c.direction_code for c in clues]
    combos = match_combinations(direction_codes)
    reading = ""
    if combos:
        try:
            names = [directions()[code]["name"] for code in direction_codes]
            reading = get_ai().combination_reading(combos, names)
        except AIError:
            reading = ""
    combinations_out = [
        {
            "abilities": c["abilities"],
            "paths": c["paths"],
            "why": c["why"],
            "how_to_start": c["how_to_start"],
        }
        for c in combos
    ]

    week = week_index_for(cycle) if cycle else None
    return ProfileOut(
        cycle_week=week,
        clues=clue_profiles,
        combinations=combinations_out,
        reading=reading,
        note=HONESTY_NOTE,
    )
