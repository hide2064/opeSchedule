"""add project_annotations table

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-22 00:00:00.000000

ガントチャート上の任意の位置に配置する付箋コメントを保存する
project_annotations テーブルを追加する。
位置は anno_date（日付）と y_offset（ピクセル）で管理する。
"""
from alembic import op
import sqlalchemy as sa


revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'project_annotations',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_id', sa.Integer(),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('anno_date', sa.String(10), nullable=False),
        sa.Column('y_offset', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index('ix_project_annotations_project_id', 'project_annotations', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_project_annotations_project_id', table_name='project_annotations')
    op.drop_table('project_annotations')
