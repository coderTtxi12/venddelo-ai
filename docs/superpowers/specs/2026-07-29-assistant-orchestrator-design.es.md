# Asistente — Router → Orchestrator (paso 1)

> **Estado:** implementado (paso 1) — ver plan `docs/superpowers/plans/2026-07-29-assistant-orchestrator.md`.  
> **Alcance:** convertir el pipeline `Router → Executor → Evaluator → Responder` en un **Orchestrator** con una sola tool `delegate_task` hacia subagents, y respuesta directa al usuario.  
> **Fuera de alcance:** rediseño de tools internas de skills, nuevos subagents, handoffs nativos del SDK, cambios profundos de frontend o de `ExecutionRecord`.

---

## 1. Objetivo

Simplificar el workflow del asistente agéntico:

1. El **Router** se convierte en **Orchestrator**.
2. El Orchestrator tiene **una sola tool**: `delegate_task`.
3. `delegate_task` ejecuta exactamente uno de:
   - `menu_subagent` (antes Menu Import Executor)
   - `restaurant_ops_subagent` (antes Executor)
4. El resultado de la delegación **vuelve al Orchestrator**.
5. Se eliminan el **Responder** y el **Evaluator** del workflow (y el **MenuImportResponder**).
6. El **Orchestrator responde directamente** al dueño.

Este es el **primer paso** de un cambio de arquitectura más amplio del AI agent; no reescribe skills ni el modelo de datos de import.

---

## 2. Decisiones de diseño (brainstorm)

| Tema | Decisión |
|------|----------|
| Approach | Orchestrator como único Agent con FunctionTool `delegate_task` (no handoffs SDK; no mini-router en Python) |
| Responders | Se eliminan **ambos**: workflow Responder y MenuImportResponder |
| Quiz menu import | Subagent devuelve `ExecutionRecord`; Orchestrator escribe el mensaje; **Python** emite `menu_import.quiz` desde la sesión/DB |
| Retries / evaluator | Sin Evaluator. El Orchestrator puede **re-llamar** `delegate_task` si el resultado no alcanza |
| Saludos / small talk | Orchestrator puede responder en texto libre **sin** llamar la tool |
| Contrato tool | Una tool `delegate_task(subagent, task)` con enum estricto de subagent |

---

## 3. Arquitectura

```text
Usuario
  │
  ▼
WorkflowOrchestrator (Python / SSE / persistencia)
  │
  ▼
Orchestrator Agent ── texto libre (Markdown ES) ──► content.delta → usuario
  │
  │  única tool: delegate_task(subagent, task)
  ▼
  ├─ restaurant_ops_subagent  → ExecutionRecord (JSON) → vuelve al Orchestrator
  └─ menu_subagent     → ExecutionRecord (JSON) → vuelve al Orchestrator
         │
         └─ (Python) quiz pendiente en sesión → menu_import.quiz SSE
```

### Antes → después

| Antes | Después |
|-------|---------|
| Router (`WorkflowRouteDecision`) | Orchestrator (texto libre + `delegate_task`) |
| Executor | `restaurant_ops_subagent` |
| MenuImportExecutor | `menu_subagent` |
| Evaluator + retries en Python | Re-delegación opcional via `delegate_task` |
| Responder / MenuImportResponder | Orchestrator escribe la respuesta al dueño |
| Rutas `executor \| responder \| menu_import` | Sin routing estructurado; decisión implícita al llamar o no la tool |

---

## 4. Componentes

### 4.1 Orchestrator Agent

- **Nombre:** `Orchestrator` (reemplaza `Router`).
- **Tools:** solo `delegate_task`.
- **Output:** texto libre en español (Markdown). Sin `output_type` Pydantic de routing.
- **Responsabilidades:**
  - Entender el mensaje del dueño y el contexto (historial, import session, skills).
  - Responder sin tool cuando no haga falta (saludos, small talk, fuera de operaciones).
  - Delegar a `restaurant_ops_subagent` para ops de menú/restaurante.
  - Delegar a `menu_subagent` solo cuando aplique onboarding/import (capability + intención o sesión activa).
  - Re-delegar si el `ExecutionRecord` es insuficiente.
  - Redactar la respuesta final **solo con hechos** del tool result / conversación (reglas migradas del Responder actual: sin UUIDs, centavos→MXN, antes→después en mutaciones, etc.).

