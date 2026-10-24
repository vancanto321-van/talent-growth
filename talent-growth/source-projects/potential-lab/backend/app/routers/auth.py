"""认证：正式微信登录 + 会话管理，开发期模拟登录。

会话：HMAC 签名令牌（app/services/session.py），默认 30 天有效，
可通过 logout 撤销（User.token_invalid_before 之前的令牌全部失效）。

ALLOW_MOCK_AUTH 开关语义：
- true（开发期）：mock-login 可用，旧明文 u<id> 令牌兼容接受；
- false（上线态）：mock-login 返回 403，明文令牌一律拒绝；
  微信登录签发的签名会话不受影响——正式用户不会被误伤。
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import MockLoginRequest, TokenResponse, WxLoginRequest
from app.services.session import issue_session_token
from app.utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _session_response(user: User, is_new: bool) -> TokenResponse:
    token, payload = issue_session_token(
        user.id, settings.secret_key, settings.session_expire_days
    )
    return TokenResponse(
        token=token,
        user_id=user.id,
        nickname=user.nickname,
        is_new=is_new,
        expires_at=datetime_from_ts(payload["exp"]),
        auth_method="mock" if user.auth_method == "mock" else "wechat",
    )


def datetime_from_ts(ts: float):
    from datetime import datetime, timezone

    return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None).isoformat() + "Z"


@router.post("/mock-login", response_model=TokenResponse, include_in_schema=settings.allow_mock_auth)
def mock_login(body: MockLoginRequest, db: Session = Depends(get_db)):
    """开发/演示用：直接建号发会话。ALLOW_MOCK_AUTH=false 时返回 403。"""
    if not settings.allow_mock_auth:
        raise HTTPException(status_code=403, detail="模拟登录已关闭，请使用微信登录")
    user = User(
        nickname=body.nickname[:64],
        age_band=body.age_band[:32],
        created_at=utcnow(),
        auth_method="mock",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _session_response(user, is_new=True)


@router.post("/wx-login", response_model=TokenResponse)
def wx_login(body: WxLoginRequest, db: Session = Depends(get_db)):
    """正式微信登录：code → code2session → 找到或创建用户 → 签发会话。

    首次用户自动建号（is_new=true），已有用户按 openid 识别返回同一账号。
    此接口不受 ALLOW_MOCK_AUTH 影响——它是正式凭证通道。
    """
    if not (settings.wx_appid and settings.wx_secret):
        raise HTTPException(status_code=400, detail="后端未配置微信 AppID/Secret，开发期请使用模拟登录")
    openid = _code2session(body.code)

    user = db.query(User).filter(User.open_id == openid).first()
    is_new = user is None
    if is_new:
        user = User(
            open_id=openid,
            nickname=body.nickname[:64] or "微信用户",
            age_band=body.age_band[:32],
            created_at=utcnow(),
            auth_method="wechat",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return _session_response(user, is_new=is_new)


def _code2session(code: str) -> str:
    """调用微信 code2session，返回 openid。独立成函数便于测试替身。"""
    try:
        resp = httpx.get(
            "https://api.weixin.qq.com/sns/jscode2session",
            params={
                "appid": settings.wx_appid,
                "secret": settings.wx_secret,
                "js_code": code,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        logger.warning("code2session 异常：%s", e)
        raise HTTPException(status_code=502, detail="微信登录服务暂不可用") from e
    if "openid" not in data:
        raise HTTPException(status_code=401, detail=f"微信登录失败：{data.get('errmsg', data)}")
    return data["openid"]


@router.post("/logout")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """登出：撤销该用户当前之前签发的所有会话（含本设备与其他设备）。"""
    user.token_invalid_before = utcnow()
    db.commit()
    return {"logged_out": True}
