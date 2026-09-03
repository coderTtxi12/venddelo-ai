'use client';

import { useEffect, useMemo, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import type { CartQuote } from '@/lib/api/public';
import type { Product, Promotion, RestaurantSchedule } from '@/lib/api/types';
import {
  buildCheckoutLineBreakdowns,
  promotionDisplayName,
  type CheckoutLineBreakdown,
} from '@/lib/digital-menu/cart/buildCheckoutLineBreakdown';
import { cartItemCount } from '@/lib/digital-menu/cart/cartMath';
import type { PublicMenuCartLine } from '@/lib/digital-menu/cart/types';
import { buildPublicOrderInput } from '@/lib/digital-menu/checkout/buildPublicOrderInput';
import { createCheckoutOrderRef } from '@/lib/digital-menu/checkout/createCheckoutOrderRef';
import {
  formatWhatsAppOrderMessage,
  openWhatsAppOrder,
  whatsappPhoneDigits,
  type WhatsAppRestaurantLocation,
} from '@/lib/digital-menu/checkout/formatWhatsAppOrderMessage';
import { buildCheckoutCustomerPhoneE164, formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import {
  isCashDenominationValid,
  needsCashDenomination,
} from '@/lib/digital-menu/checkout/cashDenomination';
import {
  buildCheckoutClosedMessage,
  isRestaurantOpenForCheckout,
  resolveCheckoutRestaurantOpenStatus,
} from '@/lib/digital-menu/checkout/checkoutRestaurantHours';
import type { CheckoutFulfillment } from '@/lib/digital-menu/checkout/fulfillment';
import { isCustomerContactComplete } from '@/lib/digital-menu/checkout/fulfillment';
import { submitPublicOrderBackground } from '@/lib/digital-menu/checkout/submitPublicOrderBackground';
import { promoWarningLabel } from '@/lib/promotions/bundlePromoEligibility';
import {
  listUnmetOrderThresholdHints,
  quoteEligibleSubtotalCents,
  type OrderThresholdHint,
} from '@/lib/promotions/orderThresholdHints';
import { formatMoney } from '@/lib/currency';
import {
  PAYMENT_METHOD_LABELS,
} from '@/lib/restaurantPaymentConfig';
import { RESTAURANT_SERVICE_LABELS } from '@/lib/restaurantServices';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { ProductImagePlaceholder } from '@/components/digital-menu/ProductImagePlaceholder';
import { CheckoutCashDenominationSection } from '@/components/digital-menu/CheckoutCashDenominationSection';
import { formatCouponCodeInput } from '@/lib/coupons/code';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import styles from './PublicMenuCheckoutSummary.module.css';

type PublicMenuCheckoutSummaryProps = {
  subdomain: string;
  restaurantName: string;
  restaurantLocation: WhatsAppRestaurantLocation;
  whatsappPhone: string | null;
  schedules: RestaurantSchedule[];
  lines: PublicMenuCartLine[];
  quote: CartQuote;
  products: Product[];
  promotions: Promotion[];
  currency: string;
  fulfillment: CheckoutFulfillment;
  onFulfillmentChange: (next: CheckoutFulfillment) => void;
  couponDraft: string;
  onCouponDraftChange: (value: string) => void;
  appliedCouponCode: string | null;
  onApplyCoupon: () => void | Promise<void>;
  onRemoveCoupon: () => void | Promise<void>;
  quoteLoading: boolean;
  onBack: () => void;
  onOrderSent: () => void;
  isTabletLayout?: boolean;
};

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      fill="currentColor"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CouponSection({
  couponDraft,
  onCouponDraftChange,
  quote,
  currency,
  quoteLoading,
  onApplyCoupon,
  onRemoveCoupon,
  variant,
}: {
  couponDraft: string;
  onCouponDraftChange: (value: string) => void;
  quote: CartQuote;
  currency: string;
  quoteLoading: boolean;
  onApplyCoupon: () => void | Promise<void>;
  onRemoveCoupon: () => void | Promise<void>;
  variant: 'mobile' | 'desktop';
}) {
  const inputId =
    variant === 'desktop' ? 'checkout-coupon-code-desktop' : 'checkout-coupon-code-mobile';
  const sectionClass =
    variant === 'desktop'
      ? `${styles.couponSection} ${styles.couponSectionDesktop}`
      : `${styles.couponSection} ${styles.couponSectionMobile}`;

  return (
    <section className={sectionClass} aria-label="Código de cupón">
      <div className={styles.couponHeader}>
        <LocalOfferOutlinedIcon sx={{ fontSize: variant === 'desktop' ? 20 : 18 }} aria-hidden />
        <div className={styles.couponHeaderCopy}>
          <p className={styles.couponTitle}>
            {quote.coupon ? 'Cupón aplicado' : '¿Tienes un cupón?'}
          </p>
          {variant === 'desktop' && !quote.coupon ? (
            <p className={styles.couponHint}>Aplícalo antes de enviar tu pedido</p>
          ) : null}
        </div>
      </div>

      {quote.coupon ? (
        <div className={styles.couponAppliedRow}>
          <span className={styles.couponChip}>
            {quote.coupon.type === 'free_shipping'
              ? `${quote.coupon.code} · Envío gratis`
              : `${quote.coupon.code} · −${formatMoney(
                  (quote.coupon.discount_cents + quote.coupon.waived_delivery_cents) / 100,
                  currency,
                )}`}
          </span>
          <button
            type="button"
            className={styles.couponRemoveBtn}
            onClick={() => void onRemoveCoupon()}
            disabled={quoteLoading}
          >
            Quitar
          </button>
        </div>
      ) : (
        <div className={styles.couponRow}>
          <input
            id={inputId}
            className={styles.couponInput}
            value={couponDraft}
            onChange={(event) => onCouponDraftChange(formatCouponCodeInput(event.target.value))}
            placeholder="Código"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={quoteLoading}
            aria-describedby={quote.coupon_error ? `${inputId}-error` : undefined}
          />
          <button
            type="button"
            className={styles.couponApplyBtn}
            disabled={quoteLoading || !couponDraft.trim()}
            onClick={() => void onApplyCoupon()}
          >
            {quoteLoading ? '…' : 'Aplicar'}
          </button>
        </div>
      )}

      {quote.coupon_error ? (
        <p id={`${inputId}-error`} className={styles.couponError} role="alert">
          {quote.coupon_error.message}
        </p>
      ) : null}
    </section>
  );
}

function FulfillmentSummary({
  fulfillment,
}: {
  fulfillment: CheckoutFulfillment;
}) {
  return (
    <section className={styles.fulfillmentCard} aria-label="Detalles de entrega y pago">
      <h2 className={styles.fulfillmentTitle}>Detalles del pedido</h2>
      <dl className={styles.fulfillmentList}>
        <div className={styles.fulfillmentRow}>
          <dt className={styles.fulfillmentLabel}>Cliente</dt>
          <dd className={styles.fulfillmentValue}>{fulfillment.customerName.trim()}</dd>
        </div>
        <div className={styles.fulfillmentRow}>
          <dt className={styles.fulfillmentLabel}>WhatsApp</dt>
          <dd className={styles.fulfillmentValue}>
            {formatOrderCustomerPhone(buildCheckoutCustomerPhoneE164(fulfillment))}
          </dd>
        </div>
        <div className={styles.fulfillmentRow}>
          <dt className={styles.fulfillmentLabel}>Tipo de pedido</dt>
          <dd className={styles.fulfillmentValue}>
            {RESTAURANT_SERVICE_LABELS[fulfillment.serviceType]}
          </dd>
        </div>
        {fulfillment.serviceType === 'delivery' ? (
          <div className={styles.fulfillmentRow}>
            <dt className={styles.fulfillmentLabel}>Dirección</dt>
            <dd className={styles.fulfillmentValue}>{fulfillment.deliveryAddress.trim()}</dd>
          </div>
        ) : null}
        {fulfillment.serviceType === 'delivery' &&
        fulfillment.deliveryAddressDetails.trim() ? (
          <div className={styles.fulfillmentRow}>
            <dt className={styles.fulfillmentLabel}>Referencias</dt>
            <dd className={styles.fulfillmentValue}>
              {fulfillment.deliveryAddressDetails.trim()}
            </dd>
          </div>
        ) : null}
        {fulfillment.paymentMethod ? (
          <div className={styles.fulfillmentRow}>
            <dt className={styles.fulfillmentLabel}>Método de pago</dt>
            <dd className={styles.fulfillmentValue}>
              {PAYMENT_METHOD_LABELS[fulfillment.paymentMethod]}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

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

function SendOrderButton({
  disabled,
  disabledReason,
  sendErrorMessage,
  onSend,
  variant,
}: {
  disabled: boolean;
  disabledReason: string | null;
  sendErrorMessage: string | null;
  onSend: () => void;
  variant: 'mobile' | 'desktop';
}) {
  return (
    <div className={variant === 'desktop' ? styles.sendOrderDesktop : styles.sendOrderMobile}>
      <button
        type="button"
        className={styles.sendOrderBtn}
        disabled={disabled}
        aria-label="Enviar pedido por WhatsApp al restaurante"
        onClick={onSend}
      >
        <WhatsappIcon className={styles.sendOrderIcon} />
        <span>Enviar pedido</span>
      </button>
      {sendErrorMessage ? (
        <p className={`${styles.sendOrderHint} ${styles.sendOrderHintBlocked}`} role="alert">
          {sendErrorMessage}
        </p>
      ) : disabled && disabledReason ? (
        <p className={styles.sendOrderHint} role="status">
          {disabledReason}
        </p>
      ) : (
        <p className={styles.sendOrderHint}>
          Se abrirá WhatsApp con el detalle completo de tu pedido.
        </p>
      )}
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
  couponDiscount,
  couponLabel,
  total,
  deliveryFee = 0,
  deliveryFeeWaived = false,
  couponDeliveryWaived = false,
  promoFreeShippingLabel = null,
  thresholdHints = [],
  isDelivery = false,
  variant,
}: {
  currency: string;
  itemCount: number;
  subtotalBefore: number;
  lineDiscountTotal: number;
  orderDiscount: number;
  orderPromoLabel: string | null;
  couponDiscount: number;
  couponLabel: string | null;
  total: number;
  deliveryFee?: number;
  deliveryFeeWaived?: boolean;
  couponDeliveryWaived?: boolean;
  promoFreeShippingLabel?: string | null;
  thresholdHints?: OrderThresholdHint[];
  isDelivery?: boolean;
  variant: 'mobile' | 'desktop';
}) {
  const itemLabel = itemCount === 1 ? '1 artículo' : `${itemCount} artículos`;
  const grandTotal = total + deliveryFee;
  const showCouponRow = Boolean(
    couponLabel && (couponDiscount > 0 || couponDeliveryWaived),
  );
  const showDeliveryRow = isDelivery;
  const cardClass =
    variant === 'desktop'
      ? `${styles.totalsCard} ${styles.totalsCardDesktop}`
      : `${styles.totalsCard} ${styles.totalsCardMobile}`;

  return (
    <div className={cardClass}>
      {variant === 'desktop' ? (
        <h2 className={styles.totalsTitle}>Total del pedido</h2>
      ) : (
        <h3 className={styles.mobileTotalsTitle}>Resumen de costos</h3>
      )}

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

        {promoFreeShippingLabel ? (
          <div className={styles.totalsRow}>
            <span className={styles.totalsRowLabel}>
              Promoción
              <span className={styles.totalsRowHint}>{promoFreeShippingLabel}</span>
            </span>
            <span className={`${styles.totalsRowValue} ${styles.totalsRowDiscount}`}>
              Envío gratis
            </span>
          </div>
        ) : null}

        {showCouponRow ? (
          <div className={styles.totalsRow}>
            <span className={styles.totalsRowLabel}>
              Cupón
              <span className={styles.totalsRowHint}>{couponLabel}</span>
            </span>
            <span className={`${styles.totalsRowValue} ${styles.totalsRowDiscount}`}>
              {couponDeliveryWaived && couponDiscount <= 0
                ? 'Envío gratis'
                : `-${formatMoney(couponDiscount, currency)}`}
            </span>
          </div>
        ) : null}

        {showDeliveryRow ? (
          <div className={styles.totalsRow}>
            <span className={styles.totalsRowLabel}>Costo de envío</span>
            <span className={deliveryFeeWaived ? styles.priceRowValueFree : styles.totalsRowValue}>
              {deliveryFeeWaived
                ? 'Gratis'
                : deliveryFee > 0
                  ? formatMoney(deliveryFee, currency)
                  : 'Por confirmar'}
            </span>
          </div>
        ) : null}
      </div>

      {thresholdHints.length > 0 ? (
        <div className={styles.thresholdHints} role="status">
          {thresholdHints.map((hint) => (
            <p key={hint.promotionId} className={styles.thresholdHint}>
              {hint.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className={styles.totalsDivider} aria-hidden />

      {variant === 'mobile' ? (
        <div className={styles.mobileTotalsFooter}>
          <p className={styles.totalsFinalLabel}>Total a pagar</p>
          <p className={styles.totalsFinalValue}>{formatMoney(grandTotal, currency)}</p>
        </div>
      ) : (
        <div>
          <p className={styles.totalsFinalLabel}>Total final</p>
          <p className={styles.totalsFinalValue}>{formatMoney(grandTotal, currency)}</p>
        </div>
      )}

      {variant === 'desktop' && (deliveryFee > 0 || deliveryFeeWaived || isDelivery) ? (
        <p className={styles.totalsNote}>
          {deliveryFee > 0 || deliveryFeeWaived
            ? 'El envío ya está incluido en el total final.'
            : 'El costo de envío se confirma al enviar el pedido.'}
        </p>
      ) : isDelivery ? (
        <p className={styles.totalsNoteMobile}>
          {deliveryFeeWaived
            ? 'El envío va incluido en tu total.'
            : deliveryFee > 0
              ? 'El envío ya está incluido en el total.'
              : 'Revisa el total antes de enviar.'}
        </p>
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
          <ProductImagePlaceholder
            name={cartLine.productName}
            variant="compact"
            className={styles.thumb}
          />
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
  subdomain,
  restaurantName,
  restaurantLocation,
  whatsappPhone,
  schedules,
  lines,
  quote,
  products,
  promotions,
  currency,
  fulfillment,
  onFulfillmentChange,
  couponDraft,
  onCouponDraftChange,
  appliedCouponCode,
  onApplyCoupon,
  onRemoveCoupon,
  quoteLoading,
  onBack,
  onOrderSent,
  isTabletLayout = false,
}: PublicMenuCheckoutSummaryProps) {
  const [collapsedLineIds, setCollapsedLineIds] = useState<Set<string>>(() => new Set());
  const [sendAttempted, setSendAttempted] = useState(false);
  const [closedSendMessage, setClosedSendMessage] = useState<string | null>(null);

  useEffect(() => {
    setClosedSendMessage(null);
  }, [fulfillment.serviceType]);

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
  const freeShippingPromo = quote.applied_free_shipping_promotion_id
    ? promotionsById.get(quote.applied_free_shipping_promotion_id)
    : undefined;
  const promoFreeShippingLabel = promotionDisplayName(freeShippingPromo);
  const thresholdHints = useMemo(
    () =>
      listUnmetOrderThresholdHints(
        promotions,
        quoteEligibleSubtotalCents(quote),
        quoteNow,
        quote.timezone,
        {
          serviceType: fulfillment.serviceType,
          appliedOrderPromotionId: quote.applied_order_promotion_id,
          appliedFreeShippingPromotionId: quote.applied_free_shipping_promotion_id ?? null,
        },
      ),
    [
      promotions,
      quote,
      quoteNow,
      fulfillment.serviceType,
    ],
  );
  const deliveryFeeCents =
    fulfillment.serviceType === 'delivery'
      ? Math.max(
          0,
          (quote.delivery_fee_cents ?? fulfillment.deliveryFeeCents ?? 0) -
            Math.max(quote.waived_delivery_cents ?? 0, quote.coupon?.waived_delivery_cents ?? 0),
        )
      : 0;
  const deliveryFee = deliveryFeeCents / 100;
  const deliveryWaivedByCoupon =
    fulfillment.serviceType === 'delivery' &&
    (quote.coupon?.type === 'free_shipping' || (quote.coupon?.waived_delivery_cents ?? 0) > 0);
  const deliveryFeeWaived =
    fulfillment.serviceType === 'delivery' &&
    (Boolean(freeShippingPromo) ||
      deliveryWaivedByCoupon ||
      (quote.waived_delivery_cents ?? 0) > 0);
  const couponDiscountCents = quote.coupon?.discount_cents ?? 0;
  const couponDiscount = couponDiscountCents / 100;
  const couponLabel = quote.coupon?.code ?? appliedCouponCode;
  const orderTotalCents = quote.total_cents + deliveryFeeCents;
  const showCashDenomination = needsCashDenomination(fulfillment);
  const cashDenominationValid =
    !showCashDenomination ||
    isCashDenominationValid(fulfillment.cashDenominationCents, orderTotalCents);

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

  const whatsappConfigured = whatsappPhone != null && whatsappPhoneDigits(whatsappPhone).length >= 8;
  const canSendOrder =
    whatsappConfigured &&
    isCustomerContactComplete(fulfillment) &&
    fulfillment.paymentMethod != null &&
    cashDenominationValid &&
    lines.length > 0;
  const sendDisabledReason = !whatsappConfigured
    ? 'Este restaurante aún no tiene WhatsApp de pedidos configurado.'
    : showCashDenomination && !cashDenominationValid
      ? 'Indica con qué monto pagarás para enviar el pedido.'
      : null;

  const handleCashDenominationChange = (cashDenominationCents: number | null) => {
    onFulfillmentChange({ ...fulfillment, cashDenominationCents });
  };

  const cashDenominationSectionProps = {
    fulfillment,
    orderTotalCents,
    currency,
    showValidation: sendAttempted,
    onChange: handleCashDenominationChange,
  };

  const handleSendOrder = () => {
    if (!whatsappPhone || !fulfillment.paymentMethod) return;
    if (!cashDenominationValid) {
      setSendAttempted(true);
      const sections = document.querySelectorAll('[data-cash-denomination-section]');
      for (const section of sections) {
        if (section instanceof HTMLElement && section.offsetParent !== null) {
          section.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
      return;
    }
    if (!canSendOrder) return;

    const openStatus = resolveCheckoutRestaurantOpenStatus(schedules, new Date());
    if (!isRestaurantOpenForCheckout(openStatus, schedules)) {
      setClosedSendMessage(buildCheckoutClosedMessage(openStatus));
      return;
    }

    setClosedSendMessage(null);

    const { orderId, idempotencyKey } = createCheckoutOrderRef();

    const message = formatWhatsAppOrderMessage({
      orderId,
      restaurantName,
      restaurantLocation,
      currency,
      lines,
      quote,
      fulfillment,
      productsById,
      promotionsById,
      itemCount,
    });
    const payload = buildPublicOrderInput(
      lines,
      fulfillment,
      orderId,
      quote.coupon?.code ?? null,
    );

    submitPublicOrderBackground(subdomain, payload, idempotencyKey);
    openWhatsAppOrder(whatsappPhone, message);
    onOrderSent();
  };

  return (
    <div className={`${styles.checkoutSummary} ${isTabletLayout ? menuStyles.publicTablet : ''}`}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          aria-label="Volver a completar pedido"
          onClick={onBack}
        >
          <ArrowBackIcon fontSize="small" />
        </button>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Confirmar pedido</h1>
          <p className={styles.headerMeta}>
            {itemCount === 1 ? '1 artículo' : `${itemCount} artículos`} · revisa antes de enviar
          </p>
        </div>
      </header>

      <div className={styles.body}>
        <FulfillmentSummary fulfillment={fulfillment} />

        {showCashDenomination ? (
          <div className={styles.cashDenominationInline}>
            <CheckoutCashDenominationSection
              {...cashDenominationSectionProps}
              variant="inline"
              idSuffix="inline"
            />
          </div>
        ) : null}

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
          <div className={styles.sidebarStack}>
            <CouponSection
              variant="desktop"
              couponDraft={couponDraft}
              onCouponDraftChange={onCouponDraftChange}
              quote={quote}
              currency={currency}
              quoteLoading={quoteLoading}
              onApplyCoupon={onApplyCoupon}
              onRemoveCoupon={onRemoveCoupon}
            />
            <TotalsPanel
              currency={currency}
              itemCount={itemCount}
              subtotalBefore={subtotalBefore}
              lineDiscountTotal={lineDiscountTotal}
              orderDiscount={orderDiscount}
              orderPromoLabel={orderPromoLabel}
              couponDiscount={couponDiscount}
              couponLabel={couponLabel}
              total={total}
              deliveryFee={deliveryFee}
              deliveryFeeWaived={deliveryFeeWaived}
              couponDeliveryWaived={deliveryWaivedByCoupon}
              promoFreeShippingLabel={promoFreeShippingLabel}
              thresholdHints={thresholdHints}
              isDelivery={fulfillment.serviceType === 'delivery'}
              variant="desktop"
            />
            {showCashDenomination ? (
              <CheckoutCashDenominationSection
                {...cashDenominationSectionProps}
                variant="sidebar"
                idSuffix="sidebar"
              />
            ) : null}
            <SendOrderButton
              variant="desktop"
              disabled={!whatsappConfigured || lines.length === 0}
              disabledReason={sendDisabledReason}
              sendErrorMessage={closedSendMessage}
              onSend={handleSendOrder}
            />
          </div>
        </aside>
      </div>

      <footer className={styles.totalsBarMobile} aria-label="Total del pedido">
        <CouponSection
          variant="mobile"
          couponDraft={couponDraft}
          onCouponDraftChange={onCouponDraftChange}
          quote={quote}
          currency={currency}
          quoteLoading={quoteLoading}
          onApplyCoupon={onApplyCoupon}
          onRemoveCoupon={onRemoveCoupon}
        />
        <TotalsPanel
          currency={currency}
          itemCount={itemCount}
          subtotalBefore={subtotalBefore}
          lineDiscountTotal={lineDiscountTotal}
          orderDiscount={orderDiscount}
          orderPromoLabel={orderPromoLabel}
          couponDiscount={couponDiscount}
          couponLabel={couponLabel}
          total={total}
          deliveryFee={deliveryFee}
          deliveryFeeWaived={deliveryFeeWaived}
          couponDeliveryWaived={deliveryWaivedByCoupon}
          promoFreeShippingLabel={promoFreeShippingLabel}
          thresholdHints={thresholdHints}
          isDelivery={fulfillment.serviceType === 'delivery'}
          variant="mobile"
        />
        <SendOrderButton
          variant="mobile"
          disabled={!whatsappConfigured || lines.length === 0}
          disabledReason={sendDisabledReason}
          sendErrorMessage={closedSendMessage}
          onSend={handleSendOrder}
        />
      </footer>
    </div>
  );
}
