"""共通ユーティリティ関数。

複数のルーターで同一パターンが繰り返されていた処理を集約する。
新しいルーターを追加する際もこれらの関数を使うことで一貫した実装になる。
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def get_or_404(db: Session, model, id: int, detail: str | None = None):
    """指定モデルのレコードを取得し、存在しない場合は HTTP 404 を返す。

    projects.py / tasks.py / import_export.py の各ルーターで
    同一パターンのコードが重複していたため、ここに集約する。
    detail が None の場合はモデルクラス名から自動生成する。
    """
    obj = db.get(model, id)
    if obj is None:
        msg = detail or f"{model.__name__} not found"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
    return obj


def apply_patch(obj, payload, exclude: set[str] | None = None) -> None:
    """Pydantic スキーマの部分更新（PATCH）を ORM モデルに適用する。

    exclude_none=True で None フィールドをスキップし、
    リクエストで送信されたフィールドのみを更新する。
    dependency_ids のような ORM に渡せないフィールドは exclude で除外する。
    """
    for field, value in payload.model_dump(exclude_none=True, exclude=exclude or set()).items():
        setattr(obj, field, value)


def commit_and_refresh(db: Session, obj):
    """db.commit() と db.refresh() を一括実行してオブジェクトを返す。

    作成・更新エンドポイントで繰り返し使われる
    「commit → refresh → return」パターンを集約する。
    """
    db.commit()
    db.refresh(obj)
    return obj