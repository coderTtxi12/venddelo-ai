# Delivery Dashboard

Panel de administración frontend basado en la UI de Venddelo AI, preparado para operaciones de delivery.

## Stack

- Next.js 16 + TypeScript
- React 19
- MUI Icons
- Supabase Auth (Google OAuth)

## Inicio rápido

```bash
cp .env.example .env.local
# Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY

pnpm install
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Supabase

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Habilita el proveedor **Google** en Authentication → Providers.
3. Añade `http://localhost:3000/auth/callback` como redirect URL permitida.
4. Copia la URL y la anon key a `.env.local`.

## Qué incluye

- **UI completa**: login, sidebar, topbar, dashboard con datos de ejemplo y shells de páginas.
- **Auth**: inicio de sesión con Google vía Supabase.
- **Sin lógica de negocio**: las páginas del panel son placeholders listos para conectar tu backend.

## Estructura

```
src/
  app/           # Rutas Next.js
  components/    # UI (pages, ui)
  hooks/         # useAuth
  layouts/       # MainLayout
  lib/supabase/  # Cliente y middleware de sesión
```
