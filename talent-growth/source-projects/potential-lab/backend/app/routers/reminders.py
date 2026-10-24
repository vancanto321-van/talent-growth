"""提醒订阅：记录用户的订阅意向（每周计划提醒、连击抢救提醒）。

微信订阅消息机制：用户在小程序内通过 wx.requestSubscribeMessage 主动订阅一次，
开发者才能下发一条消息。本模块负责记录订阅意向；正式下发需要一个定时任务
（建议每周一早 8 点查达到期计划的用户，按模板 ID 调微信接口推送），
部署方案见 docs/compliance.md 的支付与订阅消息上线章节。
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import PushSubscription, User

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


class SubscribeRequest(BaseModel):
    kind: Literal["weekly_plan", "streak_rescue"] = "weekly_plan"
    template_id: str = Field(default="", max_length=64)


@router.get("/status")
def status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    template_id = settings.wx_weekly_reminder_template_id
    subscribed = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.user_id == user.id,
            PushSubscription.kind == "weekly_plan",
            PushSubscription.template_id == template_id,
        )
        .first()
        is not None
    )
    return {
        "available": bool(template_id),
        "template_id": template_id,
        "subscribed": subscribed,
    }


@router.post("/subscribe")
def subscribe(body: SubscribeRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not settings.wx_weekly_reminder_template_id:
        raise HTTPException(status_code=400, detail="提醒功能尚未开启（未配置模板 ID）")
    exists = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.user_id == user.id,
            PushSubscription.kind == body.kind,
            PushSubscription.template_id == body.template_id,
        )
        .first()
    )
    if not exists:
        db.add(
            PushSubscription(
                user_id=user.id,
                kind=body.kind[:32],
                template_id=body.template_id[:64],
            )
        )
        db.commit()
    return {"subscribed": True, "message": "已订阅，每周一早 8 点会提醒你开始新一周的计划"}
