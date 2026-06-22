'use client';

import { useMemo, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { CartQuote } from '@/lib/api/public';
import type { Product, Promotion } from '@/lib/api/types';
import {
  buildCheckoutLineBreakdowns,
  promotionDisplayName,
  type CheckoutLineBreakdown,
} from '@/lib/digital-menu/cart/buildCheckoutLineBreakdown';
import { cartItemCount } from '@/lib/digital-menu/cart/cartMath';
import type { PublicMenuCartLine } from '@/lib/digital-menu/cart/types';
import { promoWarningLabel } from '@/lib/promotions/bundlePromoEligibility';
import { formatMoney } from '@/lib/currency';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import styles from './PublicMenuCheckoutSummary.module.css';

type PublicMenuCheckoutSummaryProps = {
  lines: PublicMenuCartLine[];
  quote: CartQuote;
  products: Product[];
  promotions: Promotion[];
  currency: string;
  onBack: () => void;
  isTabletLayout?: boolean;
};

function PriceRow({
  label,
  hint,
  value,
  variant = 'default',
}: {
  label: string;
  hint?: string;
  value: string;
  variant?: 'default' | 'free' | 'discount' | 'total' | 'muted';
}) {
  const valueClass =
    variant === 'free'
      ? styles.priceRowValueFree
      : variant === 'discount'
        ? styles.priceRowDiscount
        : variant === 'total'
          ? styles.priceRowTotal
          : variant === 'muted'
            ? styles.priceRowValueMuted
            : styles.priceRowValue;

  return (
    <div className={styles.priceRow}>
      <span className={styles.priceRowLabel}>
        {label}
        {hint ? <span className={styles.priceRowHint}>{hint}</span> : null}
      </span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function TotalsPanel({
  currency,
  itemCount,
  subtotalBefore,
  lineDiscountTotal,
  orderDiscount,
  orderPromoLabel,
  total,
  variant,
}: {
  currency: string;
  itemCount: number;
  subtotalBefore: number;
  lineDiscountTotal: number;
  orderDiscount: number;
  orderPromoLabel: string | null;
  total: number;
  variant: 'mobile' | 'desktop';
}) {
  const itemLabel = itemCount === 1 ? '1 artículo' : `${itemCount} artículos`;
  const cardClass =
    variant === 'desktop'
      ? `${styles.totalsCard} ${styles.totalsCardDesktop}`
      : `${styles.totalsCard} ${styles.totalsCardMobile}`;

  return (
    <div className={cardClass}>
      {variant === 'desktop' ? <h2 className={styles.totalsTitle}>Total del pedido</h2> : null}

      {variant === 'mobile' ? (
        <div className={styles.mobileTotalsHeader}>
          <div>
            <p className={styles.totalsFinalLabel}>Total final</p>
            <p className={styles.totalsFinalValue}>{formatMoney(total, currency)}</p>
          </div>
          <span className={styles.totalsRowValue}>{itemLabel}</span>
        </div>
      ) : null}

      <div className={styles.totalsRows}>
        <div className={styles.totalsRow}>
          <span className={styles.totalsRowLabel}>Subtotal ({itemLabel})</span>
          <span className={styles.totalsRowValue}>{formatMoney(subtotalBefore, currency)}</span>
        </div>

        {lineDiscountTotal > 0 ? (
          <div className={styles.totalsRow}>
            <span className={styles.totalsRowLabel}>Descuentos por artículo</span>
            <span className={`${styles.totalsRowValue} ${styles.totalsRowDiscount}`}>
              -{formatMoney(lineDiscountTotal, currency)}
            </span>
          </div>
        ) : null}

        {orderDiscount > 0 ? (
          <div className={styles.totalsRow}>
            <span className={styles.totalsRowLabel}>
              Descuento del pedido
              {orderPromoLabel ? (
                <span className={styles.totalsRowHint}>{orderPromoLabel}</span>
              ) : null}
            </span>
            <span className={`${styles.totalsRowValue} ${styles.totalsRowDiscount}`}>
              -{formatMoney(orderDiscount, currency)}
            </span>
          </div>
        ) : null}
      </div>

      {variant === 'desktop' ? (
        <>
          <div className={styles.totalsDivider} aria-hidden />
          <div>
            <p className={styles.totalsFinalLabel}>Total final</p>
            <p className={styles.totalsFinalValue}>{formatMoney(total, currency)}</p>
          </div>
          <p className={styles.totalsNote}>
            Impuestos y envío se confirman al completar el pedido.
          </p>
        </>
      ) : null}
    </div>
  );
}

function CheckoutLineCard({
  breakdown,
  currency,
  expanded,
  onToggle,
}: {
  breakdown: CheckoutLineBreakdown;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { cartLine } = breakdown;
  const imageUrl = storagePublicUrl(cartLine.imagePath);
  const qtyLabel = cartLine.quantity === 1 ? '1 unidad' : `${cartLine.quantity} unidades`;
  const panelId = `checkout-line-${cartLine.id}`;

  return (
    <li className={styles.lineCard}>
      <div className={styles.lineHeader}>
        {imageUrl ? (
          <img src={imageUrl} alt="" className={styles.thumb} />
        ) : (
          <div className={styles.thumbPlaceholder} aria-hidden />
        )}

        <div className={styles.lineHeaderCopy}>
          <h2 className={styles.lineName}>{cartLine.productName}</h2>
          <p className={styles.lineQty}>{qtyLabel}</p>
          {breakdown.promoBadge ? (
            <span className={styles.linePromoBadge}>{breakdown.promoBadge}</span>
          ) : null}
        </div>

        <div className={styles.lineHeaderActions}>
          {!expanded ? (
            <span className={styles.lineHeaderTotal}>
              {formatMoney(breakdown.lineTotalCents / 100, currency)}
            </span>
          ) : null}
          <button
            type="button"
            className={styles.lineToggleBtn}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={onToggle}
          >
            {expanded ? (
              <ExpandLessIcon fontSize="small" aria-hidden />
            ) : (
              <ExpandMoreIcon fontSize="small" aria-hidden />
            )}
            <span className={styles.srOnly}>
              {expanded ? 'Contraer detalle' : 'Expandir detalle'}
            </span>
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={panelId} className={styles.breakdown}>
          <p className={styles.breakdownSectionLabel}>Precio base</p>
          <PriceRow
            label="Platillo"
            hint={`${formatMoney(breakdown.baseUnitCents / 100, currency)} × ${cartLine.quantity}`}
            value={formatMoney(breakdown.baseLineCents / 100, currency)}
          />

          {breakdown.optionGroups.map((group) => (
            <div key={group.groupTitle} className={styles.optionGroupBlock}>
              <p className={styles.breakdownSectionLabel}>{group.groupTitle}</p>
              {group.items.map((option) => (
                <PriceRow
                  key={`${group.groupTitle}-${option.label}`}
                  label={option.label}
                  value={formatMoney(option.lineTotalCents / 100, currency)}
                />
              ))}
            </div>
          ))}

          <div className={styles.lineDivider} aria-hidden />

          <PriceRow
            label="Subtotal del artículo"
            value={formatMoney(breakdown.subtotalBeforeDiscountCents / 100, currency)}
          />

          {breakdown.discountDetails.length > 0 ? (
            <>
              <p className={styles.breakdownSectionLabel}>Promociones</p>
              {breakdown.discountDetails.map((detail) => (
                <PriceRow
                  key={detail.promotionId}
                  label={detail.label}
                  hint={
                    detail.applied
                      ? detail.badge
                        ? `Aplicada · ${detail.badge}`
                        : 'Aplicada'
                      : detail.notAppliedReason ?? undefined
                  }
                  value={
                    detail.applied && detail.discountCents > 0
                      ? `-${formatMoney(detail.discountCents / 100, currency)}`
                      : '—'
                  }
                  variant={detail.applied && detail.discountCents > 0 ? 'discount' : 'muted'}
                />
              ))}
            </>
          ) : breakdown.discountCents > 0 ? (
            <PriceRow
              label="Descuento"
              hint={breakdown.promoLabel ?? undefined}
              value={`-${formatMoney(breakdown.discountCents / 100, currency)}`}
              variant="discount"
            />
          ) : null}

          {breakdown.promoWarnings.map((warning) => {
            const label = promoWarningLabel(warning);
            if (!label) return null;
            return (
              <p key={warning} className={styles.promoWarning}>
                {label}
              </p>
            );
          })}

          <PriceRow
            label="Total del artículo"
            value={formatMoney(breakdown.lineTotalCents / 100, currency)}
            variant="total"
          />
        </div>
      ) : null}

      {cartLine.notes ? (
        <p className={styles.lineNotes}>Nota: {cartLine.notes}</p>
      ) : null}
    </li>
  );
}

export function PublicMenuCheckoutSummary({
  lines,
  quote,
  products,
  promotions,
  currency,
  onBack,
  isTabletLayout = false,
}: PublicMenuCheckoutSummaryProps) {
  const [collapsedLineIds, setCollapsedLineIds] = useState<Set<string>>(() => new Set());

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const promotionsById = useMemo(
    () => new Map(promotions.map((promotion) => [promotion.id, promotion])),
    [promotions],
  );

  const quoteNow = useMemo(() => new Date(quote.server_now), [quote.server_now]);

  const lineBreakdowns = useMemo(
    () =>
      buildCheckoutLineBreakdowns(
        lines,
        quote.lines,
        productsById,
        promotionsById,
        quote.timezone,
        quoteNow,
      ),
    [lines, quote.lines, productsById, promotionsById, quote.timezone, quoteNow],
  );

  const itemCount = cartItemCount(lines);
  const subtotalBefore = quote.subtotal_before_discount_cents / 100;
  const lineDiscountTotal =
    lineBreakdowns.reduce((sum, breakdown) => sum + breakdown.discountCents, 0) / 100;
  const orderDiscount = quote.order_discount_cents / 100;
  const total = quote.total_cents / 100;

  const orderPromo = quote.applied_order_promotion_id
    ? promotionsById.get(quote.applied_order_promotion_id)
    : undefined;
  const orderPromoLabel = promotionDisplayName(orderPromo);

  const toggleLine = (lineId: string) => {
    setCollapsedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  return (
    <div className={`${styles.checkoutSummary} ${isTabletLayout ? menuStyles.publicTablet : ''}`}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          aria-label="Volver al carrito"
          onClick={onBack}
        >
          <ArrowBackIcon fontSize="small" />
        </button>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Tu cuenta</h1>
          <p className={styles.headerMeta}>
            {itemCount === 1 ? '1 artículo' : `${itemCount} artículos`} · promociones aplicadas
          </p>
        </div>
      </header>

      <div className={styles.body}>
        <ul className={styles.lineList} aria-label="Desglose del pedido">
          {lineBreakdowns.map((breakdown) => (
            <CheckoutLineCard
              key={breakdown.cartLine.id}
              breakdown={breakdown}
              currency={currency}
              expanded={!collapsedLineIds.has(breakdown.cartLine.id)}
              onToggle={() => toggleLine(breakdown.cartLine.id)}
            />
          ))}
        </ul>

        <aside className={styles.totalsAside} aria-label="Total del pedido">
          <TotalsPanel
            currency={currency}
            itemCount={itemCount}
            subtotalBefore={subtotalBefore}
            lineDiscountTotal={lineDiscountTotal}
            orderDiscount={orderDiscount}
            orderPromoLabel={orderPromoLabel}
            total={total}
            variant="desktop"
          />
        </aside>
      </div>

      <footer className={styles.totalsBarMobile} aria-label="Total del pedido">
        <TotalsPanel
          currency={currency}
          itemCount={itemCount}
          subtotalBefore={subtotalBefore}
          lineDiscountTotal={lineDiscountTotal}
          orderDiscount={orderDiscount}
          orderPromoLabel={orderPromoLabel}
          total={total}
          variant="mobile"
        />
      </footer>
    </div>
  );
}
