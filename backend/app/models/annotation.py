# ProjectAnnotation ORM モデル。
# ガントチャート上の任意の位置に配置できる付箋コメントを表す。
# 位置は anno_date（日付）と y_offset（ガント行エリア先頭からのピクセル数）で保持する。
# anno_date を使うことでビューモード変更（Day/Week/Month/Quarter）時も日付が保たれる。
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProjectAnnotation(Base):
    __tablename__ = "project_annotations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # x 位置の基準日。YYYY-MM-DD 形式。
    anno_date: Mapped[str] = mapped_column(String(10), nullable=False)
    # gantt-rows 上端からのピクセルオフセット（絶対位置）。
    y_offset: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # テキスト色（HEX 形式 "#rrggbb"）。NULL = デフォルト色。
    text_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    # フォントサイズ（px）。NULL = デフォルト（13px）。
    font_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="annotations")  # type: ignore[name-defined]  # noqa: F821
