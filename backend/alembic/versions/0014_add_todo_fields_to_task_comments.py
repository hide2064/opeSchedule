"""add is_todo and is_done to task_comments

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-04

task_comments テーブルに ToDo 機能用の is_todo / is_done カラムを追加する。
is_todo=True のコメントを ToDo アイテムとして扱い、is_done で完了状態を管理する。
"""
from alembic import op
import sqlalchemy as sa


revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('task_comments', sa.Column('is_todo', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('task_comments', sa.Column('is_done', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('task_comments', 'is_done')
    op.drop_column('task_comments', 'is_todo')
