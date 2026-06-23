'use client';

import { useEffect, useMemo, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { cartItemCount, lineTotalCents } from '@/lib/digital-menu/cart/cartMath';
import { resolveCartLinePromoDisplay } from '@/lib/digital-menu/cart/cartLinePromoDisplay';
import { useCheckoutCartQuote } from '@/lib/digital-menu/cart/useCheckoutCartQuote';
import type { PublicMenuCartLine } from '@/lib/digital-menu/cart/types';
import type { Product, Promotion } from '@/lib/api/types';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import { promoWarningLabel } from '@/lib/promotions/bundlePromoEligibility';
import { formatMoney } from '@/lib/currency';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { ProductImagePlaceholder } from '@/components/digital-menu/ProductImagePlaceholder';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import { PublicMenuCheckoutDetails } from './PublicMenuCheckoutDetails';
import { PublicMenuCheckoutSummary } from './PublicMenuCheckoutSummary';
import {
  type CheckoutFulfillment,
  EMPTY_DELIVERY_LOCATION,
} from '@/lib/digital-menu/checkout/fulfillment';
import {
  readCheckoutPreferencesFromStorage,
  toStoredCheckoutPreferences,
  writeCheckoutPreferencesToStorage,
} from '@/lib/digital-menu/checkout/preferencesStorage';
import styles from './PublicMenuCart.module.css';

type CheckoutStep = 'cart' | 'fulfillment' | 'summary';

function createFallbackFulfillment(subdomain: string): CheckoutFulfillment {
  const saved = readCheckoutPreferencesFromStorage(subdomain);
  if (saved) {
    return {
      ...saved,
      deliveryFeeCents: null,
    };
  }
  return {
    serviceType: 'delivery',
    ...EMPTY_DELIVERY_LOCATION,
    paymentMethod: null,
  };
}

type PublicMenuCartProps = {
  subdomain: string;
  lines: PublicMenuCartLine[];
  validProductIds: ReadonlySet<string>;
  products: Product[];
  promotions: Promotion[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  currency: string;
  onBack: () => void;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
  onRemoveLine: (lineId: string) => void;
  isTabletLayout?: boolean;
};

function CartOrderSummary({
  itemCount,
  subtotal,
  subtotalBefore,
  promoSavings,
  currency,
  quoteError,
  promosApplied,
  quoteLoading,
  onContinue,
  canContinue,
  variant,
}: {
  itemCount: number;
  subtotal: number;
  subtotalBefore: number | null;
  promoSavings: number;
  currency: string;
  quoteError: string | null;
  promosApplied: boolean;
  quoteLoading: boolean;
  onContinue: () => void;
  canContinue: boolean;
  variant: 'mobile' | 'desktop';
}) {
  const itemLabel = itemCount === 1 ? '1 artículo' : `${itemCount} artículos`;

  return (
    <div
      className={`${styles.summaryCard} ${variant === 'desktop' ? styles.summaryCardDesktop : styles.summaryCardMobile}`}
    >
      {variant === 'desktop' ? (
        <h2 className={styles.summaryTitle}>Resumen del pedido</h2>
      ) : null}

      {quoteError ? (
        <p className={styles.quoteError} role="alert">
          {quoteError}
        </p>
      ) : null}

      <div className={styles.summaryRows}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryRowLabel}>{itemLabel}</span>
          <span className={styles.summaryRowValue}>
            {formatMoney(subtotalBefore ?? subtotal, currency)}
          </span>
        </div>
        {promoSavings > 0 ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryRowLabel}>Promociones</span>
            <span className={styles.summaryRowPromo}>-{formatMoney(promoSavings, currency)}</span>
          </div>
        ) : null}
      </div>

      <div className={styles.summaryDivider} aria-hidden />

      <div className={styles.summaryActionsRow}>
        <div className={styles.summaryTotalBlock}>
          <span className={styles.summaryLabel}>
            {promosApplied ? 'Subtotal' : 'Subtotal estimado'}
          </span>
          <p className={styles.summaryTotal}>{formatMoney(subtotal, currency)}</p>
        </div>

        <button
          type="button"
          className={styles.checkoutBtn}
          disabled={!canContinue || quoteLoading}
          aria-busy={quoteLoading}
          onClick={onContinue}
        >
          <span>
            {quoteLoading
              ? 'Aplicando promociones…'
              : promosApplied
                ? 'Completar pedido'
                : 'Continuar'}
          </span>
          {!quoteLoading && variant === 'desktop' ? (
            <ArrowForwardIcon sx={{ fontSize: 18 }} aria-hidden />
          ) : null}
        </button>
      </div>

      {!promosApplied ? (
        <p className={`${styles.pricingNotice} ${styles.pricingNoticeBelowBtn}`} role="status">
          <InfoOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
          <span>Al continuar aplicamos promociones vigentes y el total final.</span>
        </p>
      ) : (
        <p className={styles.summaryNote}>
          El envío se confirma al completar el pedido.
        </p>
      )}
    </div>
  );
}

