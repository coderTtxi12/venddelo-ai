# Dashboard Delete Products & Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir eliminar categorías y productos desde las tabs de `/products` en el dashboard de restaurantes, con confirmación irreversible antes de llamar al `DELETE` del backend.

**Architecture:** Helpers de copy puros + wrappers `deleteCategory`/`deleteProduct` en `menu.ts` y capa `services/db`; UI en `ProductsPage` reutiliza `ConfirmDialog`. Sin cambios de backend.

**Tech Stack:** Next.js 16, React 19, CSS modules, MUI icons, `node:test` + `tsx`.

## Global Constraints

- Solo `frontend/` (dashboard restaurant owners); no `delivery-dashboard/`
- Reutilizar `ConfirmDialog` existente; CTA confirm = rojo (`Eliminar`)
- Acción en la lista (card categoría / fila producto), no solo en drawer
- Categoría con productos: permitir + avisar conteo en el confirm
- Copy debe decir que no se puede deshacer
- Sin cascade-delete de productos; sin undo; sin dependencias nuevas
- Errores: cerrar dialog + banner `role="alert"`
- Spec: `docs/superpowers/specs/2026-07-29-dashboard-delete-products-categories-design.es.md`

## File map

| File | Responsibility |
|------|----------------|
| `frontend/src/lib/menu/deleteConfirmCopy.ts` | Copy puro del confirm (title/description/labels) |
| `frontend/src/lib/menu/deleteConfirmCopy.test.ts` | Tests del helper |
| `frontend/src/lib/api/menu.ts` | `deleteCategory`, `deleteProduct` → HTTP DELETE |
| `frontend/src/services/db/supplierCategories.ts` | `deleteSupplierCategory` |
| `frontend/src/services/db/supplierProducts.ts` | `deleteSupplierProduct` |
| `frontend/src/services/db/index.ts` | Re-exports |
| `frontend/src/components/pages/ProductsPage.tsx` | Botones, estado pending, ConfirmDialog, handlers |
| `frontend/src/components/pages/ProductsPage.module.css` | Columna Acciones + layout mobile |

---

### Task 1: Confirm copy helper + tests

**Files:**
- Create: `frontend/src/lib/menu/deleteConfirmCopy.ts`
- Create: `frontend/src/lib/menu/deleteConfirmCopy.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type DeleteConfirmKind = 'product' | 'category'`
  - `export type DeleteConfirmCopy = { title: string; description: string; confirmLabel: string; cancelLabel: string }`
  - `export function buildDeleteConfirmCopy(args: { kind: DeleteConfirmKind; name: string; linkedProductCount?: number }): DeleteConfirmCopy`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/menu/deleteConfirmCopy.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeleteConfirmCopy } from './deleteConfirmCopy';

test('product confirm copy names the product and warns irreversible', () => {
  const copy = buildDeleteConfirmCopy({ kind: 'product', name: 'Tacos al Pastor' });
  assert.equal(copy.title, '¿Eliminar «Tacos al Pastor»?');
  assert.match(copy.description, /no se puede deshacer/i);
  assert.equal(copy.confirmLabel, 'Eliminar');
  assert.equal(copy.cancelLabel, 'Cancelar');
});

test('empty category confirm copy warns irreversible without product count', () => {
  const copy = buildDeleteConfirmCopy({
    kind: 'category',
    name: 'Bebidas',
    linkedProductCount: 0,
  });
  assert.equal(copy.title, '¿Eliminar «Bebidas»?');
  assert.match(copy.description, /no se puede deshacer/i);
  assert.doesNotMatch(copy.description, /vinculados/i);
});

test('category with linked products includes count warning', () => {
  const copy = buildDeleteConfirmCopy({
    kind: 'category',
    name: 'Bebidas',
    linkedProductCount: 3,
  });
  assert.match(
    copy.description,
    /Esta categoría tiene 3 productos vinculados\. Se eliminará de todas formas\./,
  );
  assert.match(copy.description, /no se puede deshacer/i);
});

