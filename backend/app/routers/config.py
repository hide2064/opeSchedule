import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.config import Config
from app.schemas.config import ConfigResponse, ConfigUpdate

router = APIRouter(tags=["config"])


def get_or_create_config(db: Session) -> Config:
    config = db.get(Config, 1)
    if config is None:
        config = Config(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get("/config", response_model=ConfigResponse)
def get_config(db: Session = Depends(get_db)) -> Config:
    return get_or_create_config(db)


@router.patch("/config", response_model=ConfigResponse)
def update_config(payload: ConfigUpdate, db: Session = Depends(get_db)) -> Config:
    config = get_or_create_config(db)
    update_data = payload.model_dump(exclude_none=True)

    # holiday_dates is stored as JSON string
    if "holiday_dates" in update_data:
        update_data["holiday_dates"] = json.dumps(update_data["holiday_dates"])

    for field, value in update_data.items():
        setattr(config, field, value)

    db.commit()
    db.refresh(config)
    return config
