# Delivery owner can remove admins and operators

**Date:** 2026-09-28

## Summary

The delivery-account owner can remove active administrators and operators from Settings → Equipo del panel. Removal asks for confirmation with the existing `ConfirmDialog`, then deactivates the membership so the person loses panel access on the next request. The same email can be invited again later and regains access with the role on that new invite.

## Screen

The Equipo activo list already shows owner, admin, and operator. Only the owner sees this section (`canManageMembers`).

- Admin and operator cards get a **Quitar** button, same control as pending invites.
- The owner card has no remove button.
- **Quitar** opens `ConfirmDialog` with the default danger variant.
  - Title: `Quitar del equipo`.
  - Body: `memberPrimaryLabel` (display name, otherwise email, otherwise `Usuario sin nombre`), `memberRoleLabel` (Administrador or Operador), and the sentence `Perderá el acceso al panel de inmediato.`
  - Confirm label: `Quitar`. Cancel and Escape close the dialog and change nothing.
  - While the request is in flight, the confirm button shows `Procesando…` and cannot be dismissed.
- On success, close the dialog, drop that member from the list, and show a short success banner: `Se quitó el acceso.`
- On failure, close the dialog and show the error in the existing team-section banner.

Pending invites keep their current **Quitar** behavior, with no dialog.

## API

`DELETE /api/v1/delivery-providers/me/members/{member_id}` returns 204 and no body.

Only the owner of that delivery account can call it, using the same owner check as invites (`_require_owner_provider_id`). Anyone else gets 403.

The target row must belong to that provider and be active. Otherwise the response is 404 with `Miembro no encontrado`.

Allowed roles are `admin` and `operator`. Removing the owner returns 400 with `No puedes quitar al propietario`. Any other role (`dispatcher`, `driver`) returns 400 with `Solo puedes quitar administradores y operadores`.

The row stays in `delivery_provider_members`. `is_active` becomes `false`. Panel access already requires an active membership (`get_for_user`), so the removed person cannot use the account after the next request.

## Re-invite

`list_admin_members` only returns active rows, so the owner can invite that email again after removal.

`claim_admin_invites` today deletes the invite when a membership row already exists and does not turn it back on. After this change, claiming an invite for an inactive row on the same provider:

- sets `is_active` to true
- sets `member_role` to the invite's role
- deletes the invite
- counts as a successful claim

An already-active row is unchanged: the invite is still deleted and the role is not overwritten.

## Tests

Backend, alongside the existing delivery admin-invite tests:

- Owner removes an active admin: 204, member gone from the list, that user no longer loads the provider.
- Owner removes an active operator: same outcome.
- Owner cannot remove their own membership: 400.
- A non-owner receives 403.
- Unknown or already-inactive member id: 404.
- After removal, a new invite for the same email reactivates the row with the invited role.

## Out of scope

- Changing a member's role without removing them.
- Invite emails.
- A confirmation dialog for pending invites.
- Removing `dispatcher` or `driver` rows from this screen. They are not listed in Equipo activo.
