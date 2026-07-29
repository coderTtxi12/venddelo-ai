# Assistant Agents SDK — `store=false` + encrypted reasoning

> **Estado:** aprobado — implementación en curso.  
> **Alcance:** configurar todos los Agents SDK del assistant con `store=False` y pedir `reasoning.encrypted_content` para que el tool loop del mismo `Runner` reenvíe el reasoning cifrado.  
> **Fuera de alcance:** persistir `encrypted_content` entre mensajes de chat; pasar reasoning entre Orchestrator y subagents; cambios de UI.

## Decisiones

| Tema | Decisión |
|------|----------|
| Approach | Centralizar en `build_assistant_model_settings` |
| Scope de reenvío | Solo dentro del mismo `Runner` (opción A) |
| API include | `response_include=["reasoning.encrypted_content"]` (no `extra_body`) |

## Cambio

En `backend/app/modules/assistant/agent/model_settings.py`:

```python
ModelSettings(
    store=False,
    response_include=["reasoning.encrypted_content"],
    reasoning=Reasoning(
        effort=settings.openai_reasoning_effort,
        summary=settings.openai_reasoning_summary,
    ),
)
```

Consumidores (sin cambios de factory): Orchestrator, `restaurant_ops_subagent`, `menu_subagent`.

## Tests

Actualizar `test_assistant_model_settings.py`:
- `store is False`
- `response_include == ["reasoning.encrypted_content"]`
- reasoning effort/summary sin cambio de contrato

## Criterio de éxito

Con reasoning models (`gpt-5-mini`, etc.) y tool loops multi-turn, no aparece el 404 *Item … not found … store is set to false*; el SDK reenvía el último `encrypted_content` entre turns internos.
