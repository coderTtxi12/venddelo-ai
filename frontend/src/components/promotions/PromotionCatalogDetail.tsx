'use client';

import type { Product, Promotion } from '@/lib/api/types';
import {
  formatPromotionDateRange,
  promotionBenefitLabel,
  promotionDisplayName,
  promotionStatusLabel,
} from '@/lib/promotions/display';
import { catalogPromotionProductId } from '@/lib/promotions/productCatalogDiscount';
import styles from '../marketing/PromotionForm.module.css';

type PromotionCatalogDetailProps = {
  promotion: Promotion;
  products: Product[];
  onClose: () => void;
};

export function PromotionCatalogDetail({
  promotion,
  products,
  onClose,
}: PromotionCatalogDetailProps) {
  const productId = catalogPromotionProductId(promotion);
  const product = productId ? products.find((item) => item.id === productId) : undefined;

  return (
    <div className={styles.shell}>
      <div className={styles.scroll}>
        <div className={styles.catalogDetails}>
          <div className={styles.infoBanner} role="status">
            Este descuento se creó desde el editor de producto. Para cambiarlo, abre el producto en{' '}
            <strong>Menú → Productos</strong> y edita su precio o descuento.
          </div>

          <dl className={styles.catalogDetails}>
            <div className={styles.catalogRow}>
              <dt>Producto</dt>
              <dd>{product?.name ?? promotionDisplayName(promotion)}</dd>
            </div>
            <div className={styles.catalogRow}>
              <dt>Descuento</dt>
              <dd>{promotionBenefitLabel(promotion)}</dd>
            </div>
            <div className={styles.catalogRow}>
              <dt>Estado</dt>
              <dd>{promotionStatusLabel(promotion)}</dd>
            </div>
            <div className={styles.catalogRow}>
              <dt>Vigencia</dt>
              <dd>{formatPromotionDateRange(promotion.starts_at, promotion.ends_at)}</dd>
            </div>
            <div className={styles.catalogRow}>
              <dt>Banner en menú</dt>
              <dd>No (solo descuento en catálogo)</dd>
            </div>
          </dl>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerActions}>
          <button type="button" className={styles.primaryBtn} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </footer>
    </div>
  );
}
