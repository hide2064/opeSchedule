import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, engine
from app.routers import config, import_export, projects, tasks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 開発環境: テーブルを自動作成（本番は Alembic が担当）
    if settings.APP_ENV == "development":
        Base.metadata.create_all(bind=engine)
        logger.info("DB tables ensured (development mode)")
    logger.info("opeSchedule API started (env=%s)", settings.APP_ENV)
    yield
    logger.info("opeSchedule API shutting down")


app = FastAPI(
    title="opeSchedule API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Health check ───────────────────────────────────────────────────────────
from datetime import datetime, timezone
from sqlalchemy import text
from app.database import SessionLocal

@app.get("/health", tags=["system"])
def health_check() -> dict:
    """ECS / ALB ヘルスチェック用エンドポイント"""
    db_ok = False
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        logger.warning("DB health check failed: %s", e)

    return {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else "error",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "0.1.0",
    }

# ── API routers ────────────────────────────────────────────────────────────
app.include_router(config.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(import_export.router, prefix="/api/v1")

# ── Frontend static files ──────────────────────────────────────────────────
frontend_path = Path(__file__).parent.parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
