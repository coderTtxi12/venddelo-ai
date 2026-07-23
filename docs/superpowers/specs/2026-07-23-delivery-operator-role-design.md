# Delivery Dashboard Operator Role

**Date:** 2026-07-23

## Summary

Adds an `operator` member role for delivery provider teams. Operators can accept restaurant partnership requests, manage operational weather, and use the quote simulator. All other dashboard areas are read-only. Owners can invite both full `admin` users and limited `operator` users by email (including addresses not yet registered).

## Backend

- Migration `0049_delivery_provider_operator_role`: extends `member_role` CHECK with `operator`; adds `member_role` to `delivery_provider_admin_invites` (`admin` | `operator`).
- `permissions.py`: centralized role checks with 403 on write endpoints.
- Invite claim assigns role from invite row (not hardcoded `admin`).
- Partnership accept/reject requires `can_manage_partnerships`.

## Frontend

- `DeliveryProviderAccessProvider` + `useDeliveryProviderAccess()` for role-aware UI.
- Settings → **Equipo del panel**: invite administrators or operators.
- Operator UX: read-only fieldsets on config/schedules/payments/zone; editable weather + simulator on Tariffs; partnerships unchanged.

## Out of scope

- Promoting/demoting existing members via UI.
- Email notifications on invite.
