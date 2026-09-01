'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import {
  effectiveExpiresOn,
  expiryDraftFromProduct,
  expirySavePayload,
  expirySelectValue,
  formatExpiryHint,
  inventoryQtyNeedsSave,
  parseInventoryQtyDraft,
  parseShelfLifeDaysDraft,
  todayIsoDate,
  type ExpiryDraft,
} from '@/components/products/productInventory';
import { InventoryExpirySelect } from '@/components/products/InventoryExpirySelect';
import styles from '@/components/pages/ProductsPage.module.css';
import type { ProductDraft } from '@/services/db';

const AUTOSAVE_MS = 500;
const SAVED_VISIBLE_MS = 2200;

export type InventoryInlinePatch =
  | { kind: 'qty'; inventoryQty: number | null }
  | { kind: 'expiry'; expiresOn: string | null; shelfLifeDays: number | null };

type FieldStatus = 'idle' | 'saving' | 'saved' | 'error';

export function ProductInventoryInlineCells({
  product,
  disabled,
  showStock = true,
  showExpiry = true,
  onPersist,
  onAnnounce,
}: {
  product: ProductDraft;
  disabled: boolean;
  showStock?: boolean;
  showExpiry?: boolean;
  onPersist: (patch: InventoryInlinePatch) => Promise<void>;
  onAnnounce: (message: string) => void;
}) {
  const savedExpiry = expiryDraftFromProduct({
    expiresOn: product.expiresOn ?? null,
    shelfLifeDays: product.shelfLifeDays ?? null,
  });
  const effectiveExpiry = effectiveExpiresOn({
    expiresOn: product.expiresOn ?? null,
    shelfLifeDays: product.shelfLifeDays ?? null,
    batchStartedAt: product.batchStartedAt ?? null,
  });

  const [qtyDraft, setQtyDraft] = useState(
    product.inventoryQty == null ? '' : String(product.inventoryQty),
  );
  const [expiryDraft, setExpiryDraft] = useState<ExpiryDraft>(savedExpiry);
  const [customDaysText, setCustomDaysText] = useState(
    expirySelectValue(savedExpiry) === 'custom' && savedExpiry.mode === 'days'
      ? String(savedExpiry.days)
      : '',
  );
  const [qtyStatus, setQtyStatus] = useState<FieldStatus>('idle');
  const [expiryStatus, setExpiryStatus] = useState<FieldStatus>('idle');
  const [qtyError, setQtyError] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [forceDateMode, setForceDateMode] = useState(false);

  const qtyDirty = useRef(false);
  const expiryDirty = useRef(false);
  const qtyTimer = useRef<number | null>(null);
  const expiryTimer = useRef<number | null>(null);
  const qtySavedTimer = useRef<number | null>(null);
  const expirySavedTimer = useRef<number | null>(null);
  const qtySeq = useRef(0);
  const expirySeq = useRef(0);

  useEffect(() => {
    if (qtyDirty.current || qtyStatus === 'saving') return;
    setQtyDraft(product.inventoryQty == null ? '' : String(product.inventoryQty));
  }, [product.id, product.inventoryQty, qtyStatus]);

  useEffect(() => {
    if (expiryDirty.current || expiryStatus === 'saving') return;
    const next = expiryDraftFromProduct({
      expiresOn: product.expiresOn ?? null,
      shelfLifeDays: product.shelfLifeDays ?? null,
    });
    setExpiryDraft(next);
    setForceDateMode(false);
    setCustomDaysText(
      expirySelectValue(next) === 'custom' && next.mode === 'days' ? String(next.days) : '',
    );
  }, [product.id, product.expiresOn, product.shelfLifeDays, expiryStatus]);

  useEffect(
    () => () => {
      if (qtyTimer.current) window.clearTimeout(qtyTimer.current);
      if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
      if (qtySavedTimer.current) window.clearTimeout(qtySavedTimer.current);
      if (expirySavedTimer.current) window.clearTimeout(expirySavedTimer.current);
    },
    [],
  );

  function markSaved(
    setStatus: (status: FieldStatus) => void,
    timerRef: MutableRefObject<number | null>,
  ) {
    setStatus('saved');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStatus('idle'), SAVED_VISIBLE_MS);
  }

  async function persistQty(nextDraft: string) {
    const parsed = parseInventoryQtyDraft(nextDraft);
    if (!parsed.ok) {
      setQtyError('Usa un número entero de 0 o más, o déjalo vacío.');
      return;
    }
    if (!inventoryQtyNeedsSave(nextDraft, product.inventoryQty ?? null)) {
      setQtyError(null);
      qtyDirty.current = false;
      return;
    }
    const seq = ++qtySeq.current;
    setQtyError(null);
    setQtyStatus('saving');
    try {
      await onPersist({ kind: 'qty', inventoryQty: parsed.qty });
      if (seq !== qtySeq.current) return;
      qtyDirty.current = false;
      markSaved(setQtyStatus, qtySavedTimer);
      onAnnounce(`Stock de ${product.name} actualizado`);
    } catch (error) {
      console.error(error);
      if (seq !== qtySeq.current) return;
      setQtyStatus('error');
      setQtyError('No se pudo guardar el stock. Intenta de nuevo.');
      onAnnounce(`No se pudo actualizar el stock de ${product.name}`);
    }
  }

  async function persistExpiry(next: ExpiryDraft) {
    const current = expiryDraftFromProduct({
      expiresOn: product.expiresOn ?? null,
      shelfLifeDays: product.shelfLifeDays ?? null,
    });
    const payload = expirySavePayload(next, current, todayIsoDate());
    if (!payload) {
      if (next.mode === 'days' && (!Number.isInteger(next.days) || next.days < 1)) {
        setExpiryError('Escribe cuántos días dura (1 o más).');
        return;
      }
      if (next.mode === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(next.date)) {
        setExpiryError('Elige una fecha.');
        return;
      }
      setExpiryError(null);
      expiryDirty.current = false;
      return;
    }
    const seq = ++expirySeq.current;
    setExpiryError(null);
    setExpiryStatus('saving');
    try {
      await onPersist({
        kind: 'expiry',
        expiresOn: payload.expiresOn,
        shelfLifeDays: payload.shelfLifeDays,
      });
      if (seq !== expirySeq.current) return;
      expiryDirty.current = false;
      markSaved(setExpiryStatus, expirySavedTimer);
      onAnnounce(`Caducidad de ${product.name} actualizada`);
    } catch (error) {
      console.error(error);
      if (seq !== expirySeq.current) return;
      setExpiryStatus('error');
      setExpiryError('No se pudo guardar la caducidad. Intenta de nuevo.');
      onAnnounce(`No se pudo actualizar la caducidad de ${product.name}`);
    }
  }

  function scheduleCustomDaysSave(text: string) {
    if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
    expiryTimer.current = window.setTimeout(() => {
      const parsed = parseShelfLifeDaysDraft(text);
      if (!parsed.ok) return;
      void persistExpiry({ mode: 'days', days: parsed.days });
    }, AUTOSAVE_MS);
  }

  function handleExpirySelect(value: string) {
    expiryDirty.current = true;
    setExpiryError(null);
    if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
    if (value === 'none') {
      setExpiryDraft({ mode: 'none' });
      setCustomDaysText('');
      setForceDateMode(false);
      void persistExpiry({ mode: 'none' });
      return;
    }
    if (value === 'today') {
      const date = todayIsoDate();
      setExpiryDraft({ mode: 'date', date });
      setCustomDaysText('');
      setForceDateMode(false);
      void persistExpiry({ mode: 'date', date });
      return;
    }
    if (value === '1' || value === '2' || value === '7') {
      const days = Number(value);
      setExpiryDraft({ mode: 'days', days });
      setCustomDaysText('');
      setForceDateMode(false);
      void persistExpiry({ mode: 'days', days });
      return;
    }
    if (value === 'custom') {
      const parsed = parseShelfLifeDaysDraft(customDaysText);
      setForceDateMode(false);
      setExpiryDraft({ mode: 'days', days: parsed.ok ? parsed.days : 0 });
      return;
    }
    const date =
      expiryDraft.mode === 'date' && expiryDraft.date ? expiryDraft.date : todayIsoDate();
    setForceDateMode(true);
    setExpiryDraft({ mode: 'date', date });
    setCustomDaysText('');
    void persistExpiry({ mode: 'date', date });
  }

  function scheduleQtySave(nextDraft: string) {
    if (qtyTimer.current) window.clearTimeout(qtyTimer.current);
    qtyTimer.current = window.setTimeout(() => {
      void persistQty(nextDraft);
    }, AUTOSAVE_MS);
  }

  const qtyHintId = `inventory-qty-hint-${product.id}`;
  const qtyErrorId = `inventory-qty-error-${product.id}`;
  const expiryHintId = `inventory-expiry-hint-${product.id}`;
  const expiryErrorId = `inventory-expiry-error-${product.id}`;
  const todayIso = todayIsoDate();
  const mappedExpiry = expirySelectValue(expiryDraft, todayIso);
  const selectValue =
    forceDateMode && expiryDraft.mode === 'date' ? 'date' : mappedExpiry;
  const expiryHint = formatExpiryHint(effectiveExpiry, todayIso);
  const expiryPast = expiryHint === 'Vencida';
  const expiryToday = expiryHint === 'Caduca hoy';

  if (!showStock && !showExpiry) return null;

  return (
    <>
      {showStock ? (
      <td
        className={`${styles.labeledCell} ${styles.inventoryCell} ${styles.stockCell}`}
        data-label="Stock"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className={styles.inventoryInline}>
          <input
            id={`product-stock-${product.id}`}
            className={`${styles.inventoryInlineInput} ${qtyStatus === 'error' ? styles.inventoryInlineInputError : ''}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            disabled={disabled}
            value={qtyDraft}
            aria-invalid={qtyError ? true : undefined}
            aria-label={`Stock de ${product.name}`}
            aria-describedby={`${qtyHintId}${qtyError ? ` ${qtyErrorId}` : ''}`}
            placeholder="—"
            onChange={(event) => {
              qtyDirty.current = true;
              setQtyError(null);
              setQtyDraft(event.target.value);
              scheduleQtySave(event.target.value);
            }}
            onBlur={() => {
              if (qtyTimer.current) window.clearTimeout(qtyTimer.current);
              void persistQty(qtyDraft);
            }}
          />
          <FieldSaveIndicator status={qtyStatus} />
        </div>
        <p id={qtyHintId} className={styles.srOnly}>
          Vacío significa que no se trackea inventario. Se guarda solo.
        </p>
        {qtyError ? (
          <p id={qtyErrorId} className={styles.inventoryInlineError} role="alert">
            {qtyError}
          </p>
        ) : null}
      </td>
      ) : null}
      {showExpiry ? (
      <td
        className={`${styles.labeledCell} ${styles.inventoryCell} ${styles.expiryCell}`}
        data-label="Caducidad"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className={styles.inventoryExpiryInline}>
          <InventoryExpirySelect
            id={`product-expiry-${product.id}`}
            productName={product.name}
            value={selectValue}
            disabled={disabled}
            invalid={Boolean(expiryError)}
            warn={expiryPast || expiryToday}
            describedBy={`${expiryHintId}${expiryError ? ` ${expiryErrorId}` : ''}`}
            onChange={handleExpirySelect}
          />
          {selectValue === 'custom' ? (
            <div className={styles.inventoryExpiryExtra}>
              <input
                className={`${styles.inventoryInlineInput} ${styles.inventoryExpiryDaysInput} ${
                  expiryStatus === 'error' ? styles.inventoryInlineInputError : ''
                }`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                disabled={disabled}
                value={customDaysText}
                aria-label={`Días de caducidad de ${product.name}`}
                placeholder="Días"
                onChange={(event) => {
                  expiryDirty.current = true;
                  setExpiryError(null);
                  setCustomDaysText(event.target.value);
                  const parsed = parseShelfLifeDaysDraft(event.target.value);
                  setExpiryDraft({ mode: 'days', days: parsed.ok ? parsed.days : 0 });
                  scheduleCustomDaysSave(event.target.value);
                }}
                onBlur={() => {
                  if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
                  const parsed = parseShelfLifeDaysDraft(customDaysText);
                  if (!parsed.ok) {
                    setExpiryError('Escribe cuántos días dura (1 o más).');
                    return;
                  }
                  void persistExpiry({ mode: 'days', days: parsed.days });
                }}
              />
              <span className={styles.inventoryExpiryUnit} aria-hidden="true">
                días
              </span>
            </div>
          ) : null}
          {selectValue === 'date' ? (
            <input
              className={`${styles.inventoryInlineInput} ${styles.inventoryInlineDate} ${
                expiryStatus === 'error'
                  ? styles.inventoryInlineInputError
                  : expiryPast || expiryToday
                    ? styles.inventoryInlineInputWarn
                    : ''
              }`}
              type="date"
              disabled={disabled}
              value={expiryDraft.mode === 'date' ? expiryDraft.date : ''}
              aria-label={`Fecha de caducidad de ${product.name}`}
              onChange={(event) => {
                expiryDirty.current = true;
                setExpiryError(null);
                const date = event.target.value;
                if (!date) {
                  setExpiryDraft({ mode: 'none' });
                  void persistExpiry({ mode: 'none' });
                  return;
                }
                setExpiryDraft({ mode: 'date', date });
                if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
                void persistExpiry({ mode: 'date', date });
              }}
            />
          ) : null}
          <FieldSaveIndicator status={expiryStatus} />
        </div>
        <p id={expiryHintId} className={styles.srOnly}>
          Elige hoy, 1 día, 2 días, 1 semana, otro plazo o una fecha. Se guarda solo.
        </p>
        {expiryError ? (
          <p id={expiryErrorId} className={styles.inventoryInlineError} role="alert">
            {expiryError}
          </p>
        ) : expiryHint && selectValue !== 'none' ? (
          <p className={`${styles.inventoryInlineHint} ${expiryPast || expiryToday ? '' : styles.inventoryInlineHintMuted}`}>
            {expiryHint}
          </p>
        ) : null}
      </td>
      ) : null}
    </>
  );
}

function FieldSaveIndicator({ status }: { status: FieldStatus }) {
  if (status === 'idle') {
    return <span className={styles.inventoryInlineStatus} aria-hidden="true" />;
  }
  if (status === 'saving') {
    return (
      <span className={styles.inventoryInlineStatus} aria-hidden="true">
        <span className={styles.inventoryInlineSpinner} />
        Guardando
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className={`${styles.inventoryInlineStatus} ${styles.inventoryInlineStatusSaved}`} aria-hidden="true">
        <CheckOutlinedIcon sx={{ fontSize: 16 }} />
        Guardado
      </span>
    );
  }
  return (
    <span className={`${styles.inventoryInlineStatus} ${styles.inventoryInlineStatusError}`} aria-hidden="true">
      <ErrorOutlineOutlinedIcon sx={{ fontSize: 16 }} />
      Error
    </span>
  );
}
