# Multi-Restaurant Admin Access — Design Spec

**Date:** 2026-07-12  
**Status:** Approved for implementation  
**Scope:** Restaurant panel (`frontend/`) + restaurant backend module

## Problem

Today `restaurant_members.user_id` is globally unique, so an admin can belong to only one restaurant. Owners and admins also resolve a single restaurant via `/restaurants/me` with no switcher. Invited admins who later get invited elsewhere cannot join both.

## Goals

1. **Owner** can invite **multiple admins** to their restaurant.
2. **Only owners** can add or remove **admins** (not other owners).
3. **Admin** can be admin of **multiple restaurants** simultaneously.
4. **User** can be **owner of at most one** restaurant (unchanged business rule).
5. **Admin UI** shows a restaurant switcher when the user has access to 2+ restaurants.
6. **Default restaurant on login:**
   - Returning admin → last restaurant they administered (`last_accessed_at`).
   - First-time admin → restaurant from their invite (membership `created_at` ascending).

## Non-Goals

- Multi-owner per restaurant
- Owner managing multiple owned restaurants (still one `owner_id`)
- Delivery provider multi-admin (unchanged in this spec)

## Data Model

### `restaurant_members` changes (migration `0044`)

| Change | Reason |
|--------|--------|
| Drop `UNIQUE(user_id)` | Allow admin on multiple restaurants |
| Keep `UNIQUE(restaurant_id, user_id)` | One membership row per user per restaurant |
| Add `last_accessed_at TIMESTAMPTZ NULL` | Remember last admin context |
| Add partial unique index on `user_id WHERE member_role='owner' AND is_active` | Enforce one owner membership row per user |

### Invite rules (updated)

| Case | Allow invite? |
|------|---------------|
| Email already admin/owner **at this restaurant** | ❌ |
| Email has **pending invite** at this restaurant | ❌ |
| Email is **owner** of another restaurant | ❌ |
| Email is **admin** at other restaurant(s) | ✅ |
| Email has **pending invite** at another restaurant | ❌ (global unique on invite email) |

## API

### `GET /restaurants/me/access`

Returns all restaurants the user can access.

```json
{
  "items": [
    {
      "restaurant": { "...RestaurantDTO" },
      "member_role": "owner|admin",
      "last_accessed_at": "2026-07-12T00:00:00Z|null",
      "member_id": "uuid"
    }
  ]
}
```

### `GET /restaurants/me?restaurant_id={uuid}` (optional query)

Returns active context for one restaurant. If omitted, backend applies default selection algorithm.

### `POST /restaurants/me/select`

Body: `{ "restaurant_id": "uuid" }`

- Validates user has access
- Sets `last_accessed_at = now()` on membership row
- Returns `RestaurantMeResponse`

### `DELETE /restaurants/me/members/{member_id}`

- **Owner only**
- Target must be `member_role = admin` in owner's current restaurant
- Soft-deactivates membership (`is_active = false`)

Existing invite endpoints unchanged.

## Default selection algorithm (`get_me`)

1. Claim pending invites for user email.
2. If `restaurant_id` query param provided → validate access, touch `last_accessed_at`, return.
3. If user owns a restaurant (`owner_id`) → return owned restaurant (primary by `created_at asc`).
4. Else (admin-only):
   - If any membership has `last_accessed_at` → pick max.
   - Else (first login) → pick membership with min `created_at` (first invite claimed).
5. Touch `last_accessed_at` on selected membership.

## Authorization

| Action | Owner | Admin |
|--------|-------|-------|
| View panel for restaurant | ✅ (owned) | ✅ (member) |
| Add admin invite | ✅ | ❌ |
| Remove pending invite | ✅ | ❌ |
| Remove active admin | ✅ | ❌ |
| Remove owner | ❌ | ❌ |
| Edit restaurant settings | ✅ | ✅ (existing behavior) |

`require_owned_restaurant` continues to allow owner **or** admin with matching membership.

## Frontend UX

### Restaurant switcher (ui-ux-pro-max: Flat minimal SaaS)

- **Location:** Sidebar header, below restaurant name
- **Visibility:** Only when `accessibleRestaurants.length > 1`
- **Control:** Compact dropdown/select with restaurant name + role badge
- **On change:** `POST /me/select`, clear supplier cache, reload orders context
- **Persistence:** `localStorage` key per user for instant restore; backend `last_accessed_at` is source of truth across devices

### Settings → Administradores

- Owner sees active admins with **Quitar** (remove active admin)
- Owner cannot remove themselves or other owners
- Pending invites section unchanged

## Testing

- Admin can claim invites for 2 restaurants
- Admin `GET /me/access` returns both
- Default `/me` uses `last_accessed_at`
- First login uses first membership
- Owner cannot invite duplicate / existing member
- Owner can remove admin member
- Admin cannot remove members
- Owner still limited to one owned restaurant
