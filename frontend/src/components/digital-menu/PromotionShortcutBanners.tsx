'use client';

import type { Promotion } from '@/lib/api/types';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import styles from './PromotionShortcutBanners.module.css';

type PromotionShortcutBannersProps = {
  promotions: Promotion[];
  onSelect: (promotionId: string) => void;
  viewport: 'mobile' | 'tablet' | 'desktop';
  title?: string;
  sectionRef?: (element: HTMLElement | null) => void;
  sectionId?: string;
  categoryId?: string;
};

export function PromotionShortcutBanners({
  promotions,
  onSelect,
  viewport,
  title = 'Promociones',
  sectionRef,
  sectionId,
  categoryId,
}: PromotionShortcutBannersProps) {
  if (promotions.length === 0) return null;

  const headingId = sectionId ? `${sectionId}-heading` : 'promo-shortcuts-heading';

  return (
    <section
      id={sectionId}
      data-category-id={categoryId}
      ref={sectionRef}
      className={`${menuStyles.section} ${styles.promoSection} ${
        viewport === 'desktop' ? styles.promoSectionDesktop : ''
      }`}
      aria-labelledby={headingId}
    >
      <div className={menuStyles.sectionHeader}>
        <h2
          id={headingId}
          className={`${menuStyles.sectionTitle} ${
            viewport === 'desktop' ? styles.titleDesktop : ''
          }`}
        >
          {title}
        </h2>
      </div>
      <p className={styles.subtitle}>Toca un banner para ver los platillos incluidos</p>

      <ul
        className={`${styles.list} ${viewport === 'desktop' ? styles.listDesktop : ''}`}
        aria-label="Accesos directos a promociones"
      >
        {promotions.map((promotion) => {
          const imageUrl = storagePublicUrl(promotion.image_path);
          if (!imageUrl) return null;

          return (
            <li key={promotion.id} className={styles.item}>
              <button
                type="button"
                className={styles.bannerBtn}
                onClick={() => onSelect(promotion.id)}
                aria-label={`Ver promoción ${promotion.name}`}
              >
                <img src={imageUrl} alt="" className={styles.bannerImage} />
                <span className={styles.bannerScrim} aria-hidden />
                <span className={styles.bannerLabel}>{promotion.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
