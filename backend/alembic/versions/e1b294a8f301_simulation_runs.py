from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "e1b294a8f301"
down_revision = "d4f848486c47"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("simulation_runs",
                    sa.Column("id", sa.String(64), primary_key=True),
                    sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id"), nullable=False),
                    sa.Column("sandbox_id", sa.Uuid(), sa.ForeignKey("organizations.id"), nullable=False),
                    sa.Column("status", sa.String(20), nullable=False),
                    sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("next_tick_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("state", JSONB(), nullable=False))
    op.create_index("ix_simulation_runs_organization_id", "simulation_runs", ["organization_id"])
    op.create_index("ix_simulation_runs_status", "simulation_runs", ["status"])


def downgrade():
    op.drop_table("simulation_runs")
