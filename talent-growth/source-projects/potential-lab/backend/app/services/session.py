"""会话凭证：HMAC-SHA256 签名的紧凑令牌（无第三方依赖）。

格式：base64url(payload_json) + "." + hmac_sha256(payload_b64, secret)
payload：{uid, iat, exp, jti}

- 签名令牌在 allow_mock_auth 开关的任何状态下都有效（正式登录唯一凭证形态）；
- 旧版明文 u<id> token 仅在 allow_mock_auth=true 时被 deps 接受（开发兼容）；
- 撤销：User.token_invalid_before 之前的 iat 一律失效（登出/安全重置用）。
"""

import base64
import hashlib
import hmac
import json
import uuid
from datetime import timedelta

from app.utils import utcnow

SESSION_DAYS_DEFAULT = 30


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _sign(payload_b64: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()


def issue_session_token(user_id: int, secret: str, days: int = SESSION_DAYS_DEFAULT) -> tuple[str, dict]:
    """签发会话令牌。返回 (token, payload)。"""
    now = utcnow()
    payload = {
        "uid": user_id,
        "iat": now.timestamp(),
        "exp": (now + timedelta(days=days)).timestamp(),
        "jti": uuid.uuid4().hex,
        "v": 1,  # 凭证格式版本
    }
    payload_b64 = _b64encode(json.dumps(payload, separators=(",", ":")).encode())
    return f"{payload_b64}.{_sign(payload_b64, secret)}", payload


def verify_session_token(token: str, secret: str) -> dict | None:
    """校验签名与有效期。合法返回 payload；任何问题返回 None（调用方转 401）。"""
    try:
        payload_b64, sig = token.rsplit(".", 1)
    except ValueError:
        return None
    expected = _sign(payload_b64, secret)
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_b64decode(payload_b64))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("v") != 1 or "uid" not in payload or "exp" not in payload or "iat" not in payload:
        return None
    if payload["exp"] < utcnow().timestamp():
        return None
    return payload
