# Spike: Facebook feed publish + sesión persistente

> **Estado:** aprobado — listo para plan de implementación.  
> **Padre:** [Agente de Marketing Facebook](./2026-07-25-marketing-agent-facebook-design.es.md)  
> **Alcance:** validar credenciales cifradas en DB, Playwright con `storage_state`, publicación en feed y tasks async consultables por GET.

---

## 1. Objetivo del spike

Probar de punta a punta, desde Postman:

1. Credenciales de un perfil FB en DB (cifradas).
2. Endpoint autenticado que encola una publicación.
3. Worker in-process que usa Playwright + sesión persistente.
4. GET que reporta `queued` / `running` / `succeeded` / `failed`.

El mensaje llega en el body; las credenciales **nunca** viajan por API ni frontend.

---

## 2. Fuera de alcance

- Frontend / UI de marketing social
- Redis / Celery / cola externa
- LLM browser-agent (observe → decide → act)
- Asignación restaurante ↔ agente
- Grupos, comentarios, Graph API
- Pool de 15 agentes en producción

---

## 3. Decisiones cerradas

| Tema | Decisión |
|------|----------|
| Ejecución | Async mínimo: POST → `202` + `task_id`; GET para resultado |
| Persistencia de tasks | Tabla Postgres `marketing_tasks` (no Redis, no memoria) |
| Auth del POST/GET | `restaurant_id` + JWT + `require_owned_restaurant` |
| Selección de agente | Primera fila `marketing_agent_accounts` con `status = active` |
| Credenciales | Solo DB, cifradas con Fernet; seed vía script CLI |
| Browser | Playwright; sesión vía `storage_state` cifrado en la misma fila del agente |
| Selectores | Fijos en el spike (composer + Publicar); resiliencia LLM después |

---

## 4. Modelo de datos

### 4.1 `marketing_agent_accounts`

| Campo | Tipo / notas |
|-------|----------------|
| `id` | UUID PK |
| `label` | texto, ej. `test-agent-1` |
| `fb_email_encrypted` | bytes/text Fernet |
| `fb_password_encrypted` | bytes/text Fernet |
| `storage_state_encrypted` | bytes/text Fernet JSON, nullable |
| `status` | `active` / `checkpoint` / `banned` / `needs_manual_intervention` |
| `last_login_at` | timestamp nullable |
| `session_valid_until` | timestamp nullable |
| `created_at` / `updated_at` | como el resto del repo |

ORM: `backend/app/db/models/marketing.py` (convención del repo; no models dentro del módulo).  
Migración Alembic siguiente a `0049`.

### 4.2 `marketing_tasks`

| Campo | Tipo / notas |
|-------|----------------|
| `id` | UUID PK = `task_id` expuesto al cliente |
| `restaurant_id` | FK `restaurants.id` (ownership / auditoría) |
| `agent_id` | FK `marketing_agent_accounts.id` (cuenta usada) |
| `message` | texto a publicar |
| `status` | `queued` → `running` → `succeeded` \| `failed` |
| `error` | texto nullable |
| `result` | JSONB nullable (`posted_at`, notas) |
| `created_at` | timestamp |
| `started_at` / `finished_at` | nullable |

Sin FK de “asignación fija” restaurante→agente en este spike: `restaurant_id` autentica y audita; el agente se elige como la primera cuenta `active`.

---

## 5. Cifrado

- Env: `MARKETING_AGENT_FERNET_KEY` (Settings: `marketing_agent_fernet_key`).
- Helper Fernet (encrypt/decrypt str y JSON) reutilizable por script, session store y worker.
- Dependencia: `cryptography` ya está en `requirements.txt`.
- Nunca loguear plaintext de email/password ni `storage_state`.
- Nunca devolver campos cifrados ni desencriptados en respuestas HTTP.

### Script seed

CLI (ej. `backend/scripts/seed_marketing_agent.py`) que:

1. Lee email, password, label (args o prompt).
2. Cifra con la key del `.env`.
3. Inserta fila `status=active` en `marketing_agent_accounts`.

