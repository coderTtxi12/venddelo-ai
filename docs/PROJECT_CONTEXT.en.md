# Project Context — Vendelo AI (AI-Powered QR Digital Menu)

> Context and quick-reference document. It defines **what** we are building, **for whom**, and **how** the end-to-end flow works. It serves as the source of truth to align product, design, and engineering.

## 1. Overview

**Vendelo AI** is a platform that lets restaurants create, optimize, and publish their **QR digital menu** and receive **online orders**, with a strong **Artificial Intelligence** component that automates building and optimizing the menu.

It is conceptually similar to **OlaClick's QR digital menu**, but with its own twists:

- **AI-assisted onboarding**: the restaurant only uploads its menu (photo/PDF/image) and a logo; **AI agents** extract and build the entire digital menu automatically.
- **AI optimization**: enhancement of dish images (better look without losing the original details) and more appealing descriptions for the end consumer.
- **Automatic design**: AI picks a suitable **color palette** from a set of available palettes.
- **Human-in-the-loop control**: the owner can **edit, undo, and adjust** everything the AI did.
- **Publishing on a dedicated subdomain** under the Vendelo domain, with a ready-to-share **link** and **QR code**.
- **Orders sent to the restaurant's WhatsApp**, with an automatically generated **order-detail format** (similar to OlaClick).
- **Multi-language menu**: the public digital menu uses the diner's **device language**; if it differs from the menu's original language, a **backend AI service** translates all content into the device language.

### Key differentiator

While tools like OlaClick require the owner to upload/configure the menu manually, **Vendelo AI does the heavy lifting with AI**: you upload the menu, the AI digitizes it, beautifies it, and gets it ready to publish. The owner only reviews and adjusts.

## 2. Actors / Users

| Actor | Description | Where they operate |
|-------|-------------|--------------------|
| **Restaurant (client)** | Restaurant owner/admin who creates and manages the digital menu. | Onboarding + Dashboard |
| **Diner (end user)** | Person who views the menu via QR/link and places an order. | Public digital menu (subdomain) |
| **Vendelo team (internal)** | Admins/analysts who monitor the platform. | Internal panel (existing) |

## 3. End-to-end flow

### Phase 1 — Restaurant onboarding (Typeform-style form)

A conversational, step-by-step experience (one question at a time) that captures:

1. **Restaurant name**
2. **Restaurant location** (address; ideally with Google Places to normalize and geolocate)
3. **Restaurant schedule**
   - **Take out schedule** and **Delivery schedule**
   - **Default:** the same schedule for both
   - Option: **"Set different schedule for each one"** (define separate schedules for take out and delivery)
4. **Payment methods** (multi-select; **all checked by default**, the business can deselect):
   - Cash
   - Bank transfer
   - Card payment at terminal
   - Note: card payment at terminal applies in **two contexts**: **Take out** and **Delivery** (configured separately)
