"""marketplace: sellers, scoping multi-tenant, rol SELLER

Revision ID: c2d3e4f5a6b7
Revises: b1f2a3c4d5e6
Create Date: 2026-05-11 21:00:00

Cambios:
- CREATE TYPE seller_status (PENDING, APPROVED, REJECTED, SUSPENDED).
- ALTER TYPE user_role: agrega SELLER.
- Nueva tabla sellers + backfill de IDM S.A. (seller_id=1).
- ALTER products, warehouses, orders: agregar seller_id NOT NULL (con backfill = 1).
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f5a6b7"
down_revision: str | Sequence[str] | None = "b1f2a3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SELLER_STATUS_VALUES = ("PENDING", "APPROVED", "REJECTED", "SUSPENDED")


def upgrade() -> None:
    # 1. Tabla sellers — sa.Enum crea el tipo seller_status automáticamente.
    op.create_table(
        "sellers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("nit", sa.String(length=20), nullable=False),
        sa.Column("contact_email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=80), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(length=500), nullable=True),
        sa.Column(
            "status",
            sa.Enum(*SELLER_STATUS_VALUES, name="seller_status"),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("is_house", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("slug", name="uq_sellers_slug"),
        sa.UniqueConstraint("nit", name="uq_sellers_nit"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_sellers_slug", "sellers", ["slug"])
    op.create_index("ix_sellers_status", "sellers", ["status"])

    # 3. Backfill: crear seller "IDM S.A." con id=1 (idempotente).
    op.execute(
        """
        INSERT INTO sellers (id, name, slug, nit, contact_email, status, is_house, city)
        VALUES (1, 'IDM S.A.', 'idm', '1023456789', 'admin@idm.bo', 'APPROVED', true, 'La Paz')
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("SELECT setval('sellers_id_seq', GREATEST((SELECT MAX(id) FROM sellers), 1))")

    # 4. ALTER TYPE user_role: agregar SELLER
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SELLER'")

    # 5. Agregar seller_id a products, warehouses y orders.
    for table in ("products", "warehouses", "orders"):
        op.add_column(table, sa.Column("seller_id", sa.Integer(), nullable=True))
        op.execute(f"UPDATE {table} SET seller_id = 1 WHERE seller_id IS NULL")
        op.alter_column(table, "seller_id", nullable=False)
        op.create_foreign_key(
            f"fk_{table}_seller_id",
            table,
            "sellers",
            ["seller_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        op.create_index(f"ix_{table}_seller_id", table, ["seller_id"])


def downgrade() -> None:
    for table in ("orders", "warehouses", "products"):
        op.drop_index(f"ix_{table}_seller_id", table_name=table)
        op.drop_constraint(f"fk_{table}_seller_id", table, type_="foreignkey")
        op.drop_column(table, "seller_id")

    op.drop_index("ix_sellers_status", table_name="sellers")
    op.drop_index("ix_sellers_slug", table_name="sellers")
    op.drop_table("sellers")

    op.execute("DROP TYPE IF EXISTS seller_status")
    # No removemos el valor SELLER del enum user_role: Postgres no soporta DROP VALUE.
