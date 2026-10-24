"""内容安全：用户输入与 AI 输出双向检查。

- 开发期：本地关键词兜底（示例级别，仅用于流程验证）；
- 上线后：配置 WX_APPID/WX_SECRET 后自动启用微信 msgSecCheck（服务端调用），
  正式环境还应叠加腾讯云天御等专业内容安全服务（见 docs/compliance.md）。
"""

import logging
import time

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# 示例黑名单：仅演示拦截逻辑；正式上线以 msgSecCheck/天御为准，不放真实词表
_LOCAL_BLOCKLIST = ["赌博", "枪支买卖", "毒品交易", "代考", "洗钱"]

_token_cache: dict = {"token": "", "expires_at": 0.0}


def _wx_access_token() -> str | None:
    if not (settings.wx_appid and settings.wx_secret):
        return None
    if _token_cache["token"] and time.time() < _token_cache["expires_at"]:
        return _token_cache["token"]
    try:
        resp = httpx.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={
                "grant_type": "client_credential",
                "appid": settings.wx_appid,
                "secret": settings.wx_secret,
            },
            timeout=10,
        )
        data = resp.json()
        if "access_token" in data:
            _token_cache["token"] = data["access_token"]
            _token_cache["expires_at"] = time.time() + int(data.get("expires_in", 7200)) - 120
            return _token_cache["token"]
        logger.warning("获取微信 access_token 失败：%s", data)
    except Exception as e:  # noqa: BLE001 —— 安全检查失败不能阻塞主流程
        logger.warning("获取微信 access_token 异常：%s", e)
    return None


def _local_check(text: str) -> tuple[bool, str]:
    low = text.lower()
    for word in _LOCAL_BLOCKLIST:
        if word in low:
            return False, f"内容包含不允许的表述（{word}），请修改后重新提交。"
    return True, ""


def check_text(text: str, user_open_id: str | None = None) -> tuple[bool, str]:
    """返回 (是否通过, 原因)。本地检查始终执行；配置微信后叠加 msgSecCheck。"""
    ok, reason = _local_check(text)
    if not ok:
        return ok, reason

    token = _wx_access_token()
    if token:
        try:
            resp = httpx.post(
                "https://api.weixin.qq.com/wxa/msg_sec_check",
                params={"access_token": token},
                json={"content": text[:2500], "openid": user_open_id or "", "scene": 2},
                timeout=10,
            )
            data = resp.json()
            # errcode 0 且 result.suggest 为 pass 才放行；接口异常时保守放行并记录
            if data.get("errcode") == 0 and data.get("result", {}).get("suggest") not in (None, "pass"):
                return False, "内容未通过安全检查，请修改后重新提交。"
        except Exception as e:  # noqa: BLE001
            logger.warning("msgSecCheck 调用异常：%s", e)
    return True, ""
