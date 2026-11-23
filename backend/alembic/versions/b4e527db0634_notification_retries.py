from alembic import op
import sqlalchemy as sa

revision = "b4e527db0634"
down_revision = "a3d416caf523"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("notification_attempts", sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("notification_attempts", sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_notification_attempts_due", "notification_attempts", ["outcome", "next_attempt_at", "id"])


def downgrade():
    op.drop_index("ix_notification_attempts_due", table_name="notification_attempts")
    op.drop_column("notification_attempts", "next_attempt_at")
    op.drop_column("notification_attempts", "attempt_count")