export function PublicMenuCart({
  subdomain,
  lines,
  validProductIds,
  products,
  promotions,
  productDiscounts,
  currency,
  onBack,
  onUpdateQuantity,
  onRemoveLine,
  isTabletLayout = false,
}: PublicMenuCartProps) {
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('cart');
  const [fulfillment, setFulfillment] = useState<CheckoutFulfillment>(() =>
    createFallbackFulfillment(subdomain),
  );
  const [collapsedLineIds, setCollapsedLineIds] = useState<Set<string>>(() => new Set());

  const handleFulfillmentChange = (next: CheckoutFulfillment) => {
    setFulfillment(next);
    writeCheckoutPreferencesToStorage(subdomain, toStoredCheckoutPreferences(next));
  };

  const {
    displaySubtotalCents,
    quote,
    quotedLineTotalsCents,
    promosApplied,
    loading: quoteLoading,
    error: quoteError,
    applyPromotions,
    allLinesValid,
  } = useCheckoutCartQuote(subdomain, lines, validProductIds);

  const subtotal = displaySubtotalCents / 100;
  const subtotalBefore =
    quote != null ? quote.subtotal_before_discount_cents / 100 : null;
  const totalPromoSavings =
    quote != null ? (quote.subtotal_before_discount_cents - quote.total_cents) / 100 : 0;
  const itemCount = cartItemCount(lines);
  const canContinue = lines.length > 0 && allLinesValid && !quoteLoading;

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const linesKey = useMemo(
    () =>
      JSON.stringify(
        lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          quantity: line.quantity,
          selections: line.selections,
        })),
      ),
    [lines],
  );

  useEffect(() => {
    setCheckoutStep('cart');
    setFulfillment(createFallbackFulfillment(subdomain));
    setCollapsedLineIds(new Set());
  }, [linesKey, subdomain]);

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

  const handleContinue = async () => {
    if (!canContinue) return;
    if (!promosApplied) {
      const result = await applyPromotions();
      if (!result) return;
    }
    setCheckoutStep('fulfillment');
  };

  if (checkoutStep === 'fulfillment') {
    return (
      <PublicMenuCheckoutDetails
        subdomain={subdomain}
        fulfillment={fulfillment}
        onFulfillmentChange={handleFulfillmentChange}
        onBack={() => setCheckoutStep('cart')}
        onContinue={() => setCheckoutStep('summary')}
        currency={currency}
        isTabletLayout={isTabletLayout}
      />
    );
  }

  if (checkoutStep === 'summary' && quote) {
    return (
      <PublicMenuCheckoutSummary
        lines={lines}
        quote={quote}
        products={products}
        promotions={promotions}
        currency={currency}
        fulfillment={fulfillment}
        onBack={() => setCheckoutStep('fulfillment')}
        isTabletLayout={isTabletLayout}
      />
    );
  }

  return (
    <div
      className={`${styles.publicMenuCart} ${isTabletLayout ? menuStyles.publicTablet : ''}`}
    >
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} aria-label="Volver al menú" onClick={onBack}>
          <ArrowBackIcon fontSize="small" />
        </button>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Tu carrito</h1>
          {lines.length > 0 ? (
            <p className={styles.headerMeta}>
              {itemCount === 1 ? '1 artículo' : `${itemCount} artículos`}
              {!promosApplied ? (
                <span className={styles.headerMetaEstimate}> · total estimado</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      {lines.length === 0 ? (
        <p className={styles.empty}>Tu carrito está vacío. Explora el menú y agrega platillos.</p>
      ) : (
        <div className={styles.cartBody}>
          <ul className={styles.list} aria-label="Productos en el carrito">
            {lines.map((line, lineIndex) => {
              const imageUrl = storagePublicUrl(line.imagePath);
              const listTotal = lineTotalCents(line) / 100;
              const product = productsById.get(line.productId);
              const localPromo = resolveCartLinePromoDisplay(
                line,
                product,
                productDiscounts.get(line.productId),
              );
              const quotedLine = quote?.lines[lineIndex];
              const quotedTotalCents = quotedLineTotalsCents?.[lineIndex];
              const hasQuotedPromo = (quotedLine?.discount_cents ?? 0) > 0;
              const total =
                quotedTotalCents != null ? quotedTotalCents / 100 : listTotal;
              const promoBadge = promosApplied
                ? hasQuotedPromo
                  ? quotedLine?.badge
                  : null
                : localPromo.badge;
              const showOriginalPrice = promosApplied
                ? hasQuotedPromo
                : localPromo.hasCatalogDiscount;
              const originalTotal = promosApplied
                ? listTotal
                : localPromo.originalLineTotalCents != null
                  ? localPromo.originalLineTotalCents / 100
                  : null;
              const promoWarnings = quotedLine?.promo_warnings ?? [];
              const expanded = !collapsedLineIds.has(line.id);
              const panelId = `cart-line-${line.id}`;

              return (
                <li key={line.id} className={styles.lineCard}>
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className={styles.thumb} />
                  ) : (
                    <ProductImagePlaceholder
                      name={line.productName}
                      variant="compact"
                      className={styles.thumb}
                    />
                  )}

                  <div className={styles.lineBody}>
                    <div className={styles.lineTop}>
                      <div className={styles.lineTitleWrap}>
                        <h2 className={styles.lineName}>{line.productName}</h2>
                        {promoBadge ? (
                          <span className={styles.linePromoBadge}>{promoBadge}</span>
                        ) : null}
                      </div>
                      <div className={styles.lineTopActions}>
                        {!expanded ? (
                          <span className={styles.lineCollapsedPrice}>
                            {showOriginalPrice && originalTotal != null ? (
                              <>
                                <span className={styles.linePriceOriginal}>
                                  {formatMoney(originalTotal, line.currency)}
                                </span>
                                <span className={styles.linePriceSale}>
                                  {formatMoney(total, line.currency)}
                                </span>
                              </>
                            ) : (
                              formatMoney(total, line.currency)
                            )}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className={styles.lineToggleBtn}
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          onClick={() => toggleLine(line.id)}
                        >
                          {expanded ? (
                            <ExpandLessIcon sx={{ fontSize: 18 }} aria-hidden />
                          ) : (
                            <ExpandMoreIcon sx={{ fontSize: 18 }} aria-hidden />
                          )}
                          <span className={styles.srOnly}>
                            {expanded ? 'Contraer detalle' : 'Expandir detalle'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => onRemoveLine(line.id)}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>

                    {promoWarnings.length > 0 ? (
                      <div className={styles.linePromoWarnings}>
                        {promoWarnings.map((warning) => {
                          const label = promoWarningLabel(warning);
                          if (!label) return null;
                          return (
                            <p key={warning} className={styles.linePromoWarning}>
                              {label}
                            </p>
                          );
                        })}
                      </div>
                    ) : null}

                    {expanded ? (
                      <div id={panelId}>
                        {line.optionSummary.length > 0 ? (
                          <ul className={styles.options}>
                            {line.optionSummary.map((group) => (
                              <li key={group.groupTitle} className={styles.optionGroup}>
                                <span className={styles.optionGroupLabel}>{group.groupTitle}: </span>
                                {group.itemLabels.join(', ')}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {line.notes ? (
                          <p className={styles.lineNotes}>
                            <span className={styles.lineNotesLabel}>Nota: </span>
                            {line.notes}
                          </p>
                        ) : null}

                        <div className={styles.lineFooter}>
                          <div
                            className={styles.qtyStepper}
                            aria-label={`Cantidad de ${line.productName}`}
                          >
                            <button
                              type="button"
                              className={styles.qtyBtn}
                              aria-label="Disminuir cantidad"
                              onClick={() => onUpdateQuantity(line.id, line.quantity - 1)}
                            >
                              <RemoveIcon sx={{ fontSize: 18 }} />
                            </button>
                            <span className={styles.qtyValue} aria-live="polite">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              className={styles.qtyBtn}
                              aria-label="Aumentar cantidad"
                              onClick={() => onUpdateQuantity(line.id, line.quantity + 1)}
                            >
                              <AddIcon sx={{ fontSize: 18 }} />
                            </button>
                          </div>
                          <span className={styles.linePrice}>
                            {showOriginalPrice && originalTotal != null ? (
                              <>
                                <span className={styles.linePriceOriginal}>
                                  {formatMoney(originalTotal, line.currency)}
                                </span>
                                <span className={styles.linePriceSale}>
                                  {formatMoney(total, line.currency)}
                                </span>
                              </>
                            ) : (
                              formatMoney(total, line.currency)
                            )}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className={styles.summaryAside} aria-label="Resumen del pedido">
            <CartOrderSummary
              itemCount={itemCount}
              subtotal={subtotal}
              subtotalBefore={subtotalBefore}
              promoSavings={totalPromoSavings}
              currency={currency}
              quoteError={quoteError}
              promosApplied={promosApplied}
              quoteLoading={quoteLoading}
          onContinue={() => void handleContinue()}
          canContinue={canContinue}
          variant="desktop"
        />
          </aside>
        </div>
      )}

      {lines.length > 0 ? (
        <footer className={styles.summaryBarMobile} aria-label="Resumen del pedido">
          <CartOrderSummary
            itemCount={itemCount}
            subtotal={subtotal}
            subtotalBefore={subtotalBefore}
            promoSavings={totalPromoSavings}
            currency={currency}
            quoteError={quoteError}
            promosApplied={promosApplied}
            quoteLoading={quoteLoading}
            onContinue={() => void handleContinue()}
            canContinue={canContinue}
            variant="mobile"
          />
        </footer>
      ) : null}
    </div>
  );
}
