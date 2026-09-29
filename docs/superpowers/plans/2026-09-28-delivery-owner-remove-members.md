# Delivery Owner Remove Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the delivery-account owner remove active administrators and operators from Settings, after a confirmation dialog, and allow the same email to be invited again.

**Architecture:** `DELETE /api/v1/delivery-providers/me/members/{member_id}` deactivates the membership row (`is_active = false`) and does not delete it. Panel access already ignores inactive rows. Claiming a later invite reactivates that row and applies the new invite role. The dashboard opens the existing `ConfirmDialog` before calling the endpoint.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, Next.js delivery dashboard, existing `ConfirmDialog`.

## Global Constraints

- Only the owner can call the delete endpoint (`_require_owner_provider_id`). Anyone else gets 403.
- Allowed target roles are `admin` and `operator`. Owner removal returns 400 `No puedes quitar al propietario`. `dispatcher` and `driver` return 400 `Solo puedes quitar administradores y operadores`.
- Missing or already-inactive member returns 404 `Miembro no encontrado`.
- Success is 204 with no body. The row stays; `is_active` becomes `false`.
- Confirm dialog title `Quitar del equipo`, confirm label `Quitar`, danger variant, body uses `memberPrimaryLabel`, `memberRoleLabel`, and `Perderá el acceso al panel de inmediato.`
- Success banner copy: `Se quitó el acceso.` On failure, close the dialog and show the error in the team-section banner.
- Pending invites keep the current **Quitar** button with no dialog.
- An inactive membership claimed from a new invite becomes active with that invite's role. An already-active membership is not overwritten.
- Out of scope: role changes without removal, invite emails, a dialog for pending invites, removing dispatcher or driver from the Equipo activo screen.

---

### Task 1: Deactivate admin and operator memberships

**Files:**
- Modify: `backend/tests/api/test_delivery_provider_admin_invites.py`
- Modify: `backend/app/modules/delivery_providers/repository.py` (abstract method after `remove_admin_invite`)
- Modify: `backend/app/modules/delivery_providers/adapters.py` (method after `remove_admin_invite`)
- Modify: `backend/app/modules/delivery_providers/service.py` (method after `remove_admin_invite`)
- Modify: `backend/app/modules/delivery_providers/api.py` (route after `remove_my_delivery_provider_admin_invite`)

**Interfaces:**
- Consumes: `DeliveryProviderService._require_owner_provider_id(user_id) -> uuid.UUID`; `DeliveryProviderMember.is_active`; existing invite-and-claim flow in `test_delivery_provider_admin_invites.py`.
- Produces: `DeliveryProviderRepository.remove_admin_member(self, provider_id: uuid.UUID, member_id: uuid.UUID) -> None`; `DeliveryProviderService.remove_admin_member(self, user_id: uuid.UUID, member_id: uuid.UUID) -> None`; `DELETE /api/v1/delivery-providers/me/members/{member_id}` → 204.

- [ ] **Step 1: Write the failing tests**

Add these imports and constants at the top of `backend/tests/api/test_delivery_provider_admin_invites.py` (keep the existing imports):

```python
from app.db.models.user import User

OPERATOR = uuid.UUID("33333333-3333-3333-3333-333333333333")
DRIVER = uuid.UUID("44444444-4444-4444-4444-444444444444")
```

`User` is not imported today. `uuid` already is.

Append this helper and these tests at the end of the file:

