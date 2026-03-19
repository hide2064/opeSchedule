# アプリケーション設定モジュール。
# pydantic-settings を使用して .env ファイルおよび環境変数から設定値を読み込む。
# Settings クラスがアプリ全体の設定値を保持し、末尾の settings インスタンスを通じて参照する。
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 接続先 DB の URL。
    # 開発環境ではデフォルト値の SQLite を使用し、本番環境では
    # 環境変数 DATABASE_URL に PostgreSQL の接続文字列を設定して切り替える。
    DATABASE_URL: str = "sqlite:///./opeschedule.db"

    # アプリケーションの動作モード（development / production など）。
    # "development" の場合、起動時に ORM で DB テーブルの自動作成が実行される。
    # 本番環境では Alembic マイグレーションが DB スキーマ管理を担う。
    APP_ENV: str = "development"

    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # CORS で許可するオリジンをカンマ区切りの文字列で指定する。
    # 複数オリジンを許可する場合は "http://localhost:8000,https://example.com" のように記述する。
    CORS_ORIGINS: str = "http://localhost:8000"

    @property
    def cors_origins_list(self) -> list[str]:
        # カンマ区切りの CORS_ORIGINS 文字列を list[str] に変換して返す。
        # FastAPI の CORSMiddleware は list を期待するためこのプロパティを経由する。
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


# モジュールレベルのシングルトンインスタンス。
# アプリ全体から `from app.config import settings` で参照することで
# 設定値を一元管理する。
settings = Settings()
