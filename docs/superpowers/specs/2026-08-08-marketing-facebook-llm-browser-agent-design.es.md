# Facebook LLM Browser Agent (accessibility tree)

> **Estado:** aprobado — implementación en curso.  
> **Padre:** [Spike sesión](./2026-08-07-marketing-facebook-session-spike-design.es.md)

## Decisión

Opción **A**: Agents SDK + accessibility/ARIA tree (sin visión por ahora). LangSmith vía `OpenAIAgentsTracingProcessor` + `trace(...)`.

## Flujo

Playwright launch → storage_state/login helper → Agent loop (`observe` ARIA / `click_role` / …) → `mark_done` | `mark_needs_help` → persistir storage_state.

## Tools

`observe` (ARIA), `click`, `click_role`, `type_text`, `press_key`, `wait`, `login_if_needed`, `mark_done`, `mark_needs_help`

Credenciales solo en `login_if_needed` (contexto interno); nunca en prompts ni logs.

Visión queda fuera de alcance temporal (se puede volver a añadir después).