### 4.2 Tool `delegate_task`

```text
delegate_task(
  subagent: "restaurant_ops_subagent" | "menu_subagent",
  task: str  # intención/goal en español para este turn del subagent
) -> str     # JSON de ExecutionRecord
```

Comportamiento en Python:

1. Validar `subagent`.
2. Si `menu_subagent` y menu import no está enabled / sin registry → devolver error claro en el tool result (el Orchestrator no inventa import).
3. Construir el agent correspondiente y correrlo con `Runner` (`max_turns` similares a hoy: ~12 ops, ~16 import).
4. Emitir eventos SSE de tools/fases del subagent mientras corre (`include_text_deltas=False` para el subagent).
5. Tomar `ExecutionRecord` final, rellenar `tools_used` si hace falta, limpiar approval gates (como hoy).
6. Devolver JSON serializado al Orchestrator.

El texto intermedio del subagent **no** se muestra al usuario.

### 4.3 `restaurant_ops_subagent`

- Renombre del Executor actual.
- Mismas tools de skills tituladas **excepto** menu_import granular.
- Sigue devolviendo `ExecutionRecord`.
- Instrucciones: plan/act/observe; **no** redactar respuesta al dueño; `summary`/`notes` para el Orchestrator.

### 4.4 `menu_subagent`

- Renombre del MenuImportExecutor.
- Tools internas de `menu_import`.
- Sigue devolviendo `ExecutionRecord`.
- Sin MenuImportResponder: el Orchestrator formula el mensaje al dueño.
- Tras delegación (o al cerrar el turn): Python lee la sesión activa; si hay quiz pendiente → emite `menu_import.quiz` (misma forma que hoy).
- Si hoy se inyectaba `public_menu_url` al MenuImportResponder, anexarlo al **tool result** de `delegate_task` tras `menu_subagent` cuando aplique la misma condición `should_inject_public_menu_url_for_responder` (el Orchestrator lo usa al redactar; no se inventa).

### 4.5 Eliminar

- `build_router_agent`, `build_evaluator_agent`, `build_responder_agent`
- `build_menu_import_responder_agent`
- Loop Python de evaluación + `MAX_EXECUTOR_RETRIES` basado en Evaluator
- Uso de `WorkflowRouteDecision` / `WorkflowEvaluation` en el happy path del chat
- Prompts `ROUTER_*`, `EVALUATOR_*`, `RESPONDER_*`, `MENU_IMPORT_RESPONDER_*` (reglas útiles del Responder migran al prompt del Orchestrator; reglas útiles del MenuImportResponder que no sean de quiz JSON migran también)

Schemas `ExecutionRecord` / `ExecutedStep` se **conservan**. `WorkflowRouteDecision` y `WorkflowEvaluation` se pueden eliminar o dejar solo si algún test/utilidad residual lo exige; preferencia: eliminar del path de chat y limpiar imports muertos.

---

## 5. Data flow por turn

1. Python carga `WorkflowContext` (historial, entitlements/skills, attachments, import session context) — igual en espíritu al `load_workflow_runtime` actual.
2. Se construye el Orchestrator + tool `delegate_task` cerrada sobre UoW/registry/contexto.
3. `Runner.run_streamed(Orchestrator, orchestrator_input(...))`.
4. Mientras corre:
   - Tool calls → ejecución de subagent + SSE de tools/fase `executing`.
   - Text deltas del Orchestrator → `content.delta`.
5. Si en el turn se usó `menu_subagent` (o hay sesión con quiz pendiente al final): emitir quiz SSE desde DB.
6. `message.complete` con `conversation_id` + `content` (+ bloque `menu_import.questions` si aplica, para parity con el cliente).
7. Persistencia del turno; para import, reutilizar `format_menu_import_assistant_turn_for_history` cuando haya questions.

### Fases SSE

| Antes | Después |
|-------|---------|
| `routing` | `orchestrating` |
| `executing` | `executing` (mientras corre un subagent) |
| `evaluating` | eliminado |
| `responding` | opcional / absorbido en `orchestrating` (el stream de contenido ya es la respuesta) |

