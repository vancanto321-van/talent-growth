# 天赋实验室后端镜像
FROM python:3.12-slim

# sqlite3 供容器内备份/校验；TZ 与宿主一致便于日志排查
RUN apt-get update \
    && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖（利用层缓存），再拷代码
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.30" \
    "sqlalchemy>=2.0" \
    "pydantic>=2.7" \
    "pydantic-settings>=2.3" \
    "pyyaml>=6.0" \
    "httpx>=0.27"

COPY app ./app
COPY content ./content
COPY VERSION ./VERSION

# SQLite 落在挂载卷 /data（compose 挂载持久化）
ENV DATABASE_URL=sqlite:////data/potential_lab.db
VOLUME ["/data"]

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
