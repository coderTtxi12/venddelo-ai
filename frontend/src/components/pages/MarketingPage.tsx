'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './MarketingPage.module.css';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney } from '@/lib/currency';
import { listCategories, listProducts } from '@/lib/api/menu';
import type { Category, Product, Promotion } from '@/lib/api/types';
import { deletePromotion, listAllPromotions } from '@/lib/api/promotions';
import { mapPromotionToForm, PROMOTION_STATUS_HELP } from '@/lib/promotions/mapPromotionToForm';
import { persistPromotion } from '@/lib/promotions/persistPromotion';
import { PRODUCT_CATALOG_DISCOUNT_PREFIX } from '@/lib/promotions/productCatalogDiscount';
import {
  deletePromotionDraft,
  draftDiscountSummary,
  draftScheduleSummary,
  kindLabel,
  loadPromotionDrafts,
  type PromotionDraft,
} from '@/lib/promotions/promotionDraft';
import { PromotionForm, type PromotionFormSubmitPayload } from '@/components/marketing/PromotionForm';
import { legacyDb as db } from '@/services/legacyDb';
import { resolveSupplierIdByEmail } from '@/services/db';

function isManualPromotion(promotion: Promotion): boolean {
  return !promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX);
}

function scopeLabel(scope: Promotion['scope']): string {
  if (scope === 'product') return 'Producto(s)';
  if (scope === 'category') return 'Categoría(s)';
  return 'Pedido completo';
}

function typeLabel(type: Promotion['type']): string {
  if (type === 'percent') return 'Porcentaje';
  if (type === 'amount') return 'Monto fijo';
  if (type === 'combo') return 'Combo';
  if (type === 'bundle' || type === '2x1') return 'N×M';
  return type;
}

function discountSummary(promotion: Promotion): string {
  if (promotion.type === 'percent' && promotion.percent != null) {
    return `${promotion.percent}%`;
  }
  if (promotion.type === 'amount' && promotion.amount_cents != null) {
    return formatMoney(promotion.amount_cents / 100);
  }
  if (promotion.type === 'combo') return 'Combo';
  if (promotion.type === 'bundle' || promotion.type === '2x1') {
    const getQ = promotion.bundle?.get_quantity ?? 2;
    const payQ = promotion.bundle?.pay_quantity ?? 1;
    return `${getQ}×${payQ}`;
  }
  return '—';
}

function statusLabel(promotion: Promotion): string {
  if (promotion.effective_status === 'active') return 'Vigente ahora';
  if (promotion.effective_status === 'scheduled') return 'Programada';
  if (promotion.effective_status === 'expired') return 'Expirada';
  if (promotion.effective_status === 'outside_schedule') return 'Fuera de horario';
  return promotion.is_active ? 'Activa' : 'Inactiva';
}

function formatDateRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return 'Sin vigencia';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  if (startsAt && endsAt) return `${fmt(startsAt)} – ${fmt(endsAt)}`;
  if (startsAt) return `Desde ${fmt(startsAt)}`;
  return `Hasta ${fmt(endsAt!)}`;
}

async function loadAllCategories(token: string, restaurantId: string): Promise<Category[]> {
  const items: Category[] = [];
  let cursor: string | null = null;
  do {
    const page = await listCategories(token, restaurantId, 20, cursor);
    items.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return items;
}

async function loadAllProducts(token: string, restaurantId: string): Promise<Product[]> {
  const items: Product[] = [];
  let cursor: string | null = null;
  do {
    const page = await listProducts(token, restaurantId, 20, cursor);
    items.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return items;
}

function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.drawerBackdrop} onClick={onClose} role="presentation">
      <div
        className={styles.drawer}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>{title}</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className={styles.drawerBody}>{children}</div>
      </div>
    </div>
  );
}

