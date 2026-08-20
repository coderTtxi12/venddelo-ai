"""public tracking supabase realtime broadcast helpers

Revision ID: 0063_public_tracking_realtime
Revises: 0062_case_d_pickup_1000m
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0063_public_tracking_realtime"
down_revision: str | None = "0062_case_d_pickup_1000m"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.tracking_eta_seconds(
            p_status text,
            p_rider_lat double precision,
            p_rider_lng double precision,
            p_pickup_lat double precision,
            p_pickup_lng double precision,
            p_dropoff_lat double precision,
            p_dropoff_lng double precision
        ) RETURNS integer
        LANGUAGE plpgsql
        IMMUTABLE
        AS $$
        DECLARE
            dest_lat double precision;
            dest_lng double precision;
            d_phi double precision;
            d_lambda double precision;
            a double precision;
            meters double precision;
        BEGIN
            IF p_rider_lat IS NULL OR p_rider_lng IS NULL THEN
                RETURN NULL;
            END IF;
            IF p_status = 'assigned' THEN
                IF p_pickup_lat IS NULL OR p_pickup_lng IS NULL THEN
                    RETURN NULL;
                END IF;
                dest_lat := p_pickup_lat;
                dest_lng := p_pickup_lng;
            ELSIF p_status IN ('picked_up', 'in_transit') THEN
                dest_lat := p_dropoff_lat;
                dest_lng := p_dropoff_lng;
            ELSE
                RETURN NULL;
            END IF;
            d_phi := radians(dest_lat - p_rider_lat);
            d_lambda := radians(dest_lng - p_rider_lng);
            a := sin(d_phi / 2) ^ 2
                + cos(radians(p_rider_lat)) * cos(radians(dest_lat))
                * sin(d_lambda / 2) ^ 2;
            meters := 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a));
            RETURN round(meters / 8.0)::integer;
        END;
        $$;

        CREATE OR REPLACE FUNCTION public.tracking_realtime_send(
            p_topic text,
            p_event text,
            p_payload jsonb
        ) RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
            IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL THEN
                RETURN;
            END IF;
            PERFORM realtime.send(p_payload, p_event, p_topic, false);
        END;
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.tracking_realtime_send(text, text, jsonb)")
    op.execute(
        """
        DROP FUNCTION IF EXISTS public.tracking_eta_seconds(
            text, double precision, double precision, double precision,
            double precision, double precision, double precision
        )
        """
    )
