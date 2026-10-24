"""公共依赖：从 Bearer token 解析当前用户。

两条凭证通道：
1. 签名会话（app/services/session.py）——正式与开发期通用，支持过期与撤销；
2. 旧明文 u<id> 令牌——仅 ALLOW_MOCK_AUTH=true 时兼容（开发期），上线态一律拒绝。
"""

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.services.session import verify_session_token


def _load_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少登录凭证")
    token = authorization[len("Bearer ") :].strip()

    # 通道一：签名会话（正式凭证，不受 ALLOW_MOCK_AUTH 影响）
    if "." in token:
        payload = verify_session_token(token, settings.secret_key)
        if payload is None:
            raise HTTPException(status_code=401, detail="会话已过期或无效，请重新登录")
        user = _load_user(db, int(payload["uid"]))
        invalid_before = user.token_invalid_before
        if invalid_before is not None and payload["iat"] <= invalid_before.timestamp():
            raise HTTPException(status_code=401, detail="会话已撤销，请重新登录")
        return user

    # 通道二：旧明文 u<id> 令牌（仅开发期兼容；上线态一律拒绝）
    if not settings.allow_mock_auth:
        raise HTTPException(status_code=401, detail="凭证无效")
    if not token.startswith("u"):
        raise HTTPException(status_code=401, detail="凭证无效")
    try:
        user_id = int(token[1:])
    except ValueError as e:
        raise HTTPException(status_code=401, detail="凭证无效") from e
    return _load_user(db, user_id)