Uso esperado en local: correr el script una vez con la cuenta de prueba; no pegar plaintext en SQL.

---

## 6. API

```
POST /api/v1/restaurants/{restaurant_id}/marketing/facebook/posts
Authorization: Bearer <JWT>
Body: { "message": "<texto>" }
→ 202 { "task_id": "<uuid>", "status": "queued" }

GET /api/v1/restaurants/{restaurant_id}/marketing/tasks/{task_id}
Authorization: Bearer <JWT>
→ 200 {
    "task_id": "<uuid>",
    "status": "queued|running|succeeded|failed",
    "error": null | "<msg>",
    "result": null | { ... }
  }
```

- Auth: `require_owned_restaurant` en ambos.
- GET 404 si el task no existe o no pertenece a ese `restaurant_id`.
- Tras el POST: insertar task `queued`, disparar worker in-process (`asyncio.create_task` o equivalente del stack), responder de inmediato.

### Worker in-process

1. Marcar task `running` + `started_at`.
2. Cargar primera cuenta `active`; si no hay → `failed`.
3. Ejecutar flujo Playwright (sección 7).
4. Actualizar task `succeeded`/`failed` + `finished_at` (+ `result`/`error`).
5. Si captcha/2FA/checkpoint: marcar agente `needs_manual_intervention` y task `failed`.

Limitación aceptada del spike: si el proceso del API se reinicia, tasks `queued`/`running` pueden quedar colgados (sin cola durable). Suficiente para Postman local.

---

## 7. Playwright — sesión persistente

```
load agent (active)
  → decrypt credentials (+ storage_state if present)
  → if storage_state:
        context = browser.new_context(storage_state=...)
        try publish on feed
        on session failure → login + save new storage_state
     else:
        login → save storage_state → publish
  → on captcha/2FA → agent needs_manual_intervention, task failed
```

- Persistencia: `context.storage_state()` → JSON → Fernet → columna `storage_state_encrypted`.
- Publicación: selectores fijos al composer del feed + botón Publicar (fragilidad aceptada en el spike).
- Headless por defecto; variable de entorno opcional para headed en debug local.
- Timeout generoso en el worker (orden de 60–120s), no en el request HTTP del POST.

---

## 8. Layout de código (alineado al repo)

```
backend/app/db/models/marketing.py          # ORM accounts + tasks
backend/migrations/versions/0050_*.py       # tablas
backend/app/modules/marketing/
  api.py
  schemas.py
  service.py
  repository.py / adapters.py
  crypto.py                                 # Fernet helper
  browser/
    session.py                              # load/save storage_state
    publisher.py                            # login + publish feed
backend/scripts/seed_marketing_agent.py
```

Registrar: model en `app/db/models/__init__.py`, repos en UoW si aplica, router en `app/api/v1/router.py`.  
Settings: `marketing_agent_fernet_key` en `app/core/config.py` + `.env.example`.

---

## 9. Prueba manual (Postman)

1. Migración + `MARKETING_AGENT_FERNET_KEY` en `.env`.
2. `seed_marketing_agent.py` con cuenta FB de prueba → una fila `active`.
3. POST con JWT de un owner/admin + `message`.
4. Polling GET hasta `succeeded` o `failed`.
5. Segunda llamada debería reutilizar sesión (sin login completo si `storage_state` sigue válido).

---

## 10. Criterios de éxito

- Credenciales no aparecen en logs ni en respuestas API.
- Primera publicación puede hacer login y persistir sesión.
- Segunda publicación reutiliza `storage_state` cuando es válido.
- POST responde en milisegundos con `queued`; el trabajo largo ocurre en background.
- GET refleja el estado final correctamente.

---

## 11. Siguiente paso (fuera de este spike)

- Cola durable (Redis/worker) si hace falta en prod.
- Asignación restaurante ↔ agente.
- Browser agent con accessibility tree / LLM.
- UI dashboard (solo mensaje + estado; sin credenciales).
