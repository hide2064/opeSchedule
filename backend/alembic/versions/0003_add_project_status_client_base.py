"""add project_status, client_name, base_project to projects

Revision ID: 0003
Revises: 340bd8746f87
Create Date: 2026-03-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '340bd8746f87'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('project_status', sa.String(length=20),
                                        nullable=False, server_default='未開始'))
    op.add_column('projects', sa.Column('client_name',    sa.String(length=255), nullable=True))
    op.add_column('projects', sa.Column('base_project',   sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'base_project')
    op.drop_column('projects', 'client_name')
    op.drop_column('projects', 'project_status')
