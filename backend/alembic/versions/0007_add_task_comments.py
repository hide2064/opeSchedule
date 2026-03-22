"""add task_comments table

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-22 00:00:00.000000

タスクに紐づくコメントを保存する task_comments テーブルを追加する。
ガントチャート上でのダブルクリックによるコメント追加機能で使用する。
"""
from alembic import op
import sqlalchemy as sa


revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'task_comments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_task_comments_task_id', 'task_comments', ['task_id'])


def downgrade() -> None:
    op.drop_index('ix_task_comments_task_id', table_name='task_comments')
    op.drop_table('task_comments')
