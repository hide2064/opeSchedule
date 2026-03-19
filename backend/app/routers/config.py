# /api/v1/config エンドポイント。
# アプリ全体のグローバル設定（表示モード・祝日・テーマ等）を取得・更新する API を提供する。
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.config import Config
from app.schemas.config import ConfigResponse, ConfigUpdate
from app.utils import commit_and_refresh

router = APIRouter(tags=["config"])


def get_or_create_config(db: Session) -> Config:
    # シングルトンパターンで Config レコードを取得する。
    # アプリ起動直後など Config テーブルがまだ空の場合は、
    # id=1 のレコードをデフォルト値で作成してから返す。
    # これにより GET /config を初回呼び出し時でも安全に動作させる。
    config = db.get(Config, 1)
    if config is None:
        config = Config(id=1)
        db.add(config)
        commit_and_refresh(db, config)
    return config


@router.get("/config", response_model=ConfigResponse)
def get_config(db: Session = Depends(get_db)) -> Config:
    return get_or_create_config(db)


@router.patch("/config", response_model=ConfigResponse)
def update_config(payload: ConfigUpdate, db: Session = Depends(get_db)) -> Config:
    config = get_or_create_config(db)
    update_data = payload.model_dump(exclude_none=True)

    # holiday_dates is stored as JSON string
    # リクエストでは list[str] で受け取るが、DB の TEXT カラムには
    # JSON 文字列として保存する必要があるため json.dumps で変換する。
    if "holiday_dates" in update_data:
        update_data["holiday_dates"] = json.dumps(update_data["holiday_dates"])

    for field, value in update_data.items():
        setattr(config, field, value)

    return commit_and_refresh(db, config)
