"""add parent_project_id to projects

Revision ID: 0013
Revises: f1f76c14ac06
Create Date: 2026-05-03

プロジェクト間の親子関係を管理するための parent_project_id カラムを追加する。
NULL = ルートプロジェクト。親削除時は ON DELETE SET NULL によりルートに昇格。
"""
from alembic import op
import sqlalchemy as sa

revision = '0013'
down_revision = 'f1f76c14ac06'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.add_column(sa.Column("parent_project_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_projects_parent_id",
            "projects",
            ["parent_project_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_constraint("fk_projects_parent_id", type_="foreignkey")
        batch_op.drop_column("parent_project_id")
