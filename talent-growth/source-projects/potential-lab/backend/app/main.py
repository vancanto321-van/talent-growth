"""天赋实验室 API 入口。

启动流程：校验种子内容 → 建表 → 挂载路由。
开发运行：cd backend && uv run uvicorn app.main:app --reload --port 8000
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

try:
    with open("VERSION", encoding="utf-8") as vf:
        APP_VERSION = vf.read().strip()
except FileNotFoundError:
    APP_VERSION = "dev"
from app.content_loader import validate_all
from app.database import Base, engine, run_migrations
from app.routers import assessment, auth, billing, child, cycles, directions, explore, gamification, me, methodology, plans, profile, reminders, tasks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.1.0")
    # 小程序没有跨域问题；开放 CORS 是为了 H5 开发态（浏览器直连本地后端）
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 生产配置守卫：关闭模拟身份时仍用开发默认密钥 → 明确拒绝启动
    if not settings.allow_mock_auth and settings.secret_key == "dev-secret-change-me":
        raise RuntimeError(
            "拒绝启动：ALLOW_MOCK_AUTH=false 但 SECRET_KEY 仍是开发默认值。"
            "请在环境变量中设置强随机 SECRET_KEY 后重试。"
        )

    validate_all()
    run_migrations(engine)
    Base.metadata.create_all(engine)

    app.include_router(auth.router)
    app.include_router(explore.router)
    app.include_router(directions.router)
    app.include_router(cycles.router)
    app.include_router(tasks.router)
    app.include_router(plans.router)
    app.include_router(profile.router)
    app.include_router(assessment.router)
    app.include_router(child.router)
    app.include_router(billing.router)
    app.include_router(gamification.router)
    app.include_router(methodology.router)
    app.include_router(reminders.router)
    app.include_router(me.router)

    @app.get("/")
    def root():
        return {
            "app": settings.app_name,
            "version": APP_VERSION,
            "ai_provider": settings.ai_provider,
            "evaluation_kind": "mock" if settings.ai_provider == "mock" else "real",
            "docs": "/docs",
        }

    logger.info("应用初始化完成（AI provider=%s）", settings.ai_provider)
    return app


app = create_app()
