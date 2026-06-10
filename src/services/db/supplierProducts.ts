import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  Timestamp,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import type {
  ApprovalStatus,
  ImageDraft,
  MoneyUSD,
  OptionGroupDraft,
  OptionItemDraft,
  ProductDraft,
} from './supplierCatalogTypes';

export const PRODUCTS_PAGE_SIZE = 20;

const MAX_PRODUCT_IMAGE_BYTES = 3 * 1024 * 1024;

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function money(amount: number): MoneyUSD {
  return { amount, currency: 'USD' };
}

function toCents(usd: number): number {
  const n = Number.isFinite(usd) ? usd : 0;
  return Math.round(n * 100);
}

function centsToUsd(cents: unknown): number {
  const n = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return n / 100;
}

export function normalizeOptionGroups(groups: OptionGroupDraft[]): OptionGroupDraft[] {
  return groups.map((g) => (g.required && g.selection !== 'single' ? { ...g, selection: 'single' } : g));
}

export function mapProductDoc(snap: QueryDocumentSnapshot<DocumentData>): ProductDraft {
  const d = snap.data() ?? {};
  const image =
    d.image && typeof d.image === 'object' && d.image !== null ? (d.image as Record<string, unknown>) : null;
  const downloadUrl = image && typeof image.downloadUrl === 'string' ? image.downloadUrl : null;

  const price = d.price && typeof d.price === 'object' && d.price !== null ? (d.price as Record<string, unknown>) : null;
  const unitAmountCents = price ? price.unitAmountCents : 0;

  const discount =
    d.discount && typeof d.discount === 'object' && d.discount !== null ? (d.discount as Record<string, unknown>) : null;
  const amountCents = discount ? discount.amountCents : 0;

  const review = d.review && typeof d.review === 'object' && d.review !== null ? (d.review as Record<string, unknown>) : null;
  const statusRaw = review ? review.status : null;
  const approvalStatus: ApprovalStatus =
    statusRaw === 'pending_review' || statusRaw === 'approved' || statusRaw === 'rejected' || statusRaw === 'draft'
      ? statusRaw
      : 'draft';

  const publish =
    d.publish && typeof d.publish === 'object' && d.publish !== null ? (d.publish as Record<string, unknown>) : null;
  const isPublished = publish ? publish.isPublished === true : false;

  const createdAtTs = d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null;
  const updatedAtTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null;

  const optionGroupsRaw = Array.isArray(d.optionGroups) ? (d.optionGroups as unknown[]) : [];
  const optionGroups: OptionGroupDraft[] = optionGroupsRaw
    .map((g) => (typeof g === 'object' && g !== null ? (g as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((g) => {
      const itemsRaw = Array.isArray(g!.items) ? (g!.items as unknown[]) : [];
      const items: OptionItemDraft[] = itemsRaw
        .map((it) => (typeof it === 'object' && it !== null ? (it as Record<string, unknown>) : null))
        .filter(Boolean)
        .map((it) => ({
          id: typeof it!.id === 'string' ? it!.id : uid('oi'),
          label: typeof it!.label === 'string' ? it!.label : '',
          priceDeltaUsd: centsToUsd(it!.priceDeltaCents),
          isActive: it!.isActive !== false,
        }));

      const required = g!.required === true;
      const selection = g!.selection === 'multi' ? 'multi' : 'single';
      return {
        id: typeof g!.id === 'string' ? g!.id : uid('og'),
        title: typeof g!.title === 'string' ? g!.title : '',
        required,
        selection: required ? 'single' : selection,
        items,
        isActive: g!.isActive !== false,
      };
    });

  return {
    id: snap.id,
    name: typeof d.name === 'string' ? d.name : '—',
    description: typeof d.description === 'string' ? d.description : '',
    price: money(centsToUsd(unitAmountCents)),
    discountUsd: centsToUsd(amountCents),
    image: downloadUrl ? { previewUrl: downloadUrl } : null,
    categoryIds: Array.isArray(d.categoryIds) ? (d.categoryIds.filter((x) => typeof x === 'string') as string[]) : [],
    optionGroups,
    approvalStatus,
    isPublished,
    isActive: d.isActive !== false,
    createdAt: createdAtTs ? createdAtTs.toISOString() : nowIso(),
    updatedAt: updatedAtTs ? updatedAtTs.toISOString() : nowIso(),
  };
}

export type FetchSupplierProductsPageArgs = {
  cursor: QueryDocumentSnapshot<DocumentData> | null;
};

export type FetchSupplierProductsPageResult = {
  items: ProductDraft[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export async function fetchSupplierProductsPage(
  db: Firestore,
  supplierId: string,
  args: FetchSupplierProductsPageArgs
): Promise<FetchSupplierProductsPageResult> {
  const col = collection(db, 'suppliers', supplierId, 'products');
  const pageSize = PRODUCTS_PAGE_SIZE;
  const q = args.cursor
    ? query(col, orderBy('updatedAt', 'desc'), startAfter(args.cursor), limit(pageSize + 1))
    : query(col, orderBy('updatedAt', 'desc'), limit(pageSize + 1));
  const snap = await getDocs(q);
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
  const cursor =
    pageDocs.length > 0 ? pageDocs[pageDocs.length - 1]! : args.cursor;
  return {
    items: pageDocs.map(mapProductDoc),
    cursor,
    hasMore,
  };
}

export type SaveSupplierProductPayload = {
  id?: string;
  name: string;
  description: string;
  price: MoneyUSD;
  discountUsd: number;
  image: ImageDraft | null;
  categoryIds: string[];
  optionGroups: OptionGroupDraft[];
};

export async function saveSupplierProduct(
  db: Firestore,
  storage: FirebaseStorage,
  supplierId: string,
  payload: SaveSupplierProductPayload
): Promise<void> {
  const isEdit = Boolean(payload.id);
  const productId = payload.id ?? doc(collection(db, 'suppliers', supplierId, 'products')).id;

  let imageMap: { storagePath: string; downloadUrl: string; contentType: string } | null = null;
  if (payload.image?.file) {
    const file = payload.image.file;
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      throw new Error('La imagen es muy pesada. Máximo permitido: 3 MB.');
    }
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const safeExt = ext.length > 8 ? 'jpg' : ext;
    const storagePath = `supplier-products/${supplierId}/${productId}/image.${safeExt}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
    const downloadUrl = await getDownloadURL(storageRef);
    imageMap = { storagePath, downloadUrl, contentType: file.type || 'image/jpeg' };
  }

  const optionGroups = normalizeOptionGroups(payload.optionGroups);
  const firestoreOptionGroups = optionGroups.map((g) => ({
    id: g.id,
    title: g.title,
    required: g.required,
    selection: g.selection,
    minSelections: g.required ? 1 : 0,
    maxSelections: g.selection === 'single' ? 1 : null,
    isActive: g.isActive,
    items: g.items.map((it) => ({
      id: it.id,
      label: it.label,
      priceDeltaCents: toCents(it.priceDeltaUsd),
      isActive: it.isActive,
    })),
  }));

  const data: Record<string, unknown> = {
    name: payload.name,
    description: payload.description || null,
    categoryIds: payload.categoryIds,
    price: { currency: 'USD', unitAmountCents: toCents(payload.price.amount) },
    discount:
      payload.discountUsd > 0
        ? { type: 'amount', amountCents: toCents(payload.discountUsd), startsAt: null, endsAt: null }
        : null,
    optionGroups: firestoreOptionGroups,
    updatedAt: serverTimestamp(),
  };
  if (!isEdit) {
    data.isActive = true;
    data.createdAt = serverTimestamp();
    data.review = {
      status: 'draft',
      submittedAt: null,
      reviewedAt: null,
      reviewedByAdminId: null,
      rejectionReason: null,
    };
    data.publish = { isPublished: false, publishedAt: null, unpublishedAt: null };
  }
  if (imageMap) data.image = imageMap;

  const productRef = doc(db, 'suppliers', supplierId, 'products', productId);
  if (isEdit) await updateDoc(productRef, data);
  else await setDoc(productRef, data);
}

export async function updateSupplierProductActive(
  db: Firestore,
  supplierId: string,
  productId: string,
  isActive: boolean
): Promise<void> {
  const productRef = doc(db, 'suppliers', supplierId, 'products', productId);
  await updateDoc(productRef, {
    isActive,
    updatedAt: serverTimestamp(),
  });
}

/** Supplier-only transitions between draft and pending_review (see FIRESTORE_SCHEMA_SUPPLIERS_CATALOG.md). */
export async function updateSupplierProductReviewStatus(
  db: Firestore,
  supplierId: string,
  productId: string,
  status: 'draft' | 'pending_review'
): Promise<void> {
  const productRef = doc(db, 'suppliers', supplierId, 'products', productId);
  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    'review.status': status,
    'review.submittedAt': status === 'pending_review' ? serverTimestamp() : null,
  };
  await updateDoc(productRef, patch);
}
