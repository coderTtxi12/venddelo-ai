# Public tracking Supabase Realtime — fix wave

Branch: `feat/public-tracking-supabase-realtime`

## Fixes applied

| # | Severity | Item | Change |
|---|----------|------|--------|
| 1 | Critical | `select` import in `ws.py` | Restored `from sqlalchemy import select`; fixed import block (ruff I001) |
| 2 | Critical | SECURITY DEFINER grant | Added `REVOKE EXECUTE … FROM PUBLIC/anon/authenticated` DO block in migration `0063` and `_TRACKING_SQL` fixture |
| 3 | Critical | GPS UPDATE broadcast | Wrapped `realtime.send` in `tracking_realtime_send` with `EXCEPTION WHEN OTHERS` warning handler |
| 4 | Important | Refetch on tab visible | `hasConnectedOnce` → `useRef(false)` in `usePublicTrackingRealtime.ts` so hide→show re-subscribe calls `onReconnect` |
| 5 | Important | No poll while hidden | Hook exports `visibilityState`; poll effect in `PublicTracking.tsx` depends on it |
| 6 | Important | WS-removed test | Replaced vacuous GET with FastAPI route scan (recursive Mount walk); moved to `test_delivery_dispatch_ws.py` (no DB autouse) |
| 7 | Cheap | `CLOSED` channel status | Treated like `TIMED_OUT` in subscribe callback |
| 8 | Cheap | Ruff | I001 in `ws.py`, E501 in `test_public_tracking_realtime_sql.py` |

## Tests

### `cd backend && .venv/bin/ruff check app/modules/delivery_dispatch/ws.py`

```
All checks passed!
```

### `cd backend && .venv/bin/python -m pytest tests/api/test_restaurant_dispatch_requests.py::test_public_tracking_ws_route_removed -v --tb=short`

Test relocated to avoid autouse Postgres fixture in that module:

```
ERROR: not found: .../test_restaurant_dispatch_requests.py::test_public_tracking_ws_route_removed
(no match in any of [<Module test_restaurant_dispatch_requests.py>])
collected 0 items
```

Replacement (same assertion, no DB):

```
cd backend && .venv/bin/python -m pytest tests/modules/test_delivery_dispatch_ws.py -v --tb=short
```

```
tests/modules/test_delivery_dispatch_ws.py::test_rider_ws_module_imports_sqlalchemy_select PASSED
tests/modules/test_delivery_dispatch_ws.py::test_public_tracking_ws_route_removed PASSED
======================== 2 passed, 6 warnings in 3.52s =========================
```

### `cd frontend && node --import tsx --test src/lib/dispatch/publicTrackingRealtime.test.ts`

```
# tests 3
# pass 3
# fail 0
```

## Remaining concerns

- Postgres trigger integration tests (`test_public_tracking_realtime_sql.py`) not re-run here (Docker/Postgres unavailable).
- Hook visibility/reconnect behavior not covered by automated frontend tests (no RTL per spec).
