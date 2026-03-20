"""add last_changelog_id to project_snapshots

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-20 14:00:00.000000

project_snapshots テーブルに last_changelog_id カラムを追加する。
スナップショット作成時点での project_change_log の最大 ID を記録し、
GET /changelog でのフィルタリングをタイムスタンプではなく ID ベースで行うための変更。
"""
from alembic import op
import sqlalchemy as sa


revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'project_snapshots',
        sa.Column('last_changelog_id', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('project_snapshots', 'last_changelog_id')
