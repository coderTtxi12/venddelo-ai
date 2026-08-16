'use client';

import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import type { DeliveryPartnershipRequest, DeliveryProviderZone } from '@/lib/api/types';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { ExpandableText } from '@/components/partnerships/ExpandableText';
import { RestaurantLocationPreview } from '@/components/partnerships/RestaurantLocationPreview';
import { WhatsappIcon } from '@/components/partnerships/WhatsappIcon';
import styles from './PartnershipRequestCard.module.css';
import activeStyles from './ActivePartnershipCard.module.css';

type ActivePartnershipCardProps = {
  partnership: DeliveryPartnershipRequest;
  zones: DeliveryProviderZone[];
  canReassign: boolean;
  reassigning?: boolean;
  onZoneChange?: (zoneId: string) => void;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

function RestaurantLogo({ name, logoPath }: { name: string; logoPath: string | null }) {
  const url = storagePublicUrl(logoPath);
  if (url) {
    return <img src={url} alt={`Logo de ${name}`} className={styles.logo} />;
  }
  return <span className={styles.logoFallback}>{name.charAt(0).toUpperCase()}</span>;
}

export function ActivePartnershipCard({
  partnership,
  zones,
  canReassign,
  reassigning = false,
  onZoneChange,
}: ActivePartnershipCardProps) {
  const { restaurant } = partnership;
  const ownerLabel = restaurant.owner_display_name?.trim() || 'Dueño del restaurante';
  const ownerPhone = restaurant.owner_phone?.trim();
  const businessWhatsapp = restaurant.whatsapp_phone?.trim();
  const activeSince = partnership.activated_at ?? partnership.created_at;

  return (
    <article className={`${styles.card} ${activeStyles.card}`}>
      <header className={styles.header}>
        <div className={styles.logoWrap}>
          <RestaurantLogo name={restaurant.name} logoPath={restaurant.logo_path} />
        </div>
        <div className={styles.headerMeta}>
          <h2 className={styles.restaurantName}>{restaurant.name}</h2>
          <div className={styles.chipRow}>
            <span className={styles.chip}>
              <StorefrontOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
              {restaurant.subdomain}
            </span>
            <span className={activeStyles.activeChip}>
              <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
              Activo
            </span>
            <span className={styles.chipMuted}>
              <PlaceOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
              {partnership.zone.name}
            </span>
            <span className={styles.chipMuted}>
              Desde {formatDate(activeSince)}
            </span>
          </div>
          {canReassign && zones.length > 1 && onZoneChange ? (
            <label className={styles.zoneSelectWrap}>
              <span className={styles.zoneSelectLabel}>Zona</span>
              <select
                className={styles.zoneSelect}
                value={partnership.zone.id}
                disabled={reassigning}
                onChange={(event) => onZoneChange(event.target.value)}
              >
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.details}>
          {restaurant.address ? (
            <div className={styles.infoRow}>
              <span className={styles.infoIcon} aria-hidden>
                <LocationOnOutlinedIcon sx={{ fontSize: 18 }} />
              </span>
              <div>
                <p className={styles.infoLabel}>Dirección</p>
                <p className={styles.infoValue}>{restaurant.address}</p>
              </div>
            </div>
          ) : null}

          <div className={styles.infoRow}>
            <span className={styles.infoIcon} aria-hidden>
              <PersonOutlineOutlinedIcon sx={{ fontSize: 18 }} />
            </span>
            <div>
              <p className={styles.infoLabel}>Dueño</p>
              <p className={styles.infoValue}>{ownerLabel}</p>
              {ownerPhone ? (
                <p className={styles.ownerPhone}>
                  <a href={`tel:${phoneDigits(ownerPhone)}`} className={styles.phoneLink}>
                    {ownerPhone}
                  </a>
                </p>
              ) : null}
            </div>
          </div>

          {businessWhatsapp && businessWhatsapp !== ownerPhone ? (
            <div className={styles.infoRow}>
              <span className={`${styles.infoIcon} ${styles.whatsappIcon}`} aria-hidden>
                <WhatsappIcon size={18} />
              </span>
              <div>
                <p className={styles.infoLabel}>WhatsApp del negocio</p>
                <p className={styles.infoValue}>
                  <a
                    href={`https://wa.me/${phoneDigits(businessWhatsapp)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.whatsappLink}
                  >
                    {businessWhatsapp}
                  </a>
                </p>
              </div>
            </div>
          ) : null}

          {restaurant.description ? (
            <div className={styles.descriptionBlock}>
              <p className={styles.infoLabel}>Descripción</p>
              <ExpandableText text={restaurant.description} collapsedLines={3} />
            </div>
          ) : null}
        </div>

        <RestaurantLocationPreview
          address={restaurant.address}
          latitude={restaurant.latitude}
          longitude={restaurant.longitude}
          label={`Ubicación de ${restaurant.name}`}
        />
      </div>
    </article>
  );
}
