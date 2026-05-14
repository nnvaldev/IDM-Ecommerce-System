"""carts, transfers y nuevos estados de orden

Revision ID: b1f2a3c4d5e6
Revises: ca4e4bdf7a43
Create Date: 2026-05-06 23:00:00

Cambios:
- ALTER TYPE order_status: agrega PENDING_APPROVAL, REJECTED.
- CREATE TYPE transfer_status.
- Nuevas tablas: carts, cart_items, stock_transfers, stock_transfer_items.
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b1f2a3c4d5e6"
down_revision: str | Sequence[str] | None = "ca4e4bdf7a43"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TRANSFER_STATUS_VALUES = (
    "REQUESTED",
    "PICKING",
    "IN_TRANSIT",
    "RECEIVED",
    "CANCELLED",
    "REJECTED_MERMA",
)


def upgrade() -> None:
    # --- order_status: nuevos valores ---
    # ALTER TYPE ... ADD VALUE no puede ir dentro de una transacción para postgres < 12,
    # pero alembic ya marca con autocommit cuando usamos op.execute si está fuera de tx.
    # Para mantener compatibilidad, lo hacemos en su propia COMMIT explícita.
    bind = op.get_bind()
    bind.execute(sa.text("COMMIT"))
    bind.execute(sa.text("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL'"))
    bind.execute(sa.text("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'REJECTED'"))
    bind.execute(sa.text("BEGIN"))

    # --- transfer_status enum (creación explícita una sola vez) ---
    bind.execute(
        sa.text(
            "DO $$ BEGIN "
            "CREATE TYPE transfer_status AS ENUM "
            "('REQUESTED','PICKING','IN_TRANSIT','RECEIVED','CANCELLED','REJECTED_MERMA'); "
            "EXCEPTION WHEN duplicate_object THEN NULL; "
            "END $$;"
        )
    )

    transfer_status = postgresql.ENUM(
        *TRANSFER_STATUS_VALUES, name="transfer_status", create_type=False
    )

    # --- carts ---
    op.create_table(
        "carts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id"),
    )

    # --- cart_items ---
    op.create_table(
        "cart_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("reserved_at", sa.DateTime(timezone=True), nullable=False),
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
        sa.ForeignKeyConstraint(["cart_id"], ["carts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("cart_id", "product_id", "warehouse_id", name="uq_cart_item"),
    )
    op.create_index(op.f("ix_cart_items_cart_id"), "cart_items", ["cart_id"])

    # --- stock_transfers ---
    op.create_table(
        "stock_transfers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transfer_number", sa.String(32), nullable=False),
        sa.Column("origin_warehouse_id", sa.Integer(), nullable=False),
        sa.Column("destination_warehouse_id", sa.Integer(), nullable=False),
        sa.Column("status", transfer_status, nullable=False),
        sa.Column("qr_token", sa.String(64), nullable=True),
        sa.Column("requested_by", sa.Integer(), nullable=True),
        sa.Column("picked_by", sa.Integer(), nullable=True),
        sa.Column("received_by", sa.Integer(), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["origin_warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["destination_warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["picked_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["received_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("transfer_number"),
        sa.UniqueConstraint("qr_token"),
    )
    op.create_index(
        op.f("ix_stock_transfers_transfer_number"),
        "stock_transfers",
        ["transfer_number"],
        unique=True,
    )
    op.create_index(
        op.f("ix_stock_transfers_origin_warehouse_id"),
        "stock_transfers",
        ["origin_warehouse_id"],
    )
    op.create_index(
        op.f("ix_stock_transfers_destination_warehouse_id"),
        "stock_transfers",
        ["destination_warehouse_id"],
    )
    op.create_index(op.f("ix_stock_transfers_status"), "stock_transfers", ["status"])

    # --- stock_transfer_items ---
    op.create_table(
        "stock_transfer_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transfer_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["transfer_id"], ["stock_transfers.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        op.f("ix_stock_transfer_items_transfer_id"),
        "stock_transfer_items",
        ["transfer_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_stock_transfer_items_transfer_id"), table_name="stock_transfer_items")
    op.drop_table("stock_transfer_items")

    op.drop_index(op.f("ix_stock_transfers_status"), table_name="stock_transfers")
    op.drop_index(
        op.f("ix_stock_transfers_destination_warehouse_id"), table_name="stock_transfers"
    )
    op.drop_index(
        op.f("ix_stock_transfers_origin_warehouse_id"), table_name="stock_transfers"
    )
    op.drop_index(op.f("ix_stock_transfers_transfer_number"), table_name="stock_transfers")
    op.drop_table("stock_transfers")

    op.execute("DROP TYPE IF EXISTS transfer_status")

    op.drop_index(op.f("ix_cart_items_cart_id"), table_name="cart_items")
    op.drop_table("cart_items")
    op.drop_table("carts")
    # Nota: PostgreSQL no permite quitar valores de un ENUM existente sin
    # recrear el tipo. Se deja el enum order_status con los nuevos valores.