```python
def _invite_and_claim(client, *, email: str, user_id: uuid.UUID, member_role: str) -> None:
    created = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": email, "member_role": member_role},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text

    app.dependency_overrides[get_auth] = lambda: FakeAuth(user_id=user_id, email=email)
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        assert me.json()["member_role"] == member_role
    finally:
        app.dependency_overrides.pop(get_auth, None)


def _member_id(client, role: str) -> str:
    listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert listed.status_code == 200, listed.text
    return next(row["id"] for row in listed.json() if row["member_role"] == role)


@requires_db
def test_owner_can_remove_active_admin(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="nuevo.admin@empresa.com",
        user_id=ADMIN,
        member_role="admin",
    )
    member_id = _member_id(client, "admin")

    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert removed.status_code == 204
    assert removed.content == b""

    listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert all(row["member_role"] != "admin" for row in listed.json())

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="nuevo.admin@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200
        assert me.json()["provider"] is None
        assert me.json()["member_role"] is None
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_owner_can_remove_active_operator(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="operador@empresa.com",
        user_id=OPERATOR,
        member_role="operator",
    )
    member_id = _member_id(client, "operator")

    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert removed.status_code == 204

    listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert all(row["member_role"] != "operator" for row in listed.json())

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.json()["provider"] is None
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_owner_cannot_remove_self(client):
    _create_provider(client)
    owner_id = _member_id(client, "owner")

    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{owner_id}",
        headers=AUTH,
    )
    assert removed.status_code == 400
    assert removed.json()["error"]["message"] == "No puedes quitar al propietario"

    listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert any(row["member_role"] == "owner" for row in listed.json())


@requires_db
def test_non_owner_cannot_remove_member(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="nuevo.admin@empresa.com",
        user_id=ADMIN,
        member_role="admin",
    )
    owner_id = _member_id(client, "owner")

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="nuevo.admin@empresa.com",
    )
    try:
        removed = client.delete(
            f"/api/v1/delivery-providers/me/members/{owner_id}",
            headers=AUTH,
        )
        assert removed.status_code == 403
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_remove_unknown_member_returns_404(client):
    _create_provider(client)
    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{uuid.uuid4()}",
        headers=AUTH,
    )
    assert removed.status_code == 404
    assert removed.json()["error"]["message"] == "Miembro no encontrado"


@requires_db
def test_remove_already_inactive_member_returns_404(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="nuevo.admin@empresa.com",
        user_id=ADMIN,
        member_role="admin",
    )
    member_id = _member_id(client, "admin")
    first = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert first.status_code == 204

    second = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert second.status_code == 404
    assert second.json()["error"]["message"] == "Miembro no encontrado"


@requires_db
def test_owner_cannot_remove_driver_or_dispatcher(client, engine):
    provider_id = _create_provider(client)
    dispatcher_id = uuid.UUID("55555555-5555-5555-5555-555555555555")
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        session.add(User(id=DRIVER, email="driver@empresa.com"))
        session.add(User(id=dispatcher_id, email="dispatcher@empresa.com"))
        driver = DeliveryProviderMember(
            delivery_provider_id=provider_id,
            user_id=DRIVER,
            member_role="driver",
            is_active=True,
        )
        dispatcher = DeliveryProviderMember(
            delivery_provider_id=provider_id,
            user_id=dispatcher_id,
            member_role="dispatcher",
            is_active=True,
        )
        session.add(driver)
        session.add(dispatcher)
        session.commit()
        member_ids = [driver.id, dispatcher.id]

    for member_id in member_ids:
        removed = client.delete(
            f"/api/v1/delivery-providers/me/members/{member_id}",
            headers=AUTH,
        )
        assert removed.status_code == 400
        assert (
            removed.json()["error"]["message"]
            == "Solo puedes quitar administradores y operadores"
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:

```bash
python -m pytest tests/api/test_delivery_provider_admin_invites.py::test_owner_can_remove_active_admin tests/api/test_delivery_provider_admin_invites.py::test_owner_cannot_remove_self tests/api/test_delivery_provider_admin_invites.py::test_remove_unknown_member_returns_404 -v
```

Expected: FAIL. The route does not exist, so responses are not 204 / 400 with those messages.

- [ ] **Step 3: Implement removal**

In `backend/app/modules/delivery_providers/repository.py`, after `remove_admin_invite`:

```python
    @abstractmethod
    def remove_admin_member(self, provider_id: uuid.UUID, member_id: uuid.UUID) -> None: ...
