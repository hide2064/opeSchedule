"""add project_change_log table

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'project_change_log',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('operation', sa.String(length=50), nullable=False),
        sa.Column('task_name', sa.String(length=255), nullable=True),
        sa.Column('detail', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_project_change_log_project_id', 'project_change_log', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_project_change_log_project_id', table_name='project_change_log')
    op.drop_table('project_change_log')
