'use client';

import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import type { Coupon } from '@/lib/api/types';
import {
  couponBenefitLabel,
  couponScopeLabel,
  couponStatusLabel,
  couponStockLabel,
  couponTypeLabel,
  formatCouponValidityRange,
  formatCouponWeekdaysLabel,
} from '@/lib/coupons/display';
import { ActivePauseSwitch } from '@/components/ui/ActivePauseSwitch';
import styles from '../pages/CouponsPage.module.css';

type CouponListCardProps = {
  coupon: Coupon;
  copied: boolean;
  statusClass: string;
  toggling?: boolean;
  toggleError?: string | null;
  onOpen: () => void;
  onCopy: () => void;
  onViewUses: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (next: boolean) => void;
};

export function CouponListCard({
  coupon,
  copied,
  statusClass,
  toggling = false,
  toggleError = null,
  onOpen,
  onCopy,
  onViewUses,
  onEdit,
  onDelete,
  onToggleActive,
}: CouponListCardProps) {
  const weekdayLabel = formatCouponWeekdaysLabel(coupon.recurrence_weekdays);
  return (
    <article className={`${styles.couponCard} ${!coupon.is_active ? styles.couponCardPaused : ''}`}>
      <button
        type="button"
        className={styles.couponCardMainBtn}
        aria-label={`Editar cupón ${coupon.code}`}
        onClick={onOpen}
      >
        <span className={styles.couponCardTop}>
          <span className={styles.couponCode}>{coupon.code}</span>
          <span className={`${styles.statusPill} ${statusClass}`}>
            {couponStatusLabel(coupon.effective_status ?? 'inactive')}
          </span>
        </span>
        <span className={styles.couponCardName}>{coupon.name}</span>
        <span className={styles.couponCardMeta}>
          {couponTypeLabel(coupon.type)} · {couponBenefitLabel(coupon)} ·{' '}
          {couponScopeLabel(coupon.scope)}
          {weekdayLabel ? ` · ${weekdayLabel}` : ''}
        </span>
        <span className={styles.couponCardFooterMeta}>
          <span>{couponStockLabel(coupon.redeemed_count, coupon.stock_qty)} usos</span>
          <span>{formatCouponValidityRange(coupon.starts_on, coupon.expires_on)}</span>
        </span>
      </button>
      <div className={styles.couponCardActions} role="group" aria-label={`Acciones ${coupon.code}`}>
        <ActivePauseSwitch
          checked={coupon.is_active}
          pending={toggling}
          ariaLabel={
            coupon.is_active ? `Pausar cupón ${coupon.code}` : `Reactivar cupón ${coupon.code}`
          }
          onChange={onToggleActive}
        />
        <Tooltip title={copied ? 'Copiado' : 'Copiar código'}>
          <IconButton size="small" aria-label={`Copiar código ${coupon.code}`} onClick={onCopy}>
            <ContentCopyOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Ver usos">
          <IconButton size="small" aria-label={`Ver usos de ${coupon.code}`} onClick={onViewUses}>
            <GroupsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Editar">
          <IconButton size="small" aria-label={`Editar ${coupon.code}`} onClick={onEdit}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Eliminar">
          <IconButton
            size="small"
            color="error"
            aria-label={`Eliminar ${coupon.code}`}
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
