from alembic import op
import sqlalchemy as sa

revision = "a3d416caf523"
down_revision = "f2c305b9a412"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("user_invitations",
                    sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
                    sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("used_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_table("user_invitations")
