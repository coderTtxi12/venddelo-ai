# Assistant — parallel `delegate_task` with `tasks[]`

> **Estado:** aprobado — implementación en curso.  
> **Alcance:** schema `tasks[]` + `context`; N child agents en paralelo (`asyncio` + semaphore); resultado consolidado; parallel tool calls en prompts/settings.  
> **Fuera de alcance:** thread pools; mezclar menu+ops en un solo call; persistir encrypted entre mensajes de chat.

## Schema

`delegate_task(subagent, context?, tasks[{goal, context?}])` — ver diseño aprobado en sesión.

## Runtime

- 1 child Agent por task; mismo `subagent` enum para todos los hijos del call.
- `asyncio.gather` + `Semaphore(MAX_CONCURRENT_CHILDREN=3)`.
- Contar **1** hacia `MAX_DELEGATIONS_PER_TURN` **por child**.
- Tool result consolidado: `{ ok, subagent, results: [{goal, ok, execution}], public_menu_url?, pending_quiz_count? }`.

## Parallel guidance

- Orchestrator + subagents: bloque “Parallel tool calls” en prompts.
- `ModelSettings.parallel_tool_calls=True`.

## Files

`delegate.py`, `context_loader.py`, `prompts.py`, `model_settings.py`, `schemas.py`, tests.
