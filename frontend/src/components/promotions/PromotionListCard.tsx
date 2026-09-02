'use client';

import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import type { Promotion } from '@/lib/api/types';
import {
  formatPromotionDateRange,
  promotionBenefitLabel,
  promotionDisplayName,
  promotionScopeLabel,
  promotionStatusLabel,
  promotionTypeLabel,
} from '@/lib/promotions/display';
import { isCatalogPromotion } from '@/lib/promotions/filters';
import styles from '../pages/PromotionsPage.module.css';

type PromotionListCardProps = {
  promotion: Promotion;
  onEdit: (promotion: Promotion) => void;
  onDelete: (promotion: Promotion) => void;
};

function statusPillClass(status: Promotion['effective_status']): string {
  if (status === 'active') return styles.statusActive;
  if (status === 'expired') return styles.statusExpired;
  return styles.statusInactive;
}

export function PromotionListCard({ promotion, onEdit, onDelete }: PromotionListCardProps) {
  const catalog = isCatalogPromotion(promotion);

  return (
    <article className={styles.couponCard}>
      <button
        type="button"
        className={styles.couponCardMainBtn}
        aria-label={`Editar promoción ${promotionDisplayName(promotion)}`}
        onClick={() => onEdit(promotion)}
      >
        <span className={styles.couponCardTop}>
          <span className={styles.couponCode}>{promotionTypeLabel(promotion)}</span>
          <span className={`${styles.statusPill} ${statusPillClass(promotion.effective_status)}`}>
            {promotionStatusLabel(promotion)}
          </span>
        </span>
        <span className={styles.couponCardName}>{promotionDisplayName(promotion)}</span>
        <span className={styles.couponCardMeta}>
          {promotionBenefitLabel(promotion)} · {promotionScopeLabel(promotion.scope)}
          {catalog ? ' · Desde producto' : ''}
        </span>
        <span className={styles.couponCardFooterMeta}>
          <span>{formatPromotionDateRange(promotion.starts_at, promotion.ends_at)}</span>
        </span>
      </button>
      <div className={styles.couponCardActions} role="group" aria-label="Acciones de promoción">
        <Tooltip title={catalog ? 'Ver detalles' : 'Editar'}>
          <span>
            <IconButton
              size="small"
              aria-label={catalog ? 'Ver detalles de la promoción' : 'Editar promoción'}
              onClick={() => onEdit(promotion)}
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Eliminar">
          <IconButton
            size="small"
            color="error"
            aria-label="Eliminar promoción"
            onClick={() => onDelete(promotion)}
          >
            <DeleteOutlineOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
    </article>
  );
}
