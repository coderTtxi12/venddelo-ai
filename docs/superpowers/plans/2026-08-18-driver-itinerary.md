# Driver itinerary Implementation Plan

> **For agentic workers:** Use TDD. Persist remaining stops; app and monitor read the same list.

**Goal:** Freeze pickup/dropoff sequence in Postgres so automatic cases A–D and manual `/monitor` order stay in sync on rider app and dashboard.

**Architecture:** Pure planner in `itinerary.py`. ORM rows on `delivery_driver_itinerary_stops`. Rebuild on accept; drop stops on pickup/deliver/cancel; PATCH permutes remaining. Monitor and rider DTOs expose the list; clients stop recomputing order from live GPS.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Next.js monitor, Flutter rider.

## Global Constraints

- Sequence is source of truth; polylines may still be live-routed.
- Automatic rebuild follows case A/B/C/D; manual uses dispatcher order (drawer + drag).
- Do not commit unless the user asks.

## Tasks

- [ ] Pure `plan_itinerary` tests (A, pre-free, C, D, M)
- [ ] Model + migration 0057
- [ ] Persist on accept / complete / cancel / reorder
- [ ] Monitor + rider DTOs
- [ ] Manual offer `itinerary` + PATCH
- [ ] Dashboard: API itinerary, drawer order, drag
- [ ] Rider app: navigate backend itinerary
