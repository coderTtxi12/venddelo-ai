import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import type { Restaurant } from '@/lib/api/types';
import {
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsLink,
  formatGeoCoordinate,
  hasRestaurantLocation,
} from '@/lib/googleMaps';
import styles from './RestaurantLocationSection.module.css';

type RestaurantLocationSectionProps = {
  restaurant: Pick<Restaurant, 'name' | 'address' | 'latitude' | 'longitude' | 'place_id'>;
};

export function RestaurantLocationSection({ restaurant }: RestaurantLocationSectionProps) {
  const embedUrl = buildGoogleMapsEmbedUrl(restaurant);
  const mapsLink = buildGoogleMapsLink(restaurant);
  const hasLocation = hasRestaurantLocation(restaurant);
  const addressText = restaurant.address?.trim();

  return (
    <section className={styles.locationSection} aria-label="Ubicación del restaurante">
      <div className={styles.locationHeader}>
        <LocationOnOutlinedIcon className={styles.locationIcon} aria-hidden />
        <div className={styles.locationHeading}>
          <h2 className={styles.locationTitle}>Ubicación</h2>
          <p className={styles.locationHint}>Encuéntranos en el mapa</p>
        </div>
      </div>

      {!hasLocation ? (
        <p className={styles.locationEmpty}>Aún no hay ubicación configurada para este restaurante.</p>
      ) : (
        <>
          {embedUrl ? (
            <div className={styles.mapWrap}>
              <iframe
                className={styles.mapFrame}
                src={embedUrl}
                title={`Mapa de ${restaurant.name}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          ) : null}

          {addressText ? (
            <p className={styles.addressText}>{addressText}</p>
          ) : restaurant.latitude != null && restaurant.longitude != null ? (
            <p className={styles.addressText}>
              {formatGeoCoordinate(restaurant.latitude)}, {formatGeoCoordinate(restaurant.longitude)}
            </p>
          ) : null}

          {mapsLink ? (
            <a
              className={styles.mapsLink}
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir en Google Maps
              <OpenInNewOutlinedIcon sx={{ fontSize: 15 }} aria-hidden />
            </a>
          ) : null}
        </>
      )}
    </section>
  );
}
