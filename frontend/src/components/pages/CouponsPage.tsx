'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import styles from './MarketingPage.module.css';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { listCategories, listProducts } from '@/lib/api/menu';
import type { Category, Coupon, Product } from '@/lib/api/types';
import {
  createCoupon,
  deleteCoupon,
  listAllCoupons,
  updateCoupon,
  type CouponInput,
} from '@/lib/api/coupons';
import {
  couponBenefitLabel,
  couponScopeLabel,
  couponStatusLabel,
  couponStockLabel,
  couponTypeLabel,
  formatCouponExpiry,
} from '@/lib/coupons/display';
import { CouponForm, couponToFormValues } from '@/components/coupons/CouponForm';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

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
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.drawerBackdrop} onClick={onClose} role="presentation">
      <div
        className={styles.drawer}
        onClick={(event) => event.stopPropagation()}
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

function statusPillClass(status: Coupon['effective_status']): string {
  if (status === 'active') return styles.pill_success;
  if (status === 'sold_out' || status === 'expired') return styles.pill_neutral;
  return styles.pill_neutral;
}

export default function CouponsPage() {
  const { accessToken } = useAuth();
  const { selectedRestaurantId, loading: accessLoading } = useRestaurantAccess();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedRestaurantId || !accessToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [couponList, categoryList, productList] = await Promise.all([
        listAllCoupons(accessToken, selectedRestaurantId),
        loadAllCategories(accessToken, selectedRestaurantId),
        loadAllProducts(accessToken, selectedRestaurantId),
      ]);
      setCoupons(couponList);
      setCategories(categoryList.filter((category) => category.is_active));
      setProducts(productList.filter((product) => product.status === 'active'));
    } catch (error) {
      console.error(error);
      setLoadError('No se pudieron cargar los cupones. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedRestaurantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateDrawer = () => {
    setEditingCoupon(null);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    setEditingCoupon(null);
  };

  const handleSubmit = async (payload: CouponInput) => {
    if (!selectedRestaurantId || !accessToken) return;
    setSaving(true);
    setFormError(null);
    try {
      const saved = editingCoupon
        ? await updateCoupon(accessToken, selectedRestaurantId, editingCoupon.id, payload)
        : await createCoupon(accessToken, selectedRestaurantId, payload);
      setCoupons((prev) => {
        const index = prev.findIndex((coupon) => coupon.id === saved.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      closeDrawer();
    } catch (error) {
      console.error(error);
      setFormError(
        editingCoupon
          ? 'No se pudieron guardar los cambios. Revisa los datos e intenta de nuevo.'
          : 'No se pudo crear el cupón. Revisa los datos e intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCoupon || !selectedRestaurantId || !accessToken) return;
    setDeleting(true);
    try {
      await deleteCoupon(accessToken, selectedRestaurantId, deletingCoupon.id);
      setCoupons((prev) => prev.filter((coupon) => coupon.id !== deletingCoupon.id));
      setDeletingCoupon(null);
    } catch (error) {
      console.error(error);
      setLoadError('No se pudo eliminar el cupón.');
    } finally {
      setDeleting(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 2000);
    } catch {
      setCopiedCode(null);
    }
  };

  const countLabel = useMemo(() => {
    if (loading) return 'Cargando…';
    return `${coupons.length} cupón${coupons.length === 1 ? '' : 'es'}`;
  }, [coupons.length, loading]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Cupones</h1>
          <p className={styles.subtitle}>
            Códigos de descuento que tus clientes aplican en el menú en vivo. Se combinan con las
            promociones automáticas de Marketing.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={openCreateDrawer}
          disabled={accessLoading || !selectedRestaurantId}
        >
          + Agregar cupón
        </button>
      </div>

      <section className={styles.section}>
        <div className={styles.counter}>{countLabel}</div>

        {loadError ? (
          <div className={styles.errorBanner} role="alert">
            {loadError}
          </div>
        ) : null}

        {!loading && coupons.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>Aún no hay cupones</div>
            <p>Crea un código para que tus clientes lo usen al pagar en el menú en vivo.</p>
          </div>
        ) : null}

        {coupons.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Beneficio</th>
                  <th>Alcance</th>
                  <th>Usos</th>
                  <th>Caducidad</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr
                    key={coupon.id}
                    className={styles.tableRowClickable}
                    tabIndex={0}
                    role="button"
                    aria-label={`Editar cupón ${coupon.code}`}
                    onClick={() => openEditDrawer(coupon)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openEditDrawer(coupon);
                      }
                    }}
                  >
                    <td>
                      <span className={styles.codeCell}>
                        <span>{coupon.code}</span>
                        <button
                          type="button"
                          className={styles.iconGhostBtn}
                          aria-label={`Copiar código ${coupon.code}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyCode(coupon.code);
                          }}
                        >
                          <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
                        </button>
                        {copiedCode === coupon.code ? (
                          <span className={styles.copiedHint}>Copiado</span>
                        ) : null}
                      </span>
                    </td>
                    <td>{couponTypeLabel(coupon.type)}</td>
                    <td>{couponBenefitLabel(coupon)}</td>
                    <td>{couponScopeLabel(coupon.scope)}</td>
                    <td>{couponStockLabel(coupon.redeemed_count, coupon.stock_qty)}</td>
                    <td className={styles.muted}>{formatCouponExpiry(coupon.expires_on)}</td>
                    <td>
                      <span
                        className={`${styles.pill} ${statusPillClass(coupon.effective_status)}`}
                      >
                        {couponStatusLabel(coupon.effective_status ?? 'inactive')}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.editGhostBtn}
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditDrawer(coupon);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={styles.dangerGhostBtn}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeletingCoupon(coupon);
                        }}
                      >
                        Eliminar
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
        title={editingCoupon ? 'Editar cupón' : 'Agregar cupón'}
        onClose={closeDrawer}
      >
        <CouponForm
          key={editingCoupon?.id ?? 'create'}
          categories={categories}
          products={products}
          saving={saving}
          error={formError}
          mode={editingCoupon ? 'edit' : 'create'}
          initialValues={editingCoupon ? couponToFormValues(editingCoupon) : null}
          onCancel={closeDrawer}
          onSubmit={handleSubmit}
        />
      </Drawer>

      <ConfirmDialog
        open={deletingCoupon != null}
        title="¿Eliminar cupón?"
        description={
          deletingCoupon
            ? `El código ${deletingCoupon.code} dejará de funcionar. Los pedidos ya confirmados conservan su descuento.`
            : ''
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => {
          if (!deleting) setDeletingCoupon(null);
        }}
      />
    </div>
  );
}
