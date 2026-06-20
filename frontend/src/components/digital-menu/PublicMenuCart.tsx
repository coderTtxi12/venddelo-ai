'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { cartItemCount, lineTotalCents } from '@/lib/digital-menu/cart/cartMath';
import type { PublicMenuCartLine } from '@/lib/digital-menu/cart/types';
import { formatMoney } from '@/lib/currency';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import styles from './PublicMenuCart.module.css';

type PublicMenuCartProps = {
  lines: PublicMenuCartLine[];
  subtotalCents: number;
  currency: string;
  onBack: () => void;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
  onRemoveLine: (lineId: string) => void;
  isTabletLayout?: boolean;
};

function CartOrderSummary({
  itemCount,
  subtotal,
  currency,
  variant,
}: {
  itemCount: number;
  subtotal: number;
  currency: string;
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

      <div className={styles.summaryRows}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryRowLabel}>{itemLabel}</span>
          <span className={styles.summaryRowValue}>{formatMoney(subtotal, currency)}</span>
        </div>
      </div>

      <div className={styles.summaryDivider} aria-hidden />

      <div className={styles.summaryTotalBlock}>
        <span className={styles.summaryLabel}>Subtotal</span>
        <p className={styles.summaryTotal}>{formatMoney(subtotal, currency)}</p>
      </div>

      <button type="button" className={styles.checkoutBtn} disabled aria-disabled="true">
        <span>Continuar</span>
        {variant === 'desktop' ? <ArrowForwardIcon sx={{ fontSize: 18 }} aria-hidden /> : null}
      </button>

      {variant === 'desktop' ? (
        <p className={styles.summaryNote}>Impuestos y cargos de envío se calculan al continuar.</p>
      ) : null}
    </div>
  );
}

export function PublicMenuCart({
  lines,
  subtotalCents,
  currency,
  onBack,
  onUpdateQuantity,
  onRemoveLine,
  isTabletLayout = false,
}: PublicMenuCartProps) {
  const subtotal = subtotalCents / 100;
  const itemCount = cartItemCount(lines);

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
            </p>
          ) : null}
        </div>
      </header>

      {lines.length === 0 ? (
        <p className={styles.empty}>Tu carrito está vacío. Explora el menú y agrega platillos.</p>
      ) : (
        <div className={styles.cartBody}>
          <ul className={styles.list} aria-label="Productos en el carrito">
            {lines.map((line) => {
              const imageUrl = storagePublicUrl(line.imagePath);
              const total = lineTotalCents(line) / 100;

              return (
                <li key={line.id} className={styles.lineCard}>
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className={styles.thumb} />
                  ) : (
                    <div className={styles.thumbPlaceholder} aria-hidden />
                  )}

                  <div className={styles.lineBody}>
                    <div className={styles.lineTop}>
                      <h2 className={styles.lineName}>{line.productName}</h2>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => onRemoveLine(line.id)}
                      >
                        Quitar
                      </button>
                    </div>

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
                      <div className={styles.qtyStepper} aria-label={`Cantidad de ${line.productName}`}>
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
                      <span className={styles.linePrice}>{formatMoney(total, line.currency)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className={styles.summaryAside} aria-label="Resumen del pedido">
            <CartOrderSummary
              itemCount={itemCount}
              subtotal={subtotal}
              currency={currency}
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
            currency={currency}
            variant="mobile"
          />
        </footer>
      ) : null}
    </div>
  );
}