```

In `backend/app/modules/delivery_providers/adapters.py`, after `remove_admin_invite`:

```python
    def remove_admin_member(self, provider_id: uuid.UUID, member_id: uuid.UUID) -> None:
        from app.core.exceptions import NotFoundError, ValidationError

        member = self._session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.id == member_id,
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.is_active.is_(True),
            )
        )
        if member is None:
            raise NotFoundError("Miembro no encontrado")
        if member.member_role == "owner":
            raise ValidationError("No puedes quitar al propietario")
        if member.member_role not in ("admin", "operator"):
            raise ValidationError("Solo puedes quitar administradores y operadores")
        member.is_active = False
        self._session.flush()
```

In `backend/app/modules/delivery_providers/service.py`, after `remove_admin_invite`:

```python
    def remove_admin_member(self, user_id: uuid.UUID, member_id: uuid.UUID) -> None:
        provider_id = self._require_owner_provider_id(user_id)
        self._repo.remove_admin_member(provider_id, member_id)
```

In `backend/app/modules/delivery_providers/api.py`, after `remove_my_delivery_provider_admin_invite`:

```python
@router.delete("/me/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_delivery_provider_member(
    member_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> None:
    service.remove_admin_member(user.id, member_id)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `backend/`:

```bash
python -m pytest tests/api/test_delivery_provider_admin_invites.py -v
```

Expected: PASS, including the new removal tests and the previous invite tests.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/api/test_delivery_provider_admin_invites.py \
  backend/app/modules/delivery_providers/repository.py \
  backend/app/modules/delivery_providers/adapters.py \
  backend/app/modules/delivery_providers/service.py \
  backend/app/modules/delivery_providers/api.py
git commit -m "$(cat <<'EOF'
feat: let delivery owners deactivate admins and operators

- Reject owner, driver, and dispatcher removal and hide inactive members
- Keep the membership row so a later invite can restore access
EOF
)"
```

---

### Task 2: Reactivate an inactive member when they claim a new invite

**Files:**
- Modify: `backend/tests/api/test_delivery_provider_admin_invites.py`
- Modify: `backend/app/modules/delivery_providers/adapters.py` (`claim_admin_invites`)

**Interfaces:**
- Consumes: `DeliveryProviderRepository.remove_admin_member` from Task 1; `claim_admin_invites(user_id: uuid.UUID, email: str) -> bool`.
- Produces: claiming an invite for an inactive row sets `is_active = True` and `member_role` to the invite role, deletes the invite, and returns `True`. An active row keeps its role; the invite is still deleted.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/api/test_delivery_provider_admin_invites.py`:

```python
@requires_db
def test_reinvite_reactivates_member_with_new_role(client, engine):
    provider_id = _create_provider(client)
    _invite_and_claim(
        client,
        email="operador@empresa.com",
        user_id=OPERATOR,
        member_role="operator",
    )
    member_id = _member_id(client, "operator")
    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert removed.status_code == 204

    invited = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "operador@empresa.com", "member_role": "admin"},
        headers=AUTH,
    )
    assert invited.status_code == 201, invited.text

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        assert me.json()["member_role"] == "admin"
        assert me.json()["provider"]["id"] == str(provider_id)
    finally:
        app.dependency_overrides.pop(get_auth, None)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        member = session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.user_id == OPERATOR,
            )
        )
        assert member is not None
        assert member.is_active is True
        assert member.member_role == "admin"
        invite = session.scalar(
            select(DeliveryProviderAdminInvite).where(
                DeliveryProviderAdminInvite.delivery_provider_id == provider_id
            )
        )
        assert invite is None


@requires_db
def test_claim_does_not_overwrite_active_member_role(client, engine):
    provider_id = _create_provider(client)
    _invite_and_claim(
        client,
        email="operador@empresa.com",
        user_id=OPERATOR,
        member_role="operator",
    )

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        session.add(
            DeliveryProviderAdminInvite(
                delivery_provider_id=provider_id,
                email="operador@empresa.com",
                member_role="admin",
            )
        )
        session.commit()

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        assert me.json()["member_role"] == "operator"
    finally:
        app.dependency_overrides.pop(get_auth, None)

    with factory() as session:
        member = session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.user_id == OPERATOR,
            )
        )
        assert member is not None
        assert member.member_role == "operator"
        assert member.is_active is True
        invite = session.scalar(select(DeliveryProviderAdminInvite))
        assert invite is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:

```bash
python -m pytest tests/api/test_delivery_provider_admin_invites.py::test_reinvite_reactivates_member_with_new_role tests/api/test_delivery_provider_admin_invites.py::test_claim_does_not_overwrite_active_member_role -v
```

Expected: FAIL. `test_reinvite_reactivates_member_with_new_role` gets `member_role` null because the existing inactive row is ignored. `test_claim_does_not_overwrite_active_member_role` may already pass; keep it as the guard for the active-row branch.

- [ ] **Step 3: Reactivate inactive rows inside `claim_admin_invites`**

Replace the loop body in `SqlAlchemyDeliveryProviderRepository.claim_admin_invites` so an existing row is loaded as the member, not only its id:

```python
        claimed = False
        for invite in invites:
            existing = self._session.scalar(
                select(DeliveryProviderMember).where(
                    DeliveryProviderMember.delivery_provider_id == invite.delivery_provider_id,
                    DeliveryProviderMember.user_id == user_id,
                )
            )
            if existing is None:
                self._session.add(
                    DeliveryProviderMember(
                        delivery_provider_id=invite.delivery_provider_id,
                        user_id=user_id,
                        member_role=invite.member_role,
                        is_active=True,
                    )
                )
                claimed = True
            elif not existing.is_active:
                existing.is_active = True
                existing.member_role = invite.member_role
                claimed = True
            self._session.delete(invite)

        if claimed:
            self._session.flush()
        return claimed
