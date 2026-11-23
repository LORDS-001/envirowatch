from alembic import op
import sqlalchemy as sa

revision = "f2c305b9a412"
down_revision = "e1b294a8f301"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("measurement_rollups",
                    sa.Column("device_id", sa.String(64), sa.ForeignKey("devices.id"), primary_key=True),
                    sa.Column("metric", sa.String(32), primary_key=True),
                    sa.Column("granularity", sa.String(8), primary_key=True),
                    sa.Column("bucket_start", sa.DateTime(timezone=True), primary_key=True),
                    sa.Column("quality_status", sa.String(20), primary_key=True),
                    sa.Column("count", sa.BigInteger(), nullable=False),
                    sa.Column("value_sum", sa.Float(), nullable=False),
                    sa.Column("minimum", sa.Float(), nullable=False),
                    sa.Column("maximum", sa.Float(), nullable=False))


def downgrade():
    op.drop_table("measurement_rollups")
