# DB 接続・セッション管理モジュール。
# SQLAlchemy の Engine / SessionLocal / Base を生成し、
# FastAPI の DI（Depends）で使用する get_db ジェネレータを提供する。
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# SQLite requires connect_args for thread safety in FastAPI
# SQLite はデフォルトで同一スレッドからのみ接続を許可する。
# FastAPI は非同期・マルチスレッド環境で動作するため、
# check_same_thread=False を指定してスレッド安全性の制限を解除する。
# PostgreSQL など他の DB では不要なため SQLite 時のみ設定する。
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)

# Enable WAL mode for SQLite (better concurrent read performance)
# SQLite の場合のみ、接続時に PRAGMA を設定してデータベースの挙動を調整する。
if settings.DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        # WAL（Write-Ahead Logging）モードを有効にする。
        # デフォルトの DELETE ジャーナルモードと比べ、読み込みと書き込みが
        # 並行して行えるため、同時アクセス時のパフォーマンスが向上する。
        cursor.execute("PRAGMA journal_mode=WAL")
        # SQLite は外部キー制約がデフォルトで無効のため、明示的に有効化する。
        # これにより CASCADE DELETE 等の参照整合性制約が正しく機能する。
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# DB セッションファクトリ。
# autocommit=False により明示的なコミット（db.commit()）が必要となり、
# トランザクションの境界を開発者が制御できる。
# autoflush=False は Depends 経由で受け取ったセッションが
# 予期しないタイミングで flush されるのを防ぐ。
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# 全 ORM モデルの基底クラス。
# models/ 配下の各モデルクラスはこの Base を継承することで
# SQLAlchemy のメタデータ管理下に置かれる。
class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    # FastAPI の Depends で DI されるジェネレータ関数。
    # リクエストごとに新しい DB セッションを生成し、yield で呼び出し元に渡す。
    # finally ブロックにより、正常終了・例外発生を問わず必ずセッションをクローズし、
    # コネクションプールへのリソース返却を保証する。
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
