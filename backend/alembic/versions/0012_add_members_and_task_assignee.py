"""add members table and task assignee_id

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-02

メンバー管理機能。プロジェクトごとのメンバーを管理し、
タスクに担当者を割り当てられるようにする。
"""
from alembic import op
import sqlalchemy as sa

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'members',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_id', sa.Integer(),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('color', sa.String(7), nullable=False, server_default='#888888'),
        sa.Column('email', sa.String(200), nullable=True),
    )
    op.create_index('ix_members_project_id', 'members', ['project_id'])
    with op.batch_alter_table('tasks') as batch_op:
        batch_op.add_column(sa.Column('assignee_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('tasks') as batch_op:
        batch_op.drop_column('assignee_id')
    op.drop_index('ix_members_project_id', table_name='members')
    op.drop_table('members')