```

Leave the email normalization and the empty-invite early return as they are. An active `existing` row still only deletes the invite.

- [ ] **Step 4: Run the tests to verify they pass**

Run from `backend/`:

```bash
python -m pytest tests/api/test_delivery_provider_admin_invites.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/api/test_delivery_provider_admin_invites.py \
  backend/app/modules/delivery_providers/adapters.py
git commit -m "$(cat <<'EOF'
fix: restore delivery access when a removed member accepts a new invite

- Reactivate the inactive membership and apply the invite role
- Leave an already-active role unchanged when a stray invite is claimed
EOF
)"
```

---

### Task 3: Confirm and remove members in Settings

**Files:**
- Create: `delivery-dashboard/src/lib/access/deliveryProviderPermissions.test.ts`
- Modify: `delivery-dashboard/src/lib/access/deliveryProviderPermissions.ts`
- Modify: `delivery-dashboard/src/lib/api/deliveryProviders.ts` (after `removeMyDeliveryProviderAdminInvite`)
- Modify: `delivery-dashboard/src/components/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `DELETE /api/v1/delivery-providers/me/members/{member_id}` from Task 1; `ConfirmDialog` at `delivery-dashboard/src/components/ui/ConfirmDialog.tsx`; `memberPrimaryLabel` and `memberRoleLabel`; CSS classes `removeBtn` and `adminMemberCard` already in `SettingsPage.module.css`.
- Produces: `canRemoveTeamMember(role: string | null | undefined): boolean`; `removeMyDeliveryProviderMember(token: string, memberId: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `delivery-dashboard/src/lib/access/deliveryProviderPermissions.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { canRemoveTeamMember } from './deliveryProviderPermissions';

