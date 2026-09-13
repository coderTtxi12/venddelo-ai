'use client';

import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { getGoogleMapsApiKey } from '@/lib/loadGoogleMaps';
import styles from './RestaurantLocationPreview.module.css';

type RestaurantLocationPreviewProps = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  label?: string;
};

function mapsSearchUrl(address: string | null, lat: number | null, lng: number | null): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  return 'https://www.google.com/maps';
}

/** Free Maps Embed (not Dynamic Maps SKU). */
function buildEmbedUrl(latitude: number, longitude: number): string {
  const apiKey = getGoogleMapsApiKey();
  const coords = `${latitude},${longitude}`;
  if (apiKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(coords)}&zoom=15&language=es`;
  }
  return `https://maps.google.com/maps?q=${encodeURIComponent(coords)}&hl=es&z=15&output=embed`;
}

export function RestaurantLocationPreview({
  address,
  latitude,
  longitude,
  label = 'Ubicación del restaurante',
}: RestaurantLocationPreviewProps) {
  const hasCoords = latitude != null && longitude != null;
  const mapsUrl = mapsSearchUrl(address, latitude, longitude);
  const embedUrl = hasCoords ? buildEmbedUrl(latitude!, longitude!) : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.mapShell} aria-label={label}>
        {embedUrl ? (
          <iframe
            className={styles.mapCanvas}
            src={embedUrl}
            title={label}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        ) : (
          <div className={styles.mapFallback}>
            <LocationOnOutlinedIcon sx={{ fontSize: 28 }} aria-hidden />
            <p>{address ? 'Sin coordenadas exactas' : 'Sin ubicación registrada'}</p>
          </div>
        )}
      </div>
      {address || hasCoords ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.mapsLink}
        >
          Abrir en Google Maps
        </a>
      ) : null}
    </div>
  );
}
