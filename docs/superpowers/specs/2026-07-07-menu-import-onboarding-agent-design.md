# Menu import onboarding agent (agent-as-tool)

## Goal

Expose `run_menu_import_onboarding` to the main workflow executor as a single
agent-as-tool that runs the full menu digitization concierge: OCR uploaded menu,
compare against cached live menu snapshot in Postgres, ask **all** clarification
questions in one batch (especially complements), then apply the full menu via
existing `apply_full_import` (MenuService).

## Architecture

- **Main executor** calls one tool: `run_menu_import_onboarding`.
- **Sub-agent** (`MenuImportOnboardingAgent`) runs with internal `menu_import`
  skill tools + structured output; uses `Agent.as_tool()`.
- **Memory**: extend `assistant_menu_import_sessions` with
  `live_menu_snapshot` and `reconciliation_snapshot` JSONB — avoid re-scanning
  live menu on every turn.
- **Prices**: draft/preview in MXN; apply converts to centavos (unchanged).
- **Fidelity**: never invent names, descriptions, or prices from OCR draft.

## Phases

1. Session start / resume (`get_import_session`)
2. Register sources + OCR (`register_menu_source_file`, `start_menu_extraction_batch`)
3. Analyze vs live (`analyze_import_vs_live`) — cache snapshots, merge complement questions
4. Batch questions → owner answers (`save_clarification_answers` once)
5. Optimize + preview (`optimize_import_draft`, `preview_full_import`)
6. Apply all (`apply_full_import` with `confirmed=true`)

## Out of scope (this iteration)

- Rewriting apply to use `menu_write` tools (owner chose MenuService path)
- Background workers for OCR
- Replacing all 13 granular tools in docs — they remain for sub-agent internals
