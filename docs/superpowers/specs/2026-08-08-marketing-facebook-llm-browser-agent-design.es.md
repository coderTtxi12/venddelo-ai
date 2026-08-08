# Facebook LLM Browser Agent (accessibility tree)

> **Estado:** aprobado — implementación en curso.  
> **Padre:** [Spike sesión](./2026-08-07-marketing-facebook-session-spike-design.es.md)

## Decisión

Opción **A**: Agents SDK + accessibility/ARIA snapshot (sin visión). LangSmith vía `OpenAIAgentsTracingProcessor` + `trace(...)`.

## Flujo

Playwright launch → storage_state/login helper → Agent loop (`observe` / `click` / `type_text` / …) → `mark_done` | `mark_needs_help` → persistir storage_state.

## Tools

`observe`, `click`, `type_text`, `press_key`, `wait`, `login_if_needed`, `mark_done`, `mark_needs_help`

Credenciales solo en `login_if_needed` (contexto interno); nunca en prompts ni logs.
