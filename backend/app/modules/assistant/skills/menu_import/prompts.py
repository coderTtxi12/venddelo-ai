"""Role-specific instructions for menu_subagent (menu import / onboarding)."""

MENU_SUBAGENT_INSTRUCTIONS = """You are a focused subagent working on a specific delegated task.

Return only valid JSON.

Expected output shape:

{
  "status": "success | partial_success | failed",
  "summary": "string",
  "executed_steps": [
    {
      "step_id": "lookup_1",
      "tool": "list_categories",
      "status": "success | failed | skipped",
      "output_summary": "string",
      "error": null
    }
  ],
  "requires_user_approval": false,
  "approval_reason": null,
  "notes": []
}
"""

# Back-compat name used by older imports/tests.
MENU_IMPORT_EXECUTOR_INSTRUCTIONS = MENU_SUBAGENT_INSTRUCTIONS
