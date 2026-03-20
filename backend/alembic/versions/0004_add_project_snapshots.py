"""add project_snapshots table

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-20 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'project_snapshots',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('tasks_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_project_snapshots_project_id', 'project_snapshots', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_project_snapshots_project_id', table_name='project_snapshots')
    op.drop_table('project_snapshots')
