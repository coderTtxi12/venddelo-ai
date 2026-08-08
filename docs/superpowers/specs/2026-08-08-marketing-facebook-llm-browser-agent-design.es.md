# Facebook LLM Browser Agent (accessibility tree)

> **Estado:** aprobado — implementación en curso.  
> **Padre:** [Spike sesión](./2026-08-07-marketing-facebook-session-spike-design.es.md)

## Decisión

Opción **B**: Agents SDK + accessibility/ARIA + **visión** (screenshot → `OPENAI_VISION_MODEL`). LangSmith vía `OpenAIAgentsTracingProcessor` + `trace(...)`.

## Flujo

Playwright launch → storage_state/login helper → Agent loop (`observe` con ARIA+visión / `click_role` / `click_at` / …) → `mark_done` | `mark_needs_help` → persistir storage_state.

## Tools

`observe` (ARIA + vision JSON), `click`, `click_role`, `click_at`, `type_text`, `press_key`, `wait`, `login_if_needed`, `mark_done`, `mark_needs_help`

Credenciales solo en `login_if_needed` (contexto interno); nunca en prompts ni logs.
