'use client';

import type { RefObject } from 'react';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { DigitalMenuShareButton } from '@/components/digital-menu/DigitalMenuShareButton';
import type { Restaurant, RestaurantSchedule } from '@/lib/api/types';
import { RestaurantOpenStatusBadge } from '@/components/digital-menu/RestaurantOpenStatusBadge';
import { RestaurantServiceChips } from '@/components/digital-menu/RestaurantServiceChips';
import { PUBLIC_MENU_SCHEDULE_SERVICE_TYPES, type RestaurantServiceType } from '@/lib/restaurantServices';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';

type DigitalMenuEditorHeroProps = {
  restaurant: Restaurant;
  schedules: RestaurantSchedule[];
  enabledServices: RestaurantServiceType[];
  logoUrl: string | null;
  coverUrl: string | null;
  menuUrl: string;
  showFloatControls: boolean;
  heroSentinelRef: RefObject<HTMLDivElement | null>;
  coverInputRef: RefObject<HTMLInputElement | null>;
  logoInputRef: RefObject<HTMLInputElement | null>;
  onNameBlur: (value: string) => void;
  onDescriptionBlur: (value: string) => void;
  onAssetUpload: (folder: 'logo' | 'cover', file: File) => void;
};

export function DigitalMenuEditorHero({
  restaurant,
  schedules,
  enabledServices,
  logoUrl,
  coverUrl,
  menuUrl,
  showFloatControls,
  heroSentinelRef,
  coverInputRef,
  logoInputRef,
  onNameBlur,
  onDescriptionBlur,
  onAssetUpload,
}: DigitalMenuEditorHeroProps) {
  return (
    <section className={menuStyles.menuHero} aria-label="Información del restaurante">
      <div className={menuStyles.coverWrap}>
        {coverUrl ? (
          <img src={coverUrl} alt="" className={menuStyles.coverImage} />
        ) : (
          <div className={menuStyles.coverPlaceholder}>Agregar foto de portada</div>
        )}
        <div className={menuStyles.coverScrim} aria-hidden />
        <div
          className={menuStyles.coverFloatBar}
          data-visible={showFloatControls ? 'true' : 'false'}
          aria-hidden={!showFloatControls}
        >
          <div className={menuStyles.headerActions}>
            <DigitalMenuShareButton
              restaurantName={restaurant.name}
              menuUrl={menuUrl}
              fallbackSubdomain={restaurant.subdomain}
              className={menuStyles.floatIconBtn}
            />
            <span className={menuStyles.floatIconBtn} aria-label="Buscar">
              <SearchOutlinedIcon fontSize="small" />
            </span>
          </div>
        </div>
        <button
          type="button"
          className={menuStyles.coverEdit}
          onClick={() => coverInputRef.current?.click()}
        >
          {coverUrl ? 'Cambiar portada' : 'Subir portada'}
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className={menuStyles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAssetUpload('cover', file);
            e.target.value = '';
          }}
        />
      </div>

      <div className={menuStyles.restaurantHeader}>
        <div className={menuStyles.logoRow}>
          <div className={menuStyles.logoWrap}>
            {logoUrl ? (
              <img src={logoUrl} alt="" className={menuStyles.logoImage} />
            ) : (
              <div className={menuStyles.logoPlaceholder}>
                {(restaurant.name.trim()[0] ?? '?').toUpperCase()}
              </div>
            )}
            <button
              type="button"
              className={menuStyles.logoEdit}
              onClick={() => logoInputRef.current?.click()}
            >
              {logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className={menuStyles.hiddenInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAssetUpload('logo', file);
                e.target.value = '';
              }}
            />
          </div>
          <div className={menuStyles.nameBlock}>
            <input
              className={menuStyles.restaurantName}
              defaultValue={restaurant.name}
              key={restaurant.id + restaurant.name}
              aria-label="Nombre del restaurante"
              onBlur={(e) => onNameBlur(e.target.value)}
            />
            <RestaurantOpenStatusBadge
              schedules={schedules}
              services={PUBLIC_MENU_SCHEDULE_SERVICE_TYPES}
            />
          </div>
        </div>
        <div className={menuStyles.descriptionBlock}>
          <textarea
            className={menuStyles.restaurantDescription}
            defaultValue={restaurant.description ?? ''}
            key={`${restaurant.id}-desc-${restaurant.description ?? ''}`}
            aria-label="Descripción del restaurante"
            placeholder="Describe tu restaurante (ej. especialidad, ambiente, historia…)"
            rows={2}
            onBlur={(e) => onDescriptionBlur(e.target.value)}
          />
        </div>
        <RestaurantServiceChips services={enabledServices} />
        <div ref={heroSentinelRef} className={menuStyles.heroSentinel} aria-hidden />
      </div>
    </section>
  );
}