test('category with one linked product uses singular wording', () => {
  const copy = buildDeleteConfirmCopy({
    kind: 'category',
    name: 'Bebidas',
    linkedProductCount: 1,
  });
  assert.match(
    copy.description,
    /Esta categoría tiene 1 producto vinculado\. Se eliminará de todas formas\./,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && node --import tsx --test src/lib/menu/deleteConfirmCopy.test.ts
```

Expected: FAIL (module not found / `buildDeleteConfirmCopy` undefined).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/menu/deleteConfirmCopy.ts`:

```ts
export type DeleteConfirmKind = 'product' | 'category';

export type DeleteConfirmCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
};

export function buildDeleteConfirmCopy(args: {
  kind: DeleteConfirmKind;
  name: string;
  linkedProductCount?: number;
}): DeleteConfirmCopy {
  const title = `¿Eliminar «${args.name}»?`;
  const irreversible =
    args.kind === 'product'
      ? 'Se quitará del catálogo y no se puede deshacer.'
      : 'Se eliminará del catálogo y no se puede deshacer.';

  let description = irreversible;
  if (args.kind === 'category') {
    const n = args.linkedProductCount ?? 0;
    if (n > 0) {
      const noun = n === 1 ? 'producto vinculado' : 'productos vinculados';
      description = `${irreversible} Esta categoría tiene ${n} ${noun}. Se eliminará de todas formas.`;
    }
  }

  return {
    title,
    description,
    confirmLabel: 'Eliminar',
    cancelLabel: 'Cancelar',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd frontend && node --import tsx --test src/lib/menu/deleteConfirmCopy.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/menu/deleteConfirmCopy.ts frontend/src/lib/menu/deleteConfirmCopy.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add delete confirm copy helper for catalog items

EOF
)"
```

---

### Task 2: API + DB delete wrappers

**Files:**
- Modify: `frontend/src/lib/api/menu.ts` (after `updateCategory` / after `updateProduct`)
- Modify: `frontend/src/services/db/supplierCategories.ts`
- Modify: `frontend/src/services/db/supplierProducts.ts`
- Modify: `frontend/src/services/db/index.ts`

**Interfaces:**
- Consumes: `apiRequest` from `./client`; existing `updateCategory` / `updateProduct` import sites
- Produces:
  - `deleteCategory(token: string, restaurantId: string, categoryId: string): Promise<void>`
  - `deleteProduct(token: string, restaurantId: string, productId: string): Promise<void>`
  - `deleteSupplierCategory(accessToken: string, _db: LegacyDbClient, restaurantId: string, categoryId: string): Promise<void>`
  - `deleteSupplierProduct(accessToken: string, _db: LegacyDbClient, restaurantId: string, productId: string): Promise<void>`

- [ ] **Step 1: Add API functions in `menu.ts`**

After `updateCategory` (around line 83), add:

```ts
export function deleteCategory(
  token: string,
  restaurantId: string,
  categoryId: string,
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/categories/${categoryId}`,
    { method: 'DELETE', token },
  );
}
```

After `updateProduct` (around line 144), add:

```ts
export function deleteProduct(
  token: string,
  restaurantId: string,
  productId: string,
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/products/${productId}`,
    { method: 'DELETE', token },
  );
}
```

- [ ] **Step 2: Add DB wrappers**

In `supplierCategories.ts`, update imports:

```ts
import { createCategory, deleteCategory, listCategories, updateCategory } from '@/lib/api/menu';
```

Add after `updateSupplierCategoryActive`:

```ts
export async function deleteSupplierCategory(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
  categoryId: string,
): Promise<void> {
  await deleteCategory(accessToken, restaurantId, categoryId);
}
```

In `supplierProducts.ts`, add `deleteProduct` to the `@/lib/api/menu` import list, then after `updateSupplierProductVisibility`:

```ts
export async function deleteSupplierProduct(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
  productId: string,
): Promise<void> {
  await deleteProduct(accessToken, restaurantId, productId);
}
```

- [ ] **Step 3: Export from `services/db/index.ts`**

In the `supplierCategories` export block, add `deleteSupplierCategory`.

In the `supplierProducts` export block, add `deleteSupplierProduct`.

- [ ] **Step 4: Typecheck the touched modules**

Run:

```bash
cd frontend && npx tsc --noEmit --pretty false 2>&1 | head -40
```

Expected: no new errors in the files above (existing project errors unrelated to this change may appear; ignore those not in delete wrappers).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/menu.ts \
  frontend/src/services/db/supplierCategories.ts \
  frontend/src/services/db/supplierProducts.ts \
  frontend/src/services/db/index.ts
git commit -m "$(cat <<'EOF'
feat(frontend): wire deleteCategory and deleteProduct API wrappers

EOF
)"
```

---

### Task 3: ProductsPage UI — delete buttons + ConfirmDialog

**Files:**
- Modify: `frontend/src/components/pages/ProductsPage.tsx`
- Modify: `frontend/src/components/pages/ProductsPage.module.css`

**Interfaces:**
- Consumes:
  - `buildDeleteConfirmCopy` from `@/lib/menu/deleteConfirmCopy`
  - `deleteSupplierCategory`, `deleteSupplierProduct` from `@/services/db`
  - `ConfirmDialog` from `@/components/ui/ConfirmDialog`
- Produces: UI delete flow on categories cards and products rows

- [ ] **Step 1: Add imports and pending-delete state**

Near the top of `ProductsPage.tsx`, add:

```ts
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { buildDeleteConfirmCopy } from '@/lib/menu/deleteConfirmCopy';
```

Extend the `@/services/db` import to include `deleteSupplierCategory` and `deleteSupplierProduct`.

Inside `ProductsPage()` (near other error/toggle state), add:

```ts
type PendingDelete =
  | { kind: 'category'; id: Id; name: string }
  | { kind: 'product'; id: Id; name: string };

const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
const [deleteLoading, setDeleteLoading] = useState(false);
const [deleteError, setDeleteError] = useState<string | null>(null);
```

Add memo for dialog copy:

```ts
const deleteConfirmCopy = useMemo(() => {
  if (!pendingDelete) return null;
  if (pendingDelete.kind === 'category') {
    const linkedProductCount = products.filter((p) =>
      p.categoryIds.includes(pendingDelete.id),
    ).length;
    return buildDeleteConfirmCopy({
      kind: 'category',
      name: pendingDelete.name,
      linkedProductCount,
    });
  }
  return buildDeleteConfirmCopy({
    kind: 'product',
    name: pendingDelete.name,
  });
}, [pendingDelete, products]);
```

Add handlers:

```ts
function requestDeleteCategory(category: CategoryDraft) {
  setDeleteError(null);
  setPendingDelete({ kind: 'category', id: category.id, name: category.name });
}

function requestDeleteProduct(product: ProductDraft) {
  setDeleteError(null);
  setPendingDelete({ kind: 'product', id: product.id, name: product.name });
}

function cancelPendingDelete() {
  if (deleteLoading) return;
  setPendingDelete(null);
}

async function confirmPendingDelete() {
  if (!pendingDelete || !supplierId || !accessToken) return;
  setDeleteLoading(true);
  setDeleteError(null);
  const target = pendingDelete;
  try {
    if (target.kind === 'category') {
      await deleteSupplierCategory(accessToken, db, supplierId, target.id);
      setCategories((prev) => prev.filter((c) => c.id !== target.id));
    } else {
      await deleteSupplierProduct(accessToken, db, supplierId, target.id);
      setProducts((prev) => prev.filter((p) => p.id !== target.id));
    }
    setPendingDelete(null);
  } catch (err) {
    console.error(err);
    setPendingDelete(null);
    setDeleteError(
      target.kind === 'category'
        ? 'No se pudo eliminar la categoría. Intenta de nuevo.'
        : 'No se pudo eliminar el producto. Intenta de nuevo.',
    );
  } finally {
    setDeleteLoading(false);
  }
}
```

- [ ] **Step 2: Category card — Eliminar button**

Inside each category card’s `cardActions` (after Activar/Desactivar buttons), add:

```tsx
<button
  type="button"
  className={styles.dangerGhostBtn}
  disabled={deleteLoading || !supplierId || !accessToken}
  onClick={(e) => {
    e.stopPropagation();
    requestDeleteCategory(c);
  }}
>
  Eliminar
</button>
```

Also render the category delete error banner near existing `categoryActiveError` banner:

```tsx
{deleteError && activeTab === 'categories' ? (
  <div className={styles.errorBanner} role="alert">{deleteError}</div>
) : null}
```

(Or a single shared `deleteError` banner visible on whichever tab is active — prefer one banner under the active section.)

- [ ] **Step 3: Products table — Acciones column**

1. Add header after Estado `<th>`:

```tsx
<th className={`${styles.thDashboard} ${styles.actionsHead}`}>Acciones</th>
```

2. Change empty-state `colSpan={6}` → `colSpan={7}`.

3. After the Estado `<td>` in each product row, add:

```tsx
<td
  className={`${styles.labeledCell} ${styles.actionsCell}`}
  data-label="Acciones"
  onClick={(event) => event.stopPropagation()}
>
  <button
    type="button"
    className={styles.dangerGhostBtn}
    disabled={deleteLoading || !supplierId || !accessToken}
    aria-label={`Eliminar ${p.name}`}
    onClick={(e) => {
      e.stopPropagation();
      requestDeleteProduct(p);
    }}
  >
    <DeleteOutlineOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
    <span>Eliminar</span>
  </button>
</td>
```

4. Render products delete error banner near `productsError` / visibility errors:

```tsx
{deleteError && activeTab === 'products' ? (
  <div className={styles.errorBanner} role="alert">{deleteError}</div>
) : null}
```

- [ ] **Step 4: Mount ConfirmDialog once near the page root return**

Just before the closing of the main page wrapper (or after both tabs’ drawers), add:

```tsx
{deleteConfirmCopy ? (
  <ConfirmDialog
    open={Boolean(pendingDelete)}
    title={deleteConfirmCopy.title}
    description={deleteConfirmCopy.description}
    confirmLabel={deleteConfirmCopy.confirmLabel}
    cancelLabel={deleteConfirmCopy.cancelLabel}
    loading={deleteLoading}
    onConfirm={() => {
      void confirmPendingDelete();
    }}
    onCancel={cancelPendingDelete}
  />
) : null}
```

- [ ] **Step 5: CSS for actions column**

In `ProductsPage.module.css`, add:

```css
.actionsHead {
  width: 7.5rem;
  text-align: right;
}

.actionsCell {
  text-align: right;
  white-space: nowrap;
}

.actionsCell .dangerGhostBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
```

In the mobile media query block that sets `.statusCell { order: 2; }` etc., add:

```css
.actionsCell {
  order: 7;
}
```

Keep existing mobile `::before` / `data-label` patterns working via `labeledCell` + `data-label="Acciones"`.

- [ ] **Step 6: Manual smoke + unit re-run**

Run:

```bash
cd frontend && node --import tsx --test src/lib/menu/deleteConfirmCopy.test.ts
```

Expected: PASS.

Manual checklist (dev server `cd frontend && npm run dev`):

1. Tab Categorías → Eliminar categoría vacía → confirm → desaparece.
2. Cancelar confirm → sin cambios.
3. Eliminar categoría con N productos → texto incluye N → categoría desaparece; productos siguen.
4. Tab Productos → Eliminar → confirm → fila desaparece.
5. (Opcional) DevTools offline → error banner.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/pages/ProductsPage.tsx \
  frontend/src/components/pages/ProductsPage.module.css
git commit -m "$(cat <<'EOF'
feat(frontend): allow deleting products and categories with confirm dialog

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Delete on list (card/row) | Task 3 |
| ConfirmDialog before delete | Task 3 |
| Irreversible copy | Task 1 + 3 |
| Category with products: allow + warn count | Task 1 + 3 |
| `deleteCategory` / `deleteProduct` API | Task 2 |
| DB wrappers + exports | Task 2 |
| Error banner, close dialog on error | Task 3 |
| No backend / no delivery-dashboard / no cascade | Global constraints |
| Soft-delete via existing DELETE 204 | Task 2 |

## Self-review notes

- No placeholders left in steps.
- Singular/plural copy covered by Task 1 tests.
- `colSpan` updated when adding Acciones column.
- Mobile order for `actionsCell` included.
