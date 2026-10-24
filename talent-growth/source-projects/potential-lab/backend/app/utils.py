from datetime import datetime, timezone


def utcnow() -> datetime:
    """统一的朴素 UTC 时间（SQLite 存取无时区，全部用 naive UTC 避免混用）。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)
