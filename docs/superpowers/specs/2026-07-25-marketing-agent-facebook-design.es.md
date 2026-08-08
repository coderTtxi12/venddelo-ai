# Agente de Marketing Facebook — Diseño de Arquitectura

> **Estado:** arquitectura de referencia; spike de implementación aprobado en [2026-08-07-marketing-facebook-session-spike-design.es.md](./2026-08-07-marketing-facebook-session-spike-design.es.md).  
> **Alcance:** agente de marketing que publica en Facebook, interactúa en grupos y responde comentarios. Este documento cubre la arquitectura completa; la implementación inicial será un MVP acotado (publicar en feed + sesión persistente).  
> **Explícitamente fuera de alcance (MVP):** grupos, respuestas automáticas a comentarios, pool completo de 15 agentes en producción, Graph API de Meta.

---

## 1. Objetivo

Construir un **agente de marketing** que pueda operar cuentas de Facebook en nombre de restaurantes:

- Publicar en el feed de un perfil de Facebook
- (Futuro) Publicar en grupos
- (Futuro) Responder comentarios
- (Futuro) Adaptarse cuando Facebook cambie su interfaz (DOM)

En **producción** habrá un **pool de ~15 agentes**, cada uno con su propia cuenta de Facebook guardada en la base de datos. El dueño del restaurante **nunca** proporciona credenciales; solo define el contenido o aprueba acciones.

En desarrollo y pruebas, las credenciales de Facebook se cargan **manualmente en la base de datos** (mismo modelo que producción); el frontend no las solicita.

---

## 2. Contexto actual en Venddelo

| Pieza existente | Estado |
|-----------------|--------|
| Página `/marketing` en el dashboard | Existe — hoy gestiona promociones, no redes sociales |
| Links sociales en menú digital | Solo URLs (Facebook, Instagram, WhatsApp) — sin integración API |
| Playwright | No implementado en el repo |
| Agente IA (assistant) | Patrón `router → executor → tools` con OpenAI — reutilizable como referencia |
| Graph API / OAuth de Meta | No existe |

**Gap principal:** no hay módulo de marketing social ni automatización de browser.

---

## 3. Opinión técnica y riesgos (decisiones de diseño)

### 3.1 Lo que tiene sentido

- **Scope acotado para MVP:** un endpoint de prueba + credenciales precargadas en DB es el camino correcto para validar el flujo antes del agente completo.
- **Encaja en el repo:** la ruta `/marketing` y la ausencia de integración social real hacen natural un módulo nuevo.
- **Playwright como spike:** permite probar la idea rápido sin OAuth, app de Meta ni revisión de permisos.

### 3.2 Riesgos importantes

**Credenciales solo en backend**

Usuario y contraseña de Facebook viven en la base de datos, encriptados, asociados a cada agente del pool. En dev/test se insertan manualmente en DB; el frontend nunca las recibe ni las envía.

**Playwright + Facebook es frágil**

Meta detecta automatización agresivamente: 2FA, captcha, checkpoints de seguridad, selectores que cambian, cuentas limitadas o bloqueadas. Cada publicación puede tardar 30–90 segundos; un endpoint HTTP síncrono hará timeout.

**Perfil personal vs Página de negocio**

- **Perfil personal:** la API oficial de Meta casi no permite publicar (deprecada hace años). Playwright es la única vía, pero es la más inestable.
- **Página de Facebook (negocio):** a medio plazo conviene **Graph API + OAuth** — más estable y escalable. Playwright puede ser un puente temporal.

### 3.3 Tres caminos evaluados

| Camino | Descripción | Cuándo usarlo |
|--------|-------------|---------------|
| **A) Playwright + credenciales por request** | Login en cada llamada con user/pass del body HTTP | Descartado — credenciales no viajan por API |
| **B) Playwright + sesión guardada** | Login una vez; `storage_state` encriptado por agente | **Recomendado para MVP y producción** |
| **C) Graph API + OAuth de Página** | Flujo oficial de Meta | Destino a largo plazo para Páginas de negocio |

**Recomendación:** empezar con **B** (credenciales en DB, sesión persistida); planear **C** para acciones soportadas por la API oficial.

---

## 4. Sesión persistente

Sí, **se puede y se debe mantener la sesión**. Es la forma correcta de operar en producción.

Playwright persiste cookies, `localStorage` y estado del browser:

