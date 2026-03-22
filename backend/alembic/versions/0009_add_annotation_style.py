"""add text_color and font_size to project_annotations

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-22 00:00:00.000000

付箋のテキスト色（text_color）とフォントサイズ（font_size）カラムを追加する。
"""
from alembic import op
import sqlalchemy as sa


revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('project_annotations',
                  sa.Column('text_color', sa.String(7), nullable=True))
    op.add_column('project_annotations',
                  sa.Column('font_size', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('project_annotations', 'font_size')
    op.drop_column('project_annotations', 'text_color')
