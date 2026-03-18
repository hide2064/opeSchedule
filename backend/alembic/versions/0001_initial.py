"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("week_start_day", sa.String(3), nullable=False, server_default="Mon"),
        sa.Column("date_format", sa.String(20), nullable=False, server_default="YYYY-MM-DD"),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="Asia/Tokyo"),
        sa.Column("default_view_mode", sa.String(20), nullable=False, server_default="Week"),
        sa.Column("highlight_weekends", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("holiday_dates", sa.Text, nullable=False, server_default="[]"),
        sa.Column("auto_scroll_today", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("theme", sa.String(20), nullable=False, server_default="light"),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="ck_config_singleton"),
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("color", sa.String(7), nullable=False, server_default="#4A90D9"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("view_mode", sa.String(20)),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("task_type", sa.String(20), nullable=False, server_default="task"),
        sa.Column("progress", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="SET NULL")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("color", sa.String(7)),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("end_date >= start_date", name="ck_task_dates"),
        sa.CheckConstraint("progress >= 0.0 AND progress <= 1.0", name="ck_task_progress"),
        sa.CheckConstraint(
            "task_type != 'milestone' OR start_date = end_date",
            name="ck_milestone_single_day",
        ),
    )
    op.create_index("ix_tasks_project_id", "tasks", ["project_id", "sort_order"])

    op.create_table(
        "task_dependencies",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("depends_on_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("task_id", "depends_on_id", name="uq_task_dependency"),
    )


def downgrade() -> None:
    op.drop_table("task_dependencies")
    op.drop_index("ix_tasks_project_id", table_name="tasks")
    op.drop_table("tasks")
    op.drop_table("projects")
    op.drop_table("config")
