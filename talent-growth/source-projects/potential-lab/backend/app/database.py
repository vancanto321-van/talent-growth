from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


# 升级迁移：已有库自动补新增列（SQLite ALTER TABLE ADD COLUMN 可复现）。
# 全新库由 create_all 直接建出最新结构，这里逐条幂等跳过。
_MIGRATIONS = [
    ("users", "token_invalid_before", "ALTER TABLE users ADD COLUMN token_invalid_before DATETIME"),
    ("users", "auth_method", "ALTER TABLE users ADD COLUMN auth_method VARCHAR(16) DEFAULT ''"),
    ("evaluations", "superseded", "ALTER TABLE evaluations ADD COLUMN superseded BOOLEAN DEFAULT 0"),
    ("evaluations", "ai_model", "ALTER TABLE evaluations ADD COLUMN ai_model VARCHAR(64) DEFAULT ''"),
    ("evaluations", "prompt_version", "ALTER TABLE evaluations ADD COLUMN prompt_version VARCHAR(32) DEFAULT ''"),
    ("orders", "scope_id", "ALTER TABLE orders ADD COLUMN scope_id INTEGER"),
]


def run_migrations(engine) -> None:
    with engine.connect() as conn:
        for table, column, ddl in _MIGRATIONS:
            cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")]
            if cols and column not in cols:
                conn.exec_driver_sql(ddl)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
