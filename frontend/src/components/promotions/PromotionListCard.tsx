'use client';

import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
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
import { ActivePauseSwitch } from '@/components/ui/ActivePauseSwitch';
import styles from '../pages/PromotionsPage.module.css';

type PromotionListCardProps = {
  promotion: Promotion;
  statusClass: string;
  toggling?: boolean;
  toggleError?: string | null;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (next: boolean) => void;
};

export function PromotionListCard({
  promotion,
  statusClass,
  toggling = false,
  toggleError = null,
  onOpen,
  onEdit,
  onDelete,
  onToggleActive,
}: PromotionListCardProps) {
  const catalog = isCatalogPromotion(promotion);
  const displayName = promotionDisplayName(promotion);

  return (
    <article className={`${styles.couponCard} ${!promotion.is_active ? styles.couponCardPaused : ''}`}>
      <button
        type="button"
        className={styles.couponCardMainBtn}
        aria-label={`Editar promoción ${displayName}`}
        onClick={onOpen}
      >
        <span className={styles.couponCardTop}>
          <span className={styles.couponCode}>{displayName}</span>
          <span className={`${styles.statusPill} ${statusClass}`}>
            {promotionStatusLabel(promotion)}
          </span>
        </span>
        <span className={styles.couponCardName}>
          {promotionTypeLabel(promotion)}
          {catalog ? ' · Desde producto' : ''}
        </span>
        <span className={styles.couponCardMeta}>
          {promotionBenefitLabel(promotion)} · {promotionScopeLabel(promotion.scope)}
        </span>
        <span className={styles.couponCardFooterMeta}>
          <span>{formatPromotionDateRange(promotion.starts_at, promotion.ends_at)}</span>
        </span>
      </button>
      <div className={styles.couponCardActions} role="group" aria-label={`Acciones ${displayName}`}>
        <ActivePauseSwitch
          checked={promotion.is_active}
          pending={toggling}
          ariaLabel={
            promotion.is_active
              ? `Pausar promoción ${displayName}`
              : `Reactivar promoción ${displayName}`
          }
          onChange={onToggleActive}
        />
        <Tooltip title={catalog ? 'Ver detalles' : 'Editar'}>
          <span>
            <IconButton
              size="small"
              aria-label={catalog ? 'Ver detalles de la promoción' : 'Editar promoción'}
              onClick={onEdit}
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
            onClick={onDelete}
          >
            <DeleteOutlineOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
      {toggleError ? (
        <p className={styles.toggleError} role="alert">
          {toggleError}
        </p>
      ) : null}
    </article>
  );
}
