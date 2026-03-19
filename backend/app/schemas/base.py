"""スキーマ基底クラス。

ORM モデルから直接変換できるレスポンス用スキーマの共通設定を提供する。
レスポンス用スキーマはすべてこのクラスを継承することで
model_config の重複定義を防ぐ。
"""
from pydantic import BaseModel


class OrmModel(BaseModel):
    """SQLAlchemy ORM モデルから直接変換できる Pydantic モデル基底クラス。

    from_attributes=True により ORM インスタンスを直接 Pydantic モデルに変換できる。
    新しいレスポンス用スキーマを追加する際はこのクラスを継承する。
    """
    model_config = {"from_attributes": True}