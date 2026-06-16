'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './MarketingPage.module.css';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney } from '@/lib/currency';
import { listCategories, listProducts } from '@/lib/api/menu';
import type { Category, Product, Promotion } from '@/lib/api/types';
import {
  createPromotion,
  deletePromotion,
  listAllPromotions,
  type PromotionScope,
  type PromotionType,
} from '@/lib/api/promotions';
import { PRODUCT_CATALOG_DISCOUNT_PREFIX } from '@/lib/promotions/productCatalogDiscount';
import { legacyDb as db } from '@/services/legacyDb';
import { resolveSupplierIdByEmail } from '@/services/db';

function clampNumber(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

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
  return '—';
}

function formatDateRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return 'Sin vigencia';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  if (startsAt && endsAt) return `${fmt(startsAt)} – ${fmt(endsAt)}`;
  if (startsAt) return `Desde ${fmt(startsAt)}`;
  return `Hasta ${fmt(endsAt!)}`;
}

function toIsoOrNull(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

type PromotionFormState = {
  name: string;
  type: PromotionType;
  scope: PromotionScope;
  percent: number;
  amount: number;
  minOrderAmount: number;
  startsAt: string;
  endsAt: string;
  productIds: string[];
  categoryIds: string[];
};

const emptyForm = (): PromotionFormState => ({
  name: '',
  type: 'percent',
  scope: 'product',
  percent: 10,
  amount: 0,
  minOrderAmount: 0,
  startsAt: '',
  endsAt: '',
  productIds: [],
  categoryIds: [],
});

function PromotionForm({
  categories,
  products,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  categories: Category[];
  products: Product[];
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (state: PromotionFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<PromotionFormState>(emptyForm);

  const canSave = useMemo(() => {
    if (!form.name.trim()) return false;
    if (form.type === 'percent' && (form.percent < 1 || form.percent > 100)) return false;
    if (form.type === 'amount' && form.amount <= 0) return false;
    if (form.scope === 'product' && form.productIds.length === 0) return false;
    if (form.scope === 'category' && form.categoryIds.length === 0) return false;
    if (form.startsAt && form.endsAt && new Date(form.startsAt) >= new Date(form.endsAt)) return false;
    return true;
  }, [form]);

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(form);
      }}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor="promo-name">
          Nombre de la promoción
        </label>
        <input
          id="promo-name"
          className={styles.input}
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Ej. Happy hour, 20% en bebidas"
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Tipo de descuento</span>
        <div className={styles.segment} role="group" aria-label="Tipo de descuento">
          {(
            [
              ['percent', 'Porcentaje'],
              ['amount', 'Monto fijo'],
              ['combo', 'Combo'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                form.type === value ? `${styles.segmentBtn} ${styles.segmentBtnActive}` : styles.segmentBtn
              }
              onClick={() => setForm((prev) => ({ ...prev, type: value }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Aplica a</span>
        <div className={styles.segment} role="group" aria-label="Alcance de la promoción">
          {(
            [
              ['product', 'Productos'],
              ['category', 'Categorías'],
              ['order', 'Pedido'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                form.scope === value ? `${styles.segmentBtn} ${styles.segmentBtnActive}` : styles.segmentBtn
              }
              onClick={() => setForm((prev) => ({ ...prev, scope: value }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {form.type === 'percent' ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="promo-percent">
            Porcentaje (%)
          </label>
          <input
            id="promo-percent"
            className={styles.input}
            type="number"
            min={1}
            max={100}
            step={1}
            value={form.percent}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                percent: clampNumber(Math.round(Number(e.target.value)), 1, 100),
              }))
            }
          />
        </div>
      ) : null}

      {form.type === 'amount' ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="promo-amount">
            Monto de descuento (MXN)
          </label>
          <input
            id="promo-amount"
            className={styles.input}
            type="number"
            min={0.01}
            step={0.01}
            value={form.amount}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                amount: clampNumber(Number(e.target.value), 0, 1_000_000),
              }))
            }
          />
        </div>
      ) : null}

      {form.type === 'combo' ? (
        <p className={styles.helpText}>
          Las promociones combo combinan productos o categorías seleccionados. Configura el alcance abajo.
        </p>
      ) : null}

      {form.scope === 'order' ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="promo-min-order">
            Pedido mínimo (MXN, opcional)
          </label>
          <input
            id="promo-min-order"
            className={styles.input}
            type="number"
            min={0}
            step={0.01}
            value={form.minOrderAmount}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                minOrderAmount: clampNumber(Number(e.target.value), 0, 1_000_000),
              }))
            }
          />
          <p className={styles.helpText}>Déjalo en 0 si no hay monto mínimo.</p>
        </div>
      ) : null}

      {form.scope === 'product' ? (
        <div className={styles.field}>
          <span className={styles.label}>Productos incluidos</span>
          {products.length === 0 ? (
            <p className={styles.helpText}>No hay productos disponibles.</p>
          ) : (
            <div className={styles.checkList}>
              {products.map((product) => (
                <label key={product.id} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={form.productIds.includes(product.id)}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        productIds: toggleId(prev.productIds, product.id),
                      }))
                    }
                  />
                  <span>{product.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {form.scope === 'category' ? (
        <div className={styles.field}>
          <span className={styles.label}>Categorías incluidas</span>
          {categories.length === 0 ? (
            <p className={styles.helpText}>No hay categorías disponibles.</p>
          ) : (
            <div className={styles.checkList}>
              {categories.map((category) => (
                <label key={category.id} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={form.categoryIds.includes(category.id)}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        categoryIds: toggleId(prev.categoryIds, category.id),
                      }))
                    }
                  />
                  <span>{category.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="promo-starts">
            Inicio (opcional)
          </label>
          <input
            id="promo-starts"
            className={styles.input}
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="promo-ends">
            Fin (opcional)
          </label>
          <input
            id="promo-ends"
            className={styles.input}
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
          />
        </div>
      </div>

      {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}

      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryBtn} disabled={!canSave || saving}>
          {saving ? 'Guardando…' : 'Crear promoción'}
        </button>
      </div>
    </form>
  );
}

export default function MarketingPage() {
  const { accessToken, user } = useAuth();
  const email = user?.email ?? null;

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const manualPromotions = useMemo(
    () => promotions.filter(isManualPromotion),
    [promotions],
  );

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
      setProducts(productList.filter((p) => p.is_active));
    } catch (err) {
      console.error(err);
      setLoadError('No se pudieron cargar las promociones. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, supplierId]);

  useEffect(() => {
    if (!email || !accessToken) return;
    void (async () => {
      try {
        const result = await resolveSupplierIdByEmail(db, email, accessToken);
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

  async function handleCreatePromotion(state: PromotionFormState) {
    if (!supplierId || !accessToken) {
      setFormError(supplierError ?? 'No hay sesión o restaurante disponible.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createPromotion(accessToken, supplierId, {
        name: state.name.trim(),
        type: state.type,
        scope: state.scope,
        percent: state.type === 'percent' ? state.percent : null,
        amount_cents: state.type === 'amount' ? Math.round(state.amount * 100) : null,
        min_order_cents:
          state.scope === 'order' && state.minOrderAmount > 0
            ? Math.round(state.minOrderAmount * 100)
            : null,
        starts_at: toIsoOrNull(state.startsAt),
        ends_at: toIsoOrNull(state.endsAt),
        product_ids: state.scope === 'product' ? state.productIds : [],
        category_ids: state.scope === 'category' ? state.categoryIds : [],
      });
      setDrawerOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
      setFormError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo crear la promoción. Revisa los datos e inténtalo de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePromotion(promotionId: string) {
    if (!supplierId || !accessToken) return;
    setDeletingId(promotionId);
    try {
      await deletePromotion(accessToken, supplierId, promotionId);
      await loadData();
    } catch (err) {
      console.error(err);
      setLoadError('No se pudo eliminar la promoción.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Marketing</h1>
          <p className={styles.subtitle}>
            Crea promociones personalizadas para productos, categorías o pedidos completos. Los descuentos
            automáticos del catálogo se gestionan desde cada producto.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => {
            setFormError(null);
            setDrawerOpen(true);
          }}
          disabled={!supplierId || !!supplierError}
        >
          + Agregar promoción personalizada
        </button>
      </div>

      <section className={styles.section}>
        <div className={styles.counter}>
          {loading
            ? 'Cargando…'
            : `${manualPromotions.length} promoción${manualPromotions.length === 1 ? '' : 'es'} personalizada${manualPromotions.length === 1 ? '' : 's'}`}
        </div>

        {loadError ? <div className={styles.errorBanner} role="alert">{loadError}</div> : null}

        {!loading && manualPromotions.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>Aún no hay promociones personalizadas</div>
            <p>Crea una promoción para aplicar descuentos en productos, categorías o pedidos.</p>
          </div>
        ) : null}

        {manualPromotions.length > 0 ? (
          <div className={styles.tableWrap}>
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
                  <tr key={promotion.id}>
                    <td>{promotion.name}</td>
                    <td>{typeLabel(promotion.type)}</td>
                    <td>{scopeLabel(promotion.scope)}</td>
                    <td>{discountSummary(promotion)}</td>
                    <td className={styles.muted}>
                      {formatDateRange(promotion.starts_at, promotion.ends_at)}
                    </td>
                    <td>
                      <span
                        className={`${styles.pill} ${promotion.is_active ? styles.pill_success : styles.pill_neutral}`}
                      >
                        {promotion.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.dangerGhostBtn}
                        disabled={deletingId === promotion.id}
                        onClick={() => void handleDeletePromotion(promotion.id)}
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
        title="Agregar promoción personalizada"
        onClose={() => {
          if (!saving) setDrawerOpen(false);
        }}
      >
        <PromotionForm
          categories={categories}
          products={products}
          saving={saving}
          error={formError}
          onCancel={() => setDrawerOpen(false)}
          onSubmit={handleCreatePromotion}
        />
      </Drawer>
    </div>
  );
}
