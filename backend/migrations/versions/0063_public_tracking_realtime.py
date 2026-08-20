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

        CREATE OR REPLACE FUNCTION public.delivery_dispatch_requests_tracking_updated()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, realtime, pg_temp
        AS $$
        BEGIN
            PERFORM public.tracking_realtime_send(
                'tracking:' || NEW.tracking_token,
                'updated',
                '{}'::jsonb
            );
            RETURN NEW;
        END;
        $$;

        DROP TRIGGER IF EXISTS delivery_dispatch_requests_tracking_updated
            ON public.delivery_dispatch_requests;
        CREATE TRIGGER delivery_dispatch_requests_tracking_updated
        AFTER INSERT OR UPDATE OF
            status,
            assigned_driver_id,
            customer_name,
            dropoff_lat,
            dropoff_lng,
            dropoff_address,
            payment_method,
            collect_cents,
            cash_denomination_cents,
            package_count,
            cancelled_at,
            picked_up_at,
            in_transit_at,
            delivered_at
        ON public.delivery_dispatch_requests
        FOR EACH ROW
        EXECUTE FUNCTION public.delivery_dispatch_requests_tracking_updated();

        CREATE OR REPLACE FUNCTION public.delivery_drivers_tracking_location()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, realtime, pg_temp
        AS $$
        DECLARE
            rec record;
            pickup_lat double precision;
            pickup_lng double precision;
            eta integer;
        BEGIN
            IF NEW.last_lat IS NULL OR NEW.last_lng IS NULL THEN
                RETURN NEW;
            END IF;
            FOR rec IN
                SELECT r.tracking_token, r.status, r.dropoff_lat, r.dropoff_lng, r.restaurant_id
                FROM public.delivery_dispatch_requests r
                WHERE r.assigned_driver_id = NEW.id
                  AND r.status IN ('assigned', 'picked_up', 'in_transit')
            LOOP
                SELECT rest.latitude, rest.longitude
                  INTO pickup_lat, pickup_lng
                FROM public.restaurants rest
                WHERE rest.id = rec.restaurant_id;
                eta := public.tracking_eta_seconds(
                    rec.status,
                    NEW.last_lat,
                    NEW.last_lng,
                    pickup_lat,
                    pickup_lng,
                    rec.dropoff_lat,
                    rec.dropoff_lng
                );
                PERFORM public.tracking_realtime_send(
                    'tracking:' || rec.tracking_token,
                    'location',
                    jsonb_build_object(
                        'latitude', NEW.last_lat,
                        'longitude', NEW.last_lng,
                        'eta_seconds', eta
                    )
                );
            END LOOP;
            RETURN NEW;
        END;
        $$;

        DROP TRIGGER IF EXISTS delivery_drivers_tracking_location
            ON public.delivery_drivers;
        CREATE TRIGGER delivery_drivers_tracking_location
        AFTER UPDATE OF last_lat, last_lng
        ON public.delivery_drivers
        FOR EACH ROW
        EXECUTE FUNCTION public.delivery_drivers_tracking_location();
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS delivery_drivers_tracking_location ON public.delivery_drivers"
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS delivery_dispatch_requests_tracking_updated
        ON public.delivery_dispatch_requests
        """
    )
    op.execute("DROP FUNCTION IF EXISTS public.delivery_drivers_tracking_location()")
    op.execute(
        "DROP FUNCTION IF EXISTS public.delivery_dispatch_requests_tracking_updated()"
    )
    op.execute("DROP FUNCTION IF EXISTS public.tracking_realtime_send(text, text, jsonb)")
    op.execute(
        """
        DROP FUNCTION IF EXISTS public.tracking_eta_seconds(
            text, double precision, double precision, double precision,
            double precision, double precision, double precision
        )
        """
    )
