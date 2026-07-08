# Menu import onboarding agent — implementation plan

## Done in this branch

1. Migration `0038` — `live_menu_snapshot`, `reconciliation_snapshot` on sessions
2. `live_menu_cache.py` — compact live menu snapshot
3. `complement_questions.py` — batch complement / live conflict questions
4. `analyze_import_vs_live` tool — cache + reconcile + merge questions
5. `onboarding_agent.py` — sub-agent + `run_menu_import_onboarding` via `Agent.as_tool()`
6. Executor wiring — granular `menu_import` hidden; onboarding tool exposed
7. `SKILL.md` + planner `tool_catalog` updated

## Verify

```bash
cd backend && .venv/bin/pytest tests/modules/test_menu_import_*.py tests/modules/test_assistant_workflow_tool_catalog.py -q
```