export default function MarketingPage() {
  const { accessToken, user } = useAuth();
  const email = user?.email ?? null;

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [drafts, setDrafts] = useState<PromotionDraft[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  const manualPromotions = useMemo(
    () => promotions.filter(isManualPromotion),
    [promotions],
  );

  const refreshDrafts = useCallback(() => {
    if (!supplierId) {
      setDrafts([]);
      return;
    }
    setDrafts(loadPromotionDrafts(supplierId));
  }, [supplierId]);

  const loadData = useCallback(async () => {
    if (!supplierId || !accessToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [promoList, categoryList, productList] = await Promise.all([
        listAllPromotions(accessToken, supplierId),
        loadAllCategories(accessToken, supplierId),
        loadAllProducts(accessToken, supplierId),
      ]);
      setPromotions(promoList);
      setCategories(categoryList.filter((c) => c.is_active));
      setProducts(productList.filter((p) => p.status === 'active'));
      refreshDrafts();
    } catch (err) {
      console.error(err);
      setLoadError('No se pudieron cargar las promociones. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, supplierId, refreshDrafts]);

  useEffect(() => {
    if (!email || !accessToken) return;
    void (async () => {
      try {
        const result = await resolveSupplierIdByEmail(db, email, accessToken, {
          userId: user?.uid,
        });
        if ('error' in result) {
          setSupplierError(result.error);
          setSupplierId(null);
        } else {
          setSupplierId(result.supplierId);
          setSupplierError(null);
        }
      } catch (err) {
        console.error(err);
        setSupplierError('No se pudo determinar tu restaurante.');
      }
    })();
  }, [email, accessToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    refreshDrafts();
  }, [refreshDrafts]);

  function openCreateDrawer() {
    setEditingPromotion(null);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(promotion: Promotion) {
    setEditingPromotion(promotion);
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving) return;
    setDrawerOpen(false);
    setEditingPromotion(null);
  }

  async function handleSavePromotion(payload: PromotionFormSubmitPayload) {
    if (!supplierId || !accessToken) {
      setFormError(supplierError ?? 'No hay restaurante disponible.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const saved = await persistPromotion(
        accessToken,
        supplierId,
        payload,
        editingPromotion?.id ?? null,
      );
      setPromotions((prev) => {
        const index = prev.findIndex((promotion) => promotion.id === saved.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      closeDrawer();
    } catch (err) {
      console.error(err);
      setFormError(
        editingPromotion
          ? 'No se pudieron guardar los cambios. Revisa los datos e intenta de nuevo.'
          : 'No se pudo guardar la promoción. Revisa los datos e intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteDraft(draftId: string) {
    if (!supplierId) return;
    setDeletingDraftId(draftId);
    try {
      deletePromotionDraft(supplierId, draftId);
      refreshDrafts();
    } finally {
      setDeletingDraftId(null);
    }
  }


  async function handleDeletePromotion(promotionId: string) {
    if (!supplierId || !accessToken) return;
    setDeletingId(promotionId);
    try {
      await deletePromotion(accessToken, supplierId, promotionId);
      setPromotions((prev) => prev.filter((promotion) => promotion.id !== promotionId));
    } catch (err) {
      console.error(err);
      setLoadError('No se pudo eliminar la promoción.');
    } finally {
      setDeletingId(null);
    }
  }

  const totalCount = manualPromotions.length + drafts.length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Marketing</h1>
          <p className={styles.subtitle}>
            Configura promociones con días, horarios, ofertas N×M y complementos. Los descuentos de
            catálogo siguen en cada producto.
          </p>
          <p className={styles.marketingBundleBadge}>
            N×M: se cobra el de mayor precio (con descuento de catálogo si aplica)
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={openCreateDrawer}
          disabled={!supplierId || !!supplierError}
        >
          + Agregar promoción personalizada
        </button>
      </div>

      <section className={styles.section}>
        <div className={styles.counter}>
          {loading
            ? 'Cargando…'
            : `${totalCount} promoción${totalCount === 1 ? '' : 'es'} (${drafts.length} borrador${drafts.length === 1 ? '' : 'es'})`}
        </div>

        {loadError ? <div className={styles.errorBanner} role="alert">{loadError}</div> : null}

        {!loading && totalCount === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>Aún no hay promociones personalizadas</div>
            <p>Crea una promoción con días, horario y complementos.</p>
          </div>
        ) : null}

        {drafts.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Alcance</th>
                  <th>Descuento</th>
                  <th>Horario / vigencia</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td>{draft.name}</td>
                    <td>{kindLabel(draft.kind)}</td>
                    <td>{scopeLabel(draft.scope)}</td>
                    <td>{draftDiscountSummary(draft)}</td>
                    <td className={styles.muted}>{draftScheduleSummary(draft)}</td>
                    <td>
                      <span className={`${styles.pill} ${styles.pill_draft}`}>Borrador</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.dangerGhostBtn}
                        disabled={deletingDraftId === draft.id}
                        onClick={() => handleDeleteDraft(draft.id)}
                      >
                        {deletingDraftId === draft.id ? '…' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {manualPromotions.length > 0 ? (
          <div className={styles.tableWrap}>
            <p className={styles.statusLegend}>
              <strong>Vigente ahora</strong> significa que la promoción aplica en este momento según
              el reloj del servidor, la zona horaria del restaurante y los días/horarios configurados.
            </p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Alcance</th>
                  <th>Descuento</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {manualPromotions.map((promotion) => (
                  <tr
                    key={promotion.id}
                    className={styles.tableRowClickable}
                    tabIndex={0}
                    role="button"
                    aria-label={`Editar promoción ${promotion.name}`}
                    onClick={() => openEditDrawer(promotion)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openEditDrawer(promotion);
                      }
                    }}
                  >
                    <td>{promotion.name}</td>
                    <td>{typeLabel(promotion.type)}</td>
                    <td>{scopeLabel(promotion.scope)}</td>
                    <td>{discountSummary(promotion)}</td>
                    <td className={styles.muted}>
                      {formatDateRange(promotion.starts_at, promotion.ends_at)}
                    </td>
                    <td>
                      <span
                        className={`${styles.pill} ${
                          promotion.effective_status === 'active'
                            ? styles.pill_success
                            : styles.pill_neutral
                        }`}
                        title={
                          PROMOTION_STATUS_HELP[promotion.effective_status ?? 'inactive'] ??
                          undefined
                        }
                      >
                        {statusLabel(promotion)}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.editGhostBtn}
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditDrawer(promotion);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={styles.dangerGhostBtn}
                        disabled={deletingId === promotion.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeletePromotion(promotion.id);
                        }}
                      >
                        {deletingId === promotion.id ? '…' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <Drawer
        open={drawerOpen}
        title={editingPromotion ? 'Editar promoción' : 'Agregar promoción personalizada'}
        onClose={closeDrawer}
      >
        {supplierId && accessToken ? (
        <PromotionForm
          key={editingPromotion?.id ?? 'create'}
          restaurantId={supplierId}
          accessToken={accessToken}
          categories={categories}
          products={products}
          saving={saving}
          error={formError}
          mode={editingPromotion ? 'edit' : 'create'}
          initialValues={
            editingPromotion ? mapPromotionToForm(editingPromotion) : null
          }
          onCancel={closeDrawer}
          onSubmit={handleSavePromotion}
        />
        ) : null}
      </Drawer>
    </div>
  );
}