test('only admins and operators can be removed from the delivery team', () => {
  assert.equal(canRemoveTeamMember('admin'), true);
  assert.equal(canRemoveTeamMember('operator'), true);
  assert.equal(canRemoveTeamMember('owner'), false);
  assert.equal(canRemoveTeamMember('dispatcher'), false);
  assert.equal(canRemoveTeamMember('driver'), false);
  assert.equal(canRemoveTeamMember(null), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `delivery-dashboard/`:

```bash
node --experimental-strip-types --test src/lib/access/deliveryProviderPermissions.test.ts
```

Expected: FAIL because `canRemoveTeamMember` is not exported.

- [ ] **Step 3: Add the permission helper and the API client**

In `delivery-dashboard/src/lib/access/deliveryProviderPermissions.ts`, after `canManageMembers`:

```ts
export function canRemoveTeamMember(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'operator';
}
```

In `delivery-dashboard/src/lib/api/deliveryProviders.ts`, after `removeMyDeliveryProviderAdminInvite`:

```ts
export function removeMyDeliveryProviderMember(token: string, memberId: string) {
  return apiRequest<void>(`/delivery-providers/me/members/${memberId}`, {
    method: 'DELETE',
    token,
  });
}
```

- [ ] **Step 4: Run the permission test**

Run from `delivery-dashboard/`:

```bash
node --experimental-strip-types --test src/lib/access/deliveryProviderPermissions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire the dialog in Settings**

In `delivery-dashboard/src/components/pages/SettingsPage.tsx`:

Import `ConfirmDialog` from `@/components/ui/ConfirmDialog`.

Import `canRemoveTeamMember` from `@/lib/access/deliveryProviderPermissions` next to `memberRoleLabel`.

Import `removeMyDeliveryProviderMember` next to `removeMyDeliveryProviderAdminInvite`.

Add state next to `removingInviteId`:

```tsx
  const [memberPendingRemoval, setMemberPendingRemoval] =
    useState<DeliveryProviderMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
```

Add this handler next to `handleRemoveAdmin`:

```tsx
  const handleRemoveMember = async () => {
    if (!memberPendingRemoval) return;
    if (!accessToken) {
      setMemberPendingRemoval(null);
      setAdminError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    const memberId = memberPendingRemoval.id;
    setRemovingMember(true);
    setAdminError(null);
    setAdminSuccess(null);

    try {
      await removeMyDeliveryProviderMember(accessToken, memberId);
      setAdminMembers((current) => current.filter((member) => member.id !== memberId));
      setMemberPendingRemoval(null);
      setAdminSuccess('Se quitó el acceso.');
      window.setTimeout(() => setAdminSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      setMemberPendingRemoval(null);
      if (err instanceof ApiError) {
        setAdminError(err.message);
      } else {
        setAdminError('No se pudo quitar el acceso.');
      }
    } finally {
      setRemovingMember(false);
    }
  };
```

Inside the Equipo activo card, after the `adminMemberBody` div and before the `</li>`, render the button only for removable roles:

```tsx
                          {canRemoveTeamMember(member.member_role) ? (
                            <button
                              type="button"
                              className={styles.removeBtn}
                              disabled={removingMember}
                              onClick={() => setMemberPendingRemoval(member)}
                            >
                              Quitar
                            </button>
                          ) : null}
```

Do not change the pending-invite **Quitar** button.

Just before `</PanelPageShell>`, add:

```tsx
      <ConfirmDialog
        open={memberPendingRemoval !== null}
        title="Quitar del equipo"
        body={
          memberPendingRemoval ? (
            <>
              <strong>{memberPrimaryLabel(memberPendingRemoval)}</strong>
              {' · '}
              {memberRoleLabel(memberPendingRemoval.member_role)}. Perderá el acceso al panel
              de inmediato.
            </>
          ) : null
        }
        confirmLabel="Quitar"
        confirming={removingMember}
        onCancel={() => {
          if (!removingMember) setMemberPendingRemoval(null);
        }}
        onConfirm={() => void handleRemoveMember()}
      />
```

`ConfirmDialog` already uses the danger variant by default, shows `Procesando…` while `confirming` is true, and ignores Escape and backdrop clicks in that state. No CSS change: `.removeBtn` and `.adminMemberCard .removeBtn` already exist.

- [ ] **Step 6: Typecheck**

Run from `delivery-dashboard/`:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add delivery-dashboard/src/lib/access/deliveryProviderPermissions.ts \
  delivery-dashboard/src/lib/access/deliveryProviderPermissions.test.ts \
  delivery-dashboard/src/lib/api/deliveryProviders.ts \
  delivery-dashboard/src/components/pages/SettingsPage.tsx
git commit -m "$(cat <<'EOF'
feat: confirm before the delivery owner removes a team member

- Show Quitar only for administrators and operators
- Deactivate access after the existing confirmation dialog
EOF
)"
```
