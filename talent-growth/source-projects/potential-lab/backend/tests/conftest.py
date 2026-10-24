"""测试夹具：内存数据库 + 独立内容校验。"""

import os
import sys

# 保证从 backend 目录运行 pytest 时能导入 app 包
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import Base, get_db  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture()
def client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth_headers(client):
    resp = client.post("/api/auth/mock-login", json={"nickname": "测试用户", "age_band": "26-35"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def full_cycle(client, auth_headers):
    """走完 访谈 → 选方向建周期，返回 (headers, cycle)。"""
    answers = [
        {"code": "q_learn_fast", "text": "我给同事解释业务规则特别顺，他们说我讲得比文档清楚。之前没学过教学，就是工作里常讲。"},
        {"code": "q_asked_for_help", "text": "同事经常找我帮忙分析数据报表，找问题原因，我拆解过几个大问题。"},
        {"code": "q_repeat_willingly", "text": "我愿意反复折腾脚本自动化，配置软件，遇到报错也想调通。"},
        {"code": "q_lose_track", "text": "写 python 脚本的时候会忘记时间。"},
        {"code": "q_untried", "text": "想学画画和设计，一直没机会。"},
        {"code": "q_time_budget", "text": "上班族，每周大概 5 小时。"},
    ]
    resp = client.post("/api/explore/finish", json={"answers": answers}, headers=auth_headers)
    assert resp.status_code == 200
    clues = resp.json()
    clue_ids = [c["id"] for c in clues][:3]
    resp = client.post("/api/cycles/start", json={"clue_ids": clue_ids}, headers=auth_headers)
    assert resp.status_code == 200
    return auth_headers, resp.json()
