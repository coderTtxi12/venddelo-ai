"""backfill explicit NxM complement allow-lists

Revision ID: 0039_nxm_complement_allowlist
Revises: 0038_menu_import_snapshots
Create Date: 2026-07-08
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0039_nxm_complement_allowlist"
down_revision: str | None = "0038_menu_import_snapshots"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO promotion_option_items (promotion_id, option_item_id)
        SELECT DISTINCT promo.id, oi.id
        FROM promotions promo
        JOIN promotion_products pp ON pp.promotion_id = promo.id
        JOIN products pr ON pr.id = pp.product_id AND pr.status = 'active'
        JOIN option_groups og ON og.product_id = pr.id AND og.is_active = true
        JOIN option_items oi ON oi.option_group_id = og.id AND oi.is_active = true
        WHERE promo.type = 'two_for_one'
          AND promo.scope IN ('product', 'category')
          AND promo.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM promotion_option_items poi
              WHERE poi.promotion_id = promo.id
          )
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO promotion_option_items (promotion_id, option_item_id)
        SELECT DISTINCT promo.id, oi.id
        FROM promotions promo
        JOIN promotion_categories pcat ON pcat.promotion_id = promo.id
        JOIN product_categories pc ON pc.category_id = pcat.category_id
        JOIN products pr ON pr.id = pc.product_id AND pr.status = 'active'
        JOIN option_groups og ON og.product_id = pr.id AND og.is_active = true
        JOIN option_items oi ON oi.option_group_id = og.id AND oi.is_active = true
        WHERE promo.type = 'two_for_one'
          AND promo.scope = 'category'
          AND promo.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM promotion_products pp WHERE pp.promotion_id = promo.id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM promotion_option_items poi
              WHERE poi.promotion_id = promo.id
          )
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    pass
