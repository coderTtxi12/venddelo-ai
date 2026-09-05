# Live menu cart stock validation

**Date:** 2026-09-05  
**Status:** Approved (message option A; approach 1)

## Goal

Block live-menu checkout when cart quantity exceeds available stock, only if:
- Restaurant has **Reflejar inventario en menú live** ON
- Product has configured `inventory_qty` (tracked)

Message style: **«Solo quedan N de {nombre}»**. Validate on cart continue and final send. Theme tokens, mobile-first.

## Design

1. Public menu sanitize keeps `inventory_qty` when toggle ON; still strips expiry/batch fields. Toggle OFF → `inventory_qty` null.
2. Extend cart availability issues with `kind: 'stock'` (aggregate qty per product across lines).
3. Cart «Continuar / Completar pedido» and summary «Enviar» refresh menu and block on stock shortfalls.
4. Alert banner + per-line message using `--dm-*` / urgency tokens.
