# FastAPI アプリケーションのエントリポイント。
# アプリインスタンスの生成・ミドルウェア設定・ルーター登録・静的ファイル配信を行う。
import logging
import logging.handlers
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, engine
from app.routers import annotations, comments, config, import_export, projects, snapshots, tasks

# ── ログ設定 ────────────────────────────────────────────────────────────────
# ログ出力先ディレクトリを作成する（存在する場合は何もしない）。
# main.py は backend/ で実行されるため、LOG_DIR は backend/logs/ を指す。
_log_dir = Path(__file__).parent.parent / settings.LOG_DIR
_log_dir.mkdir(parents=True, exist_ok=True)

# RotatingFileHandler: 10 MB を超えたらローテーション、最大 5 世代保持する。
# UTF-8 エンコーディングで日本語を含むログを正しく書き出す。
_file_handler = logging.handlers.RotatingFileHandler(
    _log_dir / "app.log",
    maxBytes=10 * 1024 * 1024,  # 10 MB
    backupCount=5,
    encoding="utf-8",
)
_log_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
_file_handler.setFormatter(_log_fmt)

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),  # コンソール出力（既存）
        _file_handler,            # ファイル出力（新規: backend/logs/app.log）
    ],
)
logger = logging.getLogger(__name__)


# アプリケーションの起動・終了時処理を管理するコンテキストマネージャ。
# yield より前が起動時処理、yield より後が終了時処理に対応する。
# 開発環境（APP_ENV=development）では ORM の create_all で DB テーブルを自動作成する。
# 本番環境では Alembic マイグレーション（alembic upgrade head）が DB スキーマ管理を担うため、
# create_all は実行しない。
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

# フロントエンドからの API 呼び出しを許可するための CORS 設定。
# フロントエンドと API が同一オリジン（localhost:8000）で動作する場合は
# 通常 CORS は不要だが、開発時に異なるポートから接続する場合に役立つ。
# 許可オリジンは settings.cors_origins_list（CORS_ORIGINS 環境変数）で制御する。
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
    # DB への実際の接続確認を行い、接続できなければ degraded を返す。
    # ECS タスクのヘルスチェックや ALB のターゲットグループ監視に対応する。
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
# 各ルーターを /api/v1 プレフィックスで登録する。
# ルーターを先に登録することで、後続の静的ファイルマウントが
# API パスを横取りしないよう順序を保証する。
app.include_router(config.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(comments.router, prefix="/api/v1")
app.include_router(annotations.router, prefix="/api/v1")
app.include_router(snapshots.router, prefix="/api/v1")
app.include_router(import_export.router, prefix="/api/v1")

# ── Frontend static files ──────────────────────────────────────────────────
# React SPA のルーティング対応:
# /assets/* などの静的ファイルは StaticFiles で直接返す。
# それ以外の未知パス（/schedule 等）は 404 ハンドラで index.html を返すことで
# React Router (BrowserRouter) がクライアント側でルーティングを処理できる。
from fastapi.requests import Request
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

frontend_path = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_path.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_path / "assets")), name="assets")

    @app.exception_handler(StarletteHTTPException)
    async def spa_fallback(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404 and not request.url.path.startswith("/api"):
            return FileResponse(str(frontend_path / "index.html"))
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
