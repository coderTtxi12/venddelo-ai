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
import type { CategoryDraft, ImageDraft } from './supplierCatalogTypes';

export const CATEGORIES_PAGE_SIZE = 10;

function nowIso(): string {
  return new Date().toISOString();
}

export function mapCategoryDoc(snap: QueryDocumentSnapshot<DocumentData>): CategoryDraft {
  const d = snap.data() ?? {};
  const image =
    d.image && typeof d.image === 'object' && d.image !== null ? (d.image as Record<string, unknown>) : null;
  const downloadUrl = image && typeof image.downloadUrl === 'string' ? image.downloadUrl : null;
  const createdAtTs = d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null;
  const updatedAtTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null;
  return {
    id: snap.id,
    name: typeof d.name === 'string' ? d.name : '—',
    description: typeof d.description === 'string' ? d.description : '',
    image: downloadUrl ? { previewUrl: downloadUrl } : null,
    isActive: d.isActive !== false,
    createdAt: createdAtTs ? createdAtTs.toISOString() : nowIso(),
    updatedAt: updatedAtTs ? updatedAtTs.toISOString() : nowIso(),
  };
}

export type FetchSupplierCategoriesPageArgs = {
  cursor: QueryDocumentSnapshot<DocumentData> | null;
};

export type FetchSupplierCategoriesPageResult = {
  items: CategoryDraft[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export async function fetchSupplierCategoriesPage(
  db: Firestore,
  supplierId: string,
  args: FetchSupplierCategoriesPageArgs
): Promise<FetchSupplierCategoriesPageResult> {
  const col = collection(db, 'suppliers', supplierId, 'categories');
  const pageSize = CATEGORIES_PAGE_SIZE;
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
    items: pageDocs.map(mapCategoryDoc),
    cursor,
    hasMore,
  };
}

export type SaveSupplierCategoryPayload = {
  id?: string;
  name: string;
  description: string;
  image: ImageDraft | null;
};

export async function saveSupplierCategory(
  db: Firestore,
  storage: FirebaseStorage,
  supplierId: string,
  payload: SaveSupplierCategoryPayload
): Promise<void> {
  const isEdit = Boolean(payload.id);
  const categoryId = payload.id ?? doc(collection(db, 'suppliers', supplierId, 'categories')).id;

  let imageMap: { storagePath: string; downloadUrl: string; contentType: string } | null = null;
  if (payload.image?.file) {
    const file = payload.image.file;
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const safeExt = ext.length > 8 ? 'jpg' : ext;
    const storagePath = `supplier-categories/${supplierId}/${categoryId}/image.${safeExt}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
    const downloadUrl = await getDownloadURL(storageRef);
    imageMap = { storagePath, downloadUrl, contentType: file.type || 'image/jpeg' };
  }

  const data: Record<string, unknown> = {
    name: payload.name,
    description: payload.description || null,
    updatedAt: serverTimestamp(),
  };
  if (!isEdit) {
    data.createdAt = serverTimestamp();
    data.isActive = true;
  }
  if (imageMap) data.image = imageMap;

  const categoryRef = doc(db, 'suppliers', supplierId, 'categories', categoryId);
  if (isEdit) {
    await updateDoc(categoryRef, data);
  } else {
    await setDoc(categoryRef, data);
  }
}

export async function updateSupplierCategoryActive(
  db: Firestore,
  supplierId: string,
  categoryId: string,
  isActive: boolean
): Promise<void> {
  const ref = doc(db, 'suppliers', supplierId, 'categories', categoryId);
  await updateDoc(ref, {
    isActive,
    updatedAt: serverTimestamp(),
  });
}