```python
# Login una vez (manual o automatizado)
await context.storage_state(path="agent_3_session.json")

# Cada tarea posterior
context = await browser.new_context(storage_state="agent_3_session.json")
```

### 4.1 Modelo de datos por agente (producción)

| Campo | Ejemplo |
|-------|---------|
| `agent_id` | `marketing_agent_07` |
| `fb_email` | encriptado |
| `fb_password` | encriptado (solo para re-login) |
| `storage_state` | JSON encriptado de la sesión Playwright |
| `session_valid_until` | timestamp |
| `last_login_at` | timestamp |
| `status` | `active` / `checkpoint` / `banned` / `needs_manual_intervention` |

### 4.2 Flujo de sesión

1. **Primera vez:** login → guardar `storage_state` encriptado.
2. **Cada acción** (post, comentario, grupo): cargar sesión del agente, intentar la acción.
3. **Si falla** (sesión expirada, checkpoint de Meta): re-login con credenciales de DB → actualizar `storage_state`.
4. **Si hay captcha/2FA:** marcar agente como `needs_manual_intervention` y pausarlo hasta intervención humana.

Las credenciales se gestionan solo en backend/DB; el restaurante y el dashboard nunca las ven ni las capturan.

---

## 5. Pool de 15 agentes

En producción no hay una cuenta de Facebook por restaurante expuesta al usuario. Hay un **pool de cuentas de marketing** operadas por el sistema:

```
Restaurante A ──► cola de tareas ──► Agente FB #3 (publica en su feed/grupos asignados)
Restaurante B ──► cola de tareas ──► Agente FB #7
...
```

Cada agente del pool tiene:

- Identidad de Facebook (persona o perfil operativo)
- Sesión persistida (`storage_state`)
- Límites de rate (ej. máx. 5 posts/día, máx. 20 comentarios/hora)
- Grupos asignados (lista en DB)
- Credenciales en backend, encriptadas

El dueño del restaurante solo escribe el mensaje, define la campaña o aprueba la acción — nunca las credenciales.

---

## 6. Resiliencia ante cambios de DOM

Selectores CSS fijos (`#publish_button`) **se rompen** cuando Facebook actualiza su interfaz. La solución no es mantener selectores a mano, sino un **agente con loop observe → decide → act**, alineado al patrón del assistant existente (`router → executor → tools`), pero con herramientas de browser.

```
┌─────────────────────────────────────────┐
│  Observe: screenshot + accessibility tree│
│           (o solo árbol de accesibilidad) │
├─────────────────────────────────────────┤
│  Decide:  LLM analiza la pantalla       │
│           "Veo un modal de login"       │
│           "Veo el composer de post"     │
│           "Hay un captcha"              │
├─────────────────────────────────────────┤
│  Act:     click(x,y) | type(text) |      │
│           scroll | wait | navigate      │
├─────────────────────────────────────────┤
│  Repeat until goal done or stuck        │
└─────────────────────────────────────────┘
```

### 6.1 Niveles de resiliencia

| Nivel | Cómo | Resiliencia | Costo / latencia |
|-------|------|-------------|------------------|
| **A) Selectores fijos** | `#publish_button` | Baja — se rompe con cada update de FB | Barato, rápido |
| **B) LLM + accessibility tree** | Playwright expone roles/nombres; el LLM elige qué clickear | Alta — sobrevive cambios de clases/IDs | Medio |
| **C) LLM + visión (screenshot)** | El modelo "ve" la pantalla como un humano | Muy alta — sobrevive rediseños completos | Caro, lento |

**Recomendación:** empezar con **B** (accessibility tree + LLM) y escalar a **C** (screenshot) cuando B falle. Mismo patrón que Computer Use / Browser Use / Stagehand.

### 6.2 Ejemplo de prompt del browser agent

> Objetivo: publicar "🍕 2x1 en pizzas este fin de semana" en el feed.  
> Pantalla actual: [accessibility tree o screenshot]  
> Herramientas: click, type, scroll, wait, screenshot  
> ¿Cuál es el siguiente paso?

Si Facebook cambia el botón "Publicar" por un icono nuevo, el LLM lo identifica por contexto visual o por el árbol de accesibilidad (`button "Publicar"`, `textbox "¿Qué estás pensando?"`), no por un selector CSS frágil.

---

## 7. Playwright vs Graph API

Algunas acciones conviene resolverlas por API oficial donde exista:

| Acción | Playwright | Graph API |
|--------|------------|-----------|
| Post en feed personal | Sí (frágil) | No disponible |
| Post en Página de negocio | Sí | Sí (estable) |
| Responder comentarios en Página | Sí | Sí |
| Post en grupos | Sí (vía principal real) | Muy limitado |
| Unirse a grupos | Sí | No |

Grupos y feed personal casi obligatoriamente van por **browser agent**. Páginas de negocio pueden migrarse a Graph API después.

---

## 8. Arquitectura propuesta en el backend

```
backend/app/modules/marketing/
├── agent/
│   ├── browser_tools.py      # click, type, screenshot, navigate
│   ├── orchestrator.py       # loop observe → decide → act
│   └── prompts.py            # instrucciones por tarea (post, comment, group)
├── accounts/
│   ├── models.py             # MarketingAgentAccount (pool de cuentas)
│   ├── session_store.py      # storage_state encriptado
│   └── repository.py
├── tasks/
│   ├── models.py             # MarketingTask (post, reply, join_group)
│   ├── queue.py              # Redis / worker async
│   └── service.py
└── api.py                    # endpoints del dashboard
```

### 8.1 Flujo de una publicación

```
Dashboard → POST /marketing/tasks { message, restaurant_id }
         → Worker elige agente disponible del pool
         → Carga sesión del agente (storage_state)
         → Browser agent loop hasta publicar
         → Guarda resultado + screenshot de confirmación
         → Notifica al dashboard (WebSocket o polling)
```

### 8.2 Endpoint sugerido (MVP de prueba)

```
POST /restaurants/{id}/marketing/facebook/post
```

- Auth: JWT + `require_owned_restaurant`
- Body: `{ message }` — el backend asigna agente del pool (en dev/test el agente ya tiene credenciales en DB)
- Ejecución: **background job**, no request bloqueante
- Credenciales: leídas de DB encriptada, solo en memoria durante la ejecución; **nunca** loguear password

### 8.3 Frontend (MVP de prueba)

- Ubicación: sección nueva en `MarketingPage` o tab "Redes sociales"
- Campos: mensaje + estado de la tarea ("publicando…", "error", "ok")
- Sin campos de credenciales — las cuentas FB se precargan manualmente en DB
- API client: `frontend/src/lib/api/marketing.ts`

---

## 9. MVP concreto (orden de implementación)

1. **Modelo DB:** `marketing_agent_accounts` (credenciales + session encriptada); cargar al menos una cuenta de prueba manualmente.
2. **Login + persistir sesión** con Playwright.
3. **Un browser agent** con accessibility tree para "publicar en feed".
4. **Endpoint + UI de test** (solo mensaje; el backend usa el agente de DB).
5. **Cola de tareas** para no bloquear HTTP y soportar latencias de 30–90 s.

---

## 10. Decisiones pendientes

Antes de implementar, confirmar:

1. **¿Perfil personal o Página de negocio?** — Cambia viabilidad técnica y si Playwright es puente o destino final.
2. **¿Qué controla exactamente el agente?**
   - Contenido que publica cada restaurante (¿aprobación humana?)
   - Grupos donde comenta
   - Respuestas automáticas a comentarios
   - Horarios y frecuencia de publicación
3. **¿Asignación restaurante ↔ agente?** — ¿Fijo, round-robin, o por región/nicho?

---

## 11. Principios de diseño

1. **Sesión sobre credenciales:** minimizar logins repetidos; re-login solo cuando la sesión expire.
2. **Agente sobre selectores:** el LLM decide next steps ante DOM desconocido.
3. **Async sobre sync:** toda interacción con Facebook va en cola/worker.
4. **Seguridad:** credenciales y `storage_state` encriptados en DB; nunca en logs ni en el frontend.
5. **Degradación graceful:** captcha/2FA → pausar agente, notificar operador, no reintentar en loop infinito.
6. **Rate limits:** respetar límites por agente para reducir riesgo de bloqueo de cuenta.
7. **Reutilizar patrones del assistant:** orchestrator, tools, prompts — adaptados a browser en lugar de dominio de restaurante.

---

## 12. Referencias en el repo

| Recurso | Ruta |
|---------|------|
| Assistant workflow (referencia de agente) | `backend/app/modules/assistant/agent/workflow/` |
| Marketing page (UI existente) | `frontend/src/components/pages/MarketingPage.tsx` |
| Router API v1 | `backend/app/api/v1/router.py` |
| Links sociales (solo URLs hoy) | `backend/app/modules/restaurants/social_links.py` |
