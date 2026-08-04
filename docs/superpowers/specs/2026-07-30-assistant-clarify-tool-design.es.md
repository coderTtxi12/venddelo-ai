# Assistant Clarify Tool — Diseño

> **Estado:** implementado y verificado (2026-07-30).  
> **Alcance:** tool `clarify` mid-turn (bloqueo + espera de respuesta del usuario) **solo en el Orchestrator**. Los subagentes (`catalog_agent`, `operations_agent`) no tienen `clarify`; si necesitan una decisión del usuario, la reportan en `ExecutionRecord.notes` (`needs_user_input:…`) y el Orchestrator es quien llama `clarify`. UI en el chat del dashboard y timeout configurable.  
> **Fuera de alcance:** Redis multi-worker para waiters; reactivar `menu_subagent`; reutilizar el SSE `menu_import.quiz` como transporte (se inspira en la UI, pero el contrato es nuevo).
>
> **Verificación:** la suite backend relevante pasó (36 tests). Se confirmó por código el contrato SSE/API, el desbloqueo del waiter, timeout/cierre y la UI de `Other` + multi-select. No se ejecutó un smoke E2E en navegador contra un backend real; el registry continúa siendo in-process, como se definió para este MVP.

---

## 1. Objetivo

Permitir que el **Orchestrator** haga una pregunta estructurada al usuario **en medio del turno**, bloquee el runtime hasta la respuesta, y luego continúe el mismo stream SSE. Los subagentes no bloquean: reportan `needs_user_input` y el Orchestrator decide si llamar `clarify`.

Comportamientos acordados:

| Decisión | Elección |
|----------|----------|
| Entrega de respuesta | Endpoint dedicado mientras el SSE del chat sigue abierto |
| Opción “Otro…” | Siempre se añade en UI cuando hay `choices` |
| Multi-select | Sí (`multi_select`) |
| Timeout | Tool regresa error al LLM; UI se cierra; el turno puede continuar |
| Timeout default | `288` segundos (`assistant_clarify_timeout_seconds`) |
| Wait storage | Registry in-process + `asyncio.Future` |

---

## 2. Contexto actual

- Chat: un `POST .../assistant/chat` abre SSE hasta `message.complete`; `content.delta` pinta texto en vivo.
- Orchestrator hoy solo expone `delegate_task`.
- Subagentes (`catalog_agent`, `operations_agent`) tienen tools de skills; no heredan tools del Orchestrator automáticamente.
- Existe UI/patrón de quiz de menu-import (`menu_import.quiz` + siguiente mensaje), pero el orchestrator actual **no** lo emite; no sirve como bloqueo mid-turn.

---

## 3. Arquitectura

```text
Owner chat POST (SSE open)
  └─ Orchestrator / Subagent calls clarify
        ├─ emit agent.clarify (+ awaiting_input)
        ├─ register Future(conversation_id, clarify_id)
        ├─ await wait_for(Future, timeout=288s)
        │     └─ parallel: POST .../clarify/answer → resolve Future
        ├─ tool returns JSON to LLM
        └─ same SSE continues → more deltas → message.complete
```

### 3.1 Componentes

| Unidad | Responsabilidad |
|--------|-----------------|
| `clarify` FunctionTool | Validar args, emitir SSE, bloquear, devolver JSON |
| `ClarifyWaitRegistry` | Crear/resolver/cancelar Futures por `(conversation_id, clarify_id)` |
| Answer API | Autenticado; resuelve Future pendiente |
| Frontend `AssistantClarifyPrompt` | Render Q&A; deshabilita composer; POST answer |
| Settings | `assistant_clarify_timeout_seconds: int = 288` |

### 3.2 Solo el Orchestrator tiene `clarify`

- `build_orchestrator_agent(tools=[delegate_task, clarify])`
- Subagentes **no** reciben `clarify` (no `extra_tools=[clarify]`).
- Si un subagente no puede inferir una decisión del usuario, regresa `ExecutionRecord` con `notes` que incluyen `needs_user_input:…`; el Orchestrator llama `clarify` y, si hace falta, vuelve a `delegate_task` con la respuesta.

---

## 4. Contrato de la tool

**Nombre:** `clarify`

**Parámetros:**

- `question` (string, required) — solo la pregunta; **no** enumerar opciones en el texto.
- `choices` (string[], max 4, optional) — opciones seleccionables.
- `multi_select` (bool, default false) — solo relevante si hay `choices`.

**Normalización de choices:** aplanar dicts LLM (`label` → `description` → `text` → `title`); trim; drop vacíos; cap 4; lista vacía → open-ended (`choices=null`).

**Retorno al LLM (JSON string):**

Éxito:

```json
{
  "ok": true,
  "question": "...",
  "choices_offered": ["a", "b"] | null,
  "multi_select": false,
  "user_response": "a" | ["a", "b"] | "texto libre"
}
```

Timeout / fallo:

```json
{
  "ok": false,
  "error": "timeout" | "clarify_unavailable" | "...",
  "question": "..."
}
```

---