5. **Upload Logo** (image)
6. **Upload Menu** (photo, image, or PDF of the restaurant's current menu)

### Phase 2 — AI agent processing

After form submission, the **AI agents** run:

1. **Menu extraction** from the uploaded file:
   - Products
   - Descriptions
   - Prices
   - Add-ons / options / extras (option groups)
   - Promotions
   - Images
   - Any information useful to fill in the digital menu
2. **AI optimization**:
   - **Images**: better look/quality **without losing the original details** of the dish.
   - **Descriptions**: more appealing, conversion-oriented copy for the end consumer.
3. **Auto-fill of the digital menu** with the **new optimized information**.
4. **Automatic color-palette selection** from the list of available palettes (consistent with the logo/brand).
5. **Presentation of the generated menu** to the user for review.

### Phase 3 — Review, editing, and publishing (restaurant dashboard)

The restaurant owner can:

- **Edit the digital menu**: add / edit products, promotions, images, prices, add-ons, etc.
- **Undo** any optimization the AI made (revert to the original).
- **Publish/deploy** the digital menu under a **subdomain** of the Vendelo domain (e.g. `myrestaurant.vendelo.app`).
- Get their **link** and **QR code** to share/print.
- **Access the dashboard** at any time to:
  - Change/edit the digital menu
  - View **real-time orders**
  - View **statistics** and **earnings**

### Phase 4 — Diner ordering (end user)

Similar to OlaClick:

1. The diner opens the menu via **QR or link**.
2. The menu is shown in the diner's **device language** (detected automatically). If that language **differs from the restaurant menu's original language**, a **backend AI service** translates categories, products, descriptions, add-ons, and promotions into the device language.
3. **Chooses products** (with their add-ons/options).
4. If it's **home delivery**, fills in the **delivery details**.
5. Selects a **payment method** (among those enabled by the restaurant).
6. The order is **sent to the restaurant's WhatsApp** with an automatically generated **order-detail format** (products, quantities, extras, total, delivery details, payment method).

## 4. AI features (summary)

- **OCR / document understanding**: reading menus from photo/PDF/image.
- **Data structuring**: turning messy text into a catalog (categories, products, options, prices).
- **Image enhancement**: improving dish photos while preserving original details.
- **Description copywriting**: more compelling descriptions.
- **Automatic design**: color-palette selection.
- **Human-in-the-loop**: everything generated by AI is editable and reversible (undo).
- **Automatic translation (multi-language)**: backend AI service that translates the menu into the diner's device language when it differs from the original language.

### Multi-language menu (behavior)

- The restaurant creates and edits its menu in its **original language** (detected when extracting the uploaded menu or set during onboarding).
- The **public digital menu** detects the diner's **device language** (e.g. `Accept-Language`, browser locale).
- If the device language **matches** the original language → the menu is shown as-is.
- If the device language **differs** → a **backend AI service** translates all visible content (categories, product names, descriptions, add-ons, promotions, UI labels) into the device language.
- Translations are **cached** (e.g. Redis) to avoid re-translating on every visit.
- The restaurant owner **does not need to translate manually**; the AI does it on demand. The dashboard still shows the menu in the original language for editing.

## 5. Data model (high level)

We reuse and extend the already-documented catalog concepts (categories, products, PedidosYa-style *option groups*). Main entities:

- **restaurant** (formerly "supplier"): name, location (address + lat/lng + placeId), logo, subdomain, color palette, `originalLanguage` (menu language), publish status.
- **schedule**: separate schedules for `takeout` and `delivery` (with a "same schedule" flag).
- **paymentMethods**: `cash`, `transfer`, `cardTerminal` (with `takeout` and `delivery` sub-contexts).
- **categories**: name, image, order.
- **products**: name, description (original + optimized), price, image (original + optimized), discounts/promos, `categoryIds`, `optionGroups`.
- **optionGroups / items**: required vs optional, single vs multi, `priceDelta`.
- **aiArtifacts** (suggested): store **original vs optimized** per field/image to enable **undo** and traceability.
- **menuTranslations** (suggested): per-locale translations (`locale` → translated content per category/product/option), generated by the AI service and cached.
- **orders**: items + extras, totals, type (`takeout`/`delivery`), delivery details, payment method, timestamp, status.

> Inherited implementation notes: money in **cents**, **soft deletes** via `isActive` + `deletedAt`, timestamps via `serverTimestamp()`. See `frontend/FIRESTORE_SCHEMA_SUPPLIERS_CATALOG.md`.

## 6. Tech stack

- **Frontend**: React + TypeScript + Vite. Component-based UI, CSS Modules with CSS-variable tokens.
- **Backend / data**: Firebase — Authentication, Firestore, Storage.
- **Location**: Google Places API (`VITE_GOOGLE_MAPS_API_KEY`).
- **AI**: agents/services for OCR, structuring, image enhancement, and copywriting (provider/orchestration TBD).
- **Publishing**: subdomains under the Vendelo domain + QR generation.
- **Messaging**: integration to send orders to the restaurant's **WhatsApp**.

> The repository already contains a **panel/dashboard** cloned as a base (layout, sidebar, modals, Google auth validated against Firestore). That base is reused.

## 7. Scope and assumptions

- The uploaded menu may come in heterogeneous formats (photo, scan, PDF); the AI must tolerate low quality.
- Image optimization **must not alter the actual dish** (no "inventing" food that doesn't exist).
- Every AI change must be **auditable and reversible**.
- WhatsApp orders are the MVP "checkout"; online payments can come later.
- The public digital menu is **multi-language**: device language + automatic AI translation when it differs from the original language.
- Multi-branch is future evolution (not MVP).

## 8. Open questions (TBD)

- Which AI provider(s) for OCR, image, and text? Custom orchestration or a service?
- Online payments in the menu, or only WhatsApp confirmation in the MVP?
- Subdomain strategy (wildcard DNS, certificates) and final root domain?
- Supported languages in the MVP and fallback policy when the device language is not supported?
- Free plan limits vs paid plans (business model)?
