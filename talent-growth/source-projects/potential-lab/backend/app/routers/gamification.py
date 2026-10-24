"""游戏化状态查询：XP、连击、每日目标、成就墙、吉祥物台词。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.services.gamification import me_payload

router = APIRouter(prefix="/api/gamification", tags=["gamification"])


@router.get("/me")
def my_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return me_payload(db, user)