## 5. SSE y API

### 5.1 Eventos SSE

**`agent.clarify`**

```json
{
  "clarify_id": "uuid",
  "conversation_id": "uuid",
  "question": "...",
  "choices": ["..."] | null,
  "multi_select": false,
  "allow_other": true,
  "timeout_seconds": 288
}
```

**`agent.status`:** `awaiting_input` al empezar la espera; heartbeats periódicos (~15s) mientras espera; al resolver/timeout volver a estado coherente (`processing` / fin natural del turno).

Opcional: `agent.clarify_closed` con `{ clarify_id, reason: "answered" | "timeout" | "cancelled" }` para que el frontend cierre la UI de forma determinista.

### 5.2 Endpoint de respuesta

`POST /restaurants/{restaurant_id}/assistant/clarify/answer`

Body:

```json
{
  "conversation_id": "uuid",
  "clarify_id": "uuid",
  "user_response": "string" | ["string", ...]
}
```

Reglas:

- Ownership igual que chat.
- `clarify_id` desconocido / ya resuelto → `404` / `409`.
- Un solo clarify pendiente por `conversation_id` (si llega otro `clarify` antes de resolver, cancelar el anterior con error al LLM del primer waiter, o rechazar el nuevo — **decisión: un pending a la vez; el nuevo cancela el anterior con `error=superseded`**).

---

## 6. Frontend

- Handler en `streamAssistantChat` para `agent.clarify` / cierre.
- Componente nuevo (inspirado en `MenuImportQuiz`, no acoplado a menu-import): radio / checkboxes / open-ended + “Otro (escribe tu respuesta)”.
- Mientras hay pending clarify: composer del chat deshabilitado; solo la UI de clarify acepta input (aunque el stream “busy” siga abierto).
- Copy en español.
- Al timeout/cierre: quitar prompt y mostrar aviso breve.

Detalle visual fino: aplicar skill `ui-ux-pro-max` solo al implementar el componente.

---

## 7. Prompts

Añadir a instrucciones del Orchestrator:

- Solo el Orchestrator tiene `clarify`.
- Si el subagente reporta `needs_user_input:…`, llamar `clarify` y continuar.
- Opciones solo en `choices`; preferir default en decisiones de bajo riesgo.

Subagentes: sin `clarify`; reportar `needs_user_input:` en `notes`.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Proxy corta SSE idle en ~288s | Heartbeats `agent.status` |
| Reinicio de proceso pierde Future | Documentado; MVP in-process; futuro Redis si hay multi-worker |
| UoW/DB session abierta durante wait | No hacer trabajo DB en el waiter; tools de skills ya usan UoW aislado |
| Nested clarify en subagente | No aplica — solo Orchestrator tiene `clarify` |

---

## 9. Testing

- Unit: flatten choices, validation, timeout JSON, supersede.
- Tool + registry: answer endpoint resuelve Future; timeout limpia registry.
- Wiring: Orchestrator / catalog / operations incluyen `clarify`.
- Frontend: (smoke o unit del mapper SSE) pending state deshabilita composer.

---

## 10. Criterios de éxito

1. El Orchestrator puede llamar `clarify` y el usuario ve la UI sin cerrar el stream.
2. Responder vía endpoint desbloquea el tool y el agente continúa en el mismo turno.
3. Sin respuesta a los 288s: tool recibe timeout; UI se cierra; no se tumba el proceso.
4. `choices` + “Otro…” + `multi_select` funcionan según el contrato.

---

## 11. Nota de despliegue

El `ClarifyWaitRegistry` es un singleton **in-process** (un `dict` de `asyncio.Future` en memoria del worker). Esto implica dos restricciones operativas mientras no se migre a un backend compartido (p. ej. Redis, fuera de alcance de este MVP):

- **Una sola instancia, o session affinity.** Si el servicio corre con más de un worker/proceso (Cloud Run con `concurrency` bajo pero múltiples instancias, o múltiples réplicas), el POST a `.../assistant/clarify/answer` debe llegar al **mismo proceso** que registró el `Future` — de lo contrario el registry no encuentra el `clarify_id` pendiente y la respuesta del usuario no desbloquea el tool. Configurar afinidad de sesión (sticky sessions) a nivel de load balancer, o restringir a una sola instancia (`min-instances=1`, `max-instances=1`) hasta que exista un registry distribuido.
- **Timeout del request/proxy > `assistant_clarify_timeout_seconds`.** El tool bloquea hasta `288` segundos (configurable) esperando la respuesta. Cualquier timeout de request, proxy o load balancer delante del stream SSE (Cloud Run request timeout, timeouts de Nginx/Cloudflare, etc.) debe ser **mayor** que `assistant_clarify_timeout_seconds`; de lo contrario el stream se corta antes de que el tool complete su propio timeout interno y el usuario pierde la respuesta ya enviada.

No se requiere ningún cambio a los scripts de despliegue de Cloud Run para el MVP; esta sección es solo una nota operativa a tener en cuenta si se ajustan esos scripts o el número de instancias en el futuro.
