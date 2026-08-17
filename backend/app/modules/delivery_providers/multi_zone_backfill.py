"""One-shot helpers for Alembic 0051 (zoneless 0023 Mexy stub)."""

from sqlalchemy import text

_MEXY_SLUG = "(slug = 'mexy' OR slug LIKE 'mexy-reparto%')"


def cleanup_zoneless_provider_rows(connection) -> None:
    """Drop configs that cannot receive zone_id; rehome leftover Mexy stub links.

    The 0023 ``mexy-reparto`` seed has no polygon. Later rows (default pricing,
    schedules, and a partnership that 0027 already duplicated onto the real
    ``mexy`` company) would otherwise fail the multi-zone NOT NULL backfill.
    Non-Mexy zoneless partnerships are left for the migration fail-fast.
    """
    connection.execute(
        text(
            """
            DELETE FROM delivery_provider_pricing_configs
            WHERE NOT EXISTS (
                SELECT 1
                FROM delivery_provider_zones z
                WHERE z.delivery_provider_id = delivery_provider_pricing_configs.delivery_provider_id
            )
            """
        )
    )
    connection.execute(
        text(
            """
            DELETE FROM delivery_provider_schedules
            WHERE NOT EXISTS (
                SELECT 1
                FROM delivery_provider_zones z
                WHERE z.delivery_provider_id = delivery_provider_schedules.delivery_provider_id
            )
            """
        )
    )
    connection.execute(
        text(
            f"""
            DELETE FROM restaurant_delivery_providers
            WHERE NOT EXISTS (
                SELECT 1
                FROM delivery_provider_zones z
                WHERE z.delivery_provider_id = restaurant_delivery_providers.delivery_provider_id
            )
            AND EXISTS (
                SELECT 1
                FROM delivery_providers sp
                WHERE sp.id = restaurant_delivery_providers.delivery_provider_id
                  AND {_MEXY_SLUG}
            )
            AND EXISTS (
                SELECT 1
                FROM restaurant_delivery_providers other
                JOIN delivery_providers op ON op.id = other.delivery_provider_id
                WHERE other.restaurant_id = restaurant_delivery_providers.restaurant_id
                  AND other.id <> restaurant_delivery_providers.id
                  AND EXISTS (
                      SELECT 1
                      FROM delivery_provider_zones z2
                      WHERE z2.delivery_provider_id = other.delivery_provider_id
                  )
                  AND (op.slug = 'mexy' OR op.slug LIKE 'mexy-reparto%')
            )
            """
        )
    )

    target = connection.execute(
        text(
            f"""
            SELECT p.id
            FROM delivery_providers p
            WHERE EXISTS (
                SELECT 1
                FROM delivery_provider_zones z
                WHERE z.delivery_provider_id = p.id
            )
              AND {_MEXY_SLUG}
            ORDER BY p.created_at ASC
            LIMIT 1
            """
        )
    ).first()
    if target is None:
        return

    leftovers = connection.execute(
        text(
            f"""
            SELECT rdp.id
            FROM restaurant_delivery_providers rdp
            JOIN delivery_providers sp ON sp.id = rdp.delivery_provider_id
            WHERE NOT EXISTS (
                SELECT 1
                FROM delivery_provider_zones z
                WHERE z.delivery_provider_id = rdp.delivery_provider_id
            )
              AND (sp.slug = 'mexy' OR sp.slug LIKE 'mexy-reparto%')
              AND NOT EXISTS (
                SELECT 1
                FROM restaurant_delivery_providers other
                WHERE other.restaurant_id = rdp.restaurant_id
                  AND other.delivery_provider_id = :target_id
              )
            """
        ),
        {"target_id": str(target[0])},
    ).fetchall()
    for row in leftovers:
        connection.execute(
            text(
                """
                UPDATE restaurant_delivery_providers
                SET delivery_provider_id = :target_id
                WHERE id = :id
                """
            ),
            {"target_id": str(target[0]), "id": str(row[0])},
        )
