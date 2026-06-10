# Commit Message Format (Conventional Style)

All commit messages **must be written in English**.

Use a *Conventional Commits*-style format:

`type(scope?): description`

Optionally add a short bullet list explaining the “what” and “why”.

## Common types

- `feat:` a new user-facing feature (new behavior)
- `fix:` a bug fix / incorrect behavior correction
- `refactor:` internal change without user-visible behavior changes
- `chore:` maintenance (lint, deps, scripts, housekeeping)
- `docs:` documentation-only changes
- `test:` add/update tests
- `build:` build tooling/config changes
- `perf:` performance improvement
- `revert:` revert a previous commit
- `remove:` remove code/feature (if you use this in your flow; otherwise prefer `chore:` or `refactor:`)
- `BREAKING CHANGE:` for backward-incompatible changes (see below)

## Example (fix)

```text
fix: restrict dashboard login to enabled suppliers (email match + access=true)
- Verify access by querying `suppliers` where `email` matches and `access` is true
- Update audit log target to `suppliers` for granted/denied login attempts
- Remove Suppliers and Roles management modules (sidebar items, routes/pages, modals, and related Firestore CRUD logic)
- Update app/dashboard branding copy to align with the supplier-focused panel
```

## Example (feat)

```text
feat: add supplier inventory publication to marketplace
- Allow suppliers to create/update product inventory items in `suppliers_products`
- Expose published inventory to convenience stores in the mobile app via Firestore queries
```

## Example (refactor)

```text
refactor: simplify supplier access verification flow
- Extract Firestore query into a dedicated helper
- Keep behavior identical; only improve readability and error handling
```

## Example (chore)

```text
chore: update build scripts and dependencies
- Bump Vite/TypeScript versions
- Run lint/build checks locally before committing
```

## Best practices

- Keep the subject line short (ideally 50-72 characters).
- Make the description express the outcome/intent (“restrict”, “add”, “remove”), not the mechanics (“change query…”).
- In bullets, include:
  - what you changed or validated,
  - any implications (UI, routes, security rules, audit logs),
  - and relevant Firestore collection/index details when applicable.
- If there are breaking changes, include:
  - `BREAKING CHANGE: ...`

## Quick template

```text
<type>[optional scope]: <imperative description>

- <bullet 1>
- <bullet 2>
- <bullet 3>
```