Thoughts: dejar de parsear JSON `reason` del Router. Opcionalmente emitir thought corto al invocar `delegate_task` (p.ej. desde `task`) con `source="orchestrator"`.

---

## 6. Prompts

- **Idioma de system prompts:** inglés (convención del proyecto); respuesta al usuario en español.
- **Orchestrator:** síntesis de:
  - Cuándo responder sin tool vs delegar.
  - Cuándo elegir `restaurant_ops_subagent` vs `menu_subagent` (misma lógica de negocio que el Router actual + atención a sesión de import / aclaraciones).
  - Reglas de redacción del Responder (hechos only, sin IDs técnicos, MXN, mutaciones antes→después, tono).
  - Cómo usar el JSON de `ExecutionRecord` (status, summary, notes) y cuándo re-delegar.
- **restaurant_ops_subagent:** basado en `EXECUTOR_INSTRUCTIONS`, sin referencias al Responder/Evaluator.
- **menu_subagent:** basado en `MENU_IMPORT_EXECUTOR_INSTRUCTIONS`, summary orientado al Orchestrator (no al Responder).

Input del Orchestrator: conversación + mensaje + capabilities + import session context + (si aplica) pending quiz summary — **sin** route decision previa. La URL pública del menú, cuando aplique, llega vía tool result de import (§4.4), no como requisito del input inicial.

---

## 7. Límites y errores

- `ORCHESTRATOR_MAX_TURNS = 8` (incluye tool calls + respuesta).
- `MAX_DELEGATIONS_PER_TURN = 3` (documentado en prompt; la tool rechaza un 4.º call en el mismo turn con error claro).
- Subagent `status=failed` / tool error → el Orchestrator explica o re-delega; no silenciar.
- Si el Orchestrator termina sin texto usable → fallback corto en Python (mensaje genérico); **no** reintroducir Responder.
- Menu import no disponible → error de tool; Orchestrator informa que no puede importar en este momento.

---

## 8. Archivos principales a tocar

- `backend/app/modules/assistant/agent/workflow/orchestrator.py`
- `backend/app/modules/assistant/agent/workflow/agents.py`
- `backend/app/modules/assistant/agent/workflow/prompts.py`
- `backend/app/modules/assistant/agent/workflow/schemas.py`
- `backend/app/modules/assistant/agent/workflow/context_loader.py`
- `backend/app/modules/assistant/agent/workflow/sse.py`
- `backend/app/modules/assistant/agent/workflow/stream_mapping.py`
- `backend/app/modules/assistant/agent/tools.py` (si aplica wiring)
- `backend/app/modules/assistant/skills/menu_import/onboarding_agent.py`
- `backend/app/modules/assistant/skills/menu_import/prompts.py`
- Tests del workflow / assistant que asuman Router/Evaluator/Responder o fases antiguas

---

## 9. Testing

1. **Unit:** args/enum de `delegate_task`; builders renombrados; prompts sin router/evaluator/responder.
2. **Workflow (mocks de Runner):**
   - Reply-only (sin tool) → `content.delta` + complete.
   - Una delegación `restaurant_ops_subagent` → tool SSE + respuesta del Orchestrator.
   - Una delegación `menu_subagent` → tool SSE + respuesta + quiz SSE cuando la sesión tiene pending questions.
   - Re-delegación (segunda `delegate_task`) cuando el primer result es insuficiente.
3. Actualizar/eliminar tests de `WorkflowRouteDecision`, Evaluator adjust helpers en el path de chat, y mapping de router reason stream si dejan de usarse.

---

## 10. Criterios de éxito

- Un turn de chat ya no instancia Router, Evaluator ni Responder.
- El dueño recibe la respuesta desde el Orchestrator (stream).
- Ops e import siguen ejecutándose vía subagents con tools existentes.
- Quiz de menu import sigue llegando por SSE desde la sesión.
- No hay loop Evaluator; la calidad de “otro intento” depende de re-delegación del Orchestrator dentro de límites.

---

## 11. Pasos siguientes (fuera de este spec)

- Plan de implementación detallado (`writing-plans`).
- Iteraciones posteriores de arquitectura del AI agent (más subagents, skills, etc.) en specs aparte.
