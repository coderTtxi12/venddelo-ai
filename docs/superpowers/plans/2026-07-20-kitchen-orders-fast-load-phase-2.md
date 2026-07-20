# Kitchen Orders Fast Load Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Filtros server-side, contadores precisos y scroll infinito en `/orders`.

**Architecture:** `GET /orders/summary` + query `view`/`status`; contexto con `kitchenFilter`; WebSocket filter-aware.

**Tech Stack:** FastAPI/SQLAlchemy, Next.js React, Supabase auth

## Global Constraints

- Deploy backend + frontend juntos
- UI copy in Spanish
- WebSocket kitchen realtime intacto

---

### Task 1: Backend summary + view filter ✅
### Task 2: Frontend API + orderStatus helpers ✅
### Task 3: RestaurantOrdersContext filter-aware ✅
### Task 4: KitchenOrdersView infinite scroll ✅
### Task 5: Tests — backend repo + frontend node:test
