# N×M Pairing Modes Implementation Plan

> **Goal:** Support cross-product vs same-product N×M bundles, catalog-discounted pairing prices, and complement eligibility rules with live-menu UX.

**Architecture:** New `bundle_pairing_mode` column (`cross_product` | `same_product`). Pricing engine groups units per mode, compares catalog-discounted bases, and disqualifies lines with excluded complements. Marketing form exposes pairing mode; public menu shows complement warnings.

**Tech Stack:** FastAPI/SQLAlchemy, pytest, React/Next.js

---

## Shipped

- [x] Migration `0014_promotion_bundle_pairing_mode`
- [x] `pricing.py`: same-product groups, discounted base pairing, complement disqualification + warnings
- [x] `PromotionForm`: pairing mode segment + updated copy
- [x] `DigitalMenuProductDetail`: "Fuera de promo" badges + banner
- [x] Tests: same_product, catalog discount pairing, excluded complement
