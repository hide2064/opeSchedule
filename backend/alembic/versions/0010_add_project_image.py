"""add image_data to projects

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('image_data', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'image_data')
