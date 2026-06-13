/**
 * Seed 50 products into Firestore for a supplier.
 *
 * Requirements:
 *   npm i -D firebase-admin
 *
 * Usage:
 *   # Option A: provide service account JSON inline
 *   export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
 *   export FIREBASE_PROJECT_ID="your-project-id"
 *   export SUPPLIER_ID="yourSupplierDocId"   # preferred
 *   node scripts/seed-products.mjs
 *
 *   # Option B: resolve supplier by email (requires suppliers/{id}.email)
 *   export SUPPLIER_EMAIL="supplier@example.com"
 *
 * What it does:
 * - Ensures categories "Food" and "Frutas" exist under suppliers/{supplierId}/categories
 * - Creates 50 products under suppliers/{supplierId}/products
 * - Each product isActive=true and review.status="draft", publish.isPublished=false
 * - No images are uploaded / linked
 */

import admin from 'firebase-admin';

const PAGE_COUNT = 50;
const CATEGORY_NAMES = ['Food', 'Frutas'];

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toCents(usd) {
  return Math.round(Number(usd) * 100);
}

function pickCategories(catIdsByName) {
  const pick = randomInt(1, 3);
  if (pick === 1) return [catIdsByName['Food']];
  if (pick === 2) return [catIdsByName['Frutas']];
  return [catIdsByName['Food'], catIdsByName['Frutas']];
}

function buildOptionGroups(i) {
  // Keep options light for testing; mix some products with options and some without.
  if (i % 3 !== 0) return [];
  return [
    {
      id: `og_${i}_1`,
      title: 'Tamaño',
      required: true,
      selection: 'single',
      minSelections: 1,
      maxSelections: 1,
      isActive: true,
      items: [
        { id: `oi_${i}_1_s`, label: 'Chico', priceDeltaCents: 0, isActive: true },
        { id: `oi_${i}_1_m`, label: 'Mediano', priceDeltaCents: toCents(1), isActive: true },
        { id: `oi_${i}_1_l`, label: 'Grande', priceDeltaCents: toCents(2), isActive: true },
      ],
    },
    {
      id: `og_${i}_2`,
      title: 'Extras',
      required: false,
      selection: 'multi',
      minSelections: 0,
      maxSelections: null,
      isActive: true,
      items: [
        { id: `oi_${i}_2_a`, label: 'Con limón', priceDeltaCents: 0, isActive: true },
        { id: `oi_${i}_2_b`, label: 'Con chile', priceDeltaCents: toCents(0.5), isActive: true },
      ],
    },
  ];
}

async function ensureCategories(db, supplierId) {
  const col = db.collection(`suppliers/${supplierId}/categories`);
  const snap = await col.where('isActive', '==', true).get();
  const existing = new Map();
  for (const doc of snap.docs) {
    const name = (doc.data()?.name ?? '').toString();
    if (name) existing.set(name.toLowerCase(), doc.id);
  }

  const ids = {};
  for (const name of CATEGORY_NAMES) {
    const existingId = existing.get(name.toLowerCase());
    if (existingId) {
      ids[name] = existingId;
      continue;
    }
    const ref = col.doc();
    await ref.set({
      name,
      description: `Seed category: ${name}`,
      image: null,
      sortIndex: 0,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedAt: null,
    });
    ids[name] = ref.id;
  }
  return ids;
}

async function resolveSupplierId(db) {
  if (process.env.SUPPLIER_ID) return process.env.SUPPLIER_ID;
  const email = process.env.SUPPLIER_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error('Provide SUPPLIER_ID or SUPPLIER_EMAIL');
  const snap = await db
    .collection('suppliers')
    .where('email', '==', email)
    .where('access', '==', true)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) throw new Error(`No supplier found for ${email} with access=true`);
  return doc.id;
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID || mustEnv('FIREBASE_PROJECT_ID');
  const saJson = safeJsonParse(mustEnv('FIREBASE_SERVICE_ACCOUNT_JSON'));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(saJson),
      projectId,
    });
  }

  const db = admin.firestore();
  const supplierId = await resolveSupplierId(db);
  console.log(`Seeding products for supplierId: ${supplierId}`);

  const catIdsByName = await ensureCategories(db, supplierId);
  console.log('Category IDs:', catIdsByName);

  const col = db.collection(`suppliers/${supplierId}/products`);
  const batchSize = 400; // keep well below Firestore 500 writes limit
  let batch = db.batch();
  let ops = 0;

  for (let i = 1; i <= PAGE_COUNT; i++) {
    const ref = col.doc();

    const basePrice = randomInt(2, 40);
    const discount = i % 5 === 0 ? randomInt(1, Math.min(5, basePrice)) : 0;

    const product = {
      name: `Producto seed #${i}`,
      description: `Descripción de prueba para producto #${i}.`,
      image: null,
      price: { currency: 'USD', unitAmountCents: toCents(basePrice) },
      discount: discount
        ? { type: 'amount', amountCents: toCents(discount), startsAt: null, endsAt: null }
        : null,
      categoryIds: pickCategories(catIdsByName),
      optionGroups: buildOptionGroups(i),
      review: {
        status: 'draft',
        submittedAt: null,
        reviewedAt: null,
        reviewedByAdminId: null,
        rejectionReason: null,
      },
      publish: { isPublished: false, publishedAt: null, unpublishedAt: null },
      isActive: true,
      deletedAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    batch.set(ref, product);
    ops++;

    if (ops >= batchSize) {
      await batch.commit();
      console.log(`Committed ${ops} writes...`);
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
    console.log(`Committed final ${ops} writes.`);
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

