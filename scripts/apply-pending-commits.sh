#!/usr/bin/env bash
# Apply pending working-tree changes as conventional commits.
# Format: docs/COMMIT_FORMAT.md  (type: subject + bullet body, no scope)
# Usage:  bash scripts/apply-pending-commits.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# $1 = subject line   $2 = bullet body (newline-separated, no blank lines between bullets)
cm() { git commit -m "$1" -m "$2"; }

# ── Product status column ─────────────────────────────────────────────

git add docs/superpowers/specs/2026-07-07-product-status-column-design.md
cm "docs: add product status column design spec" \
"- Replace approval_status, is_published, and is_active with a single status field
- Define active, inactive, and draft semantics for public menu and ordering
- Document migration mapping from legacy publish and approval flags"

git add docs/superpowers/plans/2026-07-07-product-status-column.md
cm "docs: add product status implementation plan" \
"- Outline migration, schema, API, and assistant tool rollout steps
- Capture frontend visibility and orderability updates required by the change"

git add backend/app/modules/menu/product_status.py
cm "feat: add product status visibility helpers" \
"- Introduce active, inactive, and draft literals with validation set
- Map legacy publish and approval flags to the unified status column
- Expose is_public_menu_listed and is_orderable predicates for callers"

git add backend/migrations/versions/0037_product_status_column.py
cm "feat: migrate products to unified status column" \
"- Add status column with check constraint and restaurant index
- Backfill active, inactive, and draft from legacy publish flags
- Drop approval_status, is_published, is_active, and deleted_at columns
- BREAKING CHANGE: products now use status; legacy publish columns are removed"

git add backend/app/db/models/menu.py backend/app/modules/menu/schemas.py
cm "feat: unify product status on model and DTOs" \
"- Store status on Product ORM model with allowed-value constraint
- Remove approval_status, is_published, and is_active from create/update schemas
- Expose ProductStatus literal on menu API schemas"

git add backend/app/modules/menu/adapters.py
cm "refactor: query products by unified status in repository" \
"- Filter public menus to active and inactive statuses instead of publish flags
- Sort owner listings with active products first
- Soft-delete products by moving status back to draft"

git add backend/app/modules/menu/service.py backend/app/modules/menu/api.py
cm "refactor: drop approval and publish product endpoints" \
"- Remove set_approval and publish helpers superseded by status updates
- Allow delete_product to target draft and inactive rows via get_product_by_id
- Delete REST /approval and /publish routes from the menu API"

git add backend/app/modules/orders/service.py backend/app/modules/public/api.py backend/scripts/seed.py
cm "refactor: gate ordering on active product status" \
"- Restrict customer ordering to active status instead of publish flags
- Filter live public menu payloads to active and inactive products
- Seed sample products with the unified status column"

git add backend/tests/modules/test_product_status_migration.py
cm "test: cover product status migration paths" \
"- Assert legacy publish combinations map to active, inactive, and draft
- Verify status constraint and index exist after upgrade"

git add backend/tests/services/test_menu_service.py backend/tests/modules/test_menu_repo.py backend/tests/test_models.py backend/tests/test_menu_cache.py
cm "test: update menu tests for product status column" \
"- Assert create and update flows persist status instead of publish flags
- Adjust repository listing and soft-delete expectations for draft semantics
- Refresh model and cache tests for the new products.status column"

git add backend/tests/services/test_translation_service.py backend/tests/api/test_public_live_menu_order.py backend/tests/api/test_order_kitchen_status.py backend/tests/api/test_orders_realtime_publish.py
cm "test: align order flows with product status filtering" \
"- Update translation fixtures for status-backed product payloads
- Verify public live menu and kitchen order tests use active-only orderability"

# ── Skills runtime context ───────────────────────────────────────────

git add backend/app/modules/assistant/skills/context.py backend/app/modules/assistant/skills/base.py
cm "refactor: move AgentContext into skills package" \
"- Relocate AgentContext from agent package to skills.context
- Add commit_agent_mutation so tool mutations persist before SSE teardown
- Point SkillPort protocol imports at the shared skills context module"

git add backend/app/modules/assistant/skills/registry.py
cm "refactor: resolve entitled tools by name for SDK handlers" \
"- Replace system_prompt_sections with resolve_tool lookup helper
- Keep delete-tool guardrails and entitlement checks unchanged"

# ── OpenAI Agents SDK workflow ────────────────────────────────────────

git add backend/requirements.txt backend/.env.example backend/.env.docker.example backend/app/core/config.py
cm "chore: add OpenAI Agents SDK and bump default model" \
"- Pin openai-agents and langsmith openai-agents tracing extras
- Switch default OPENAI_MODEL to gpt-5-nano-2025-08-07 in config and env samples
- Document LangSmith tracing setup for the Agents SDK runtime"

git add backend/app/core/llm/ports.py backend/app/infra/llm/tracing.py
cm "feat: extend SSE events for Agents SDK workflow" \
"- Add agent.step and agent.evaluation stream event names
- Clear LangSmith env cache after configure_langsmith_env updates os.environ"

git add backend/app/modules/assistant/agent/workflow/
cm "feat: add OpenAI Agents workflow orchestration package" \
"- Introduce workflow schemas, agents, prompts, SSE mapping, and tool catalog
- Load restaurant context and entitled tools for each agent turn
- Stream phased workflow telemetry alongside tool execution events"

git add backend/app/modules/assistant/agent/__init__.py backend/app/modules/assistant/agent/run_context.py backend/app/modules/assistant/agent/service.py backend/app/modules/assistant/agent/tools.py backend/app/modules/assistant/agent/tool_schema.py backend/app/modules/assistant/agent/tracing.py backend/app/modules/assistant/conversation_store.py
cm "feat: add agent service layer for SDK tool execution" \
"- Wire AssistantAgentService to workflow orchestrator and conversation store
- Build OpenAI function schemas from entitled skill tools
- Wrap Agents SDK runs with LangSmith tracing and run-scoped context"

git add backend/app/modules/assistant/agent/prompt_composer.py
cm "refactor: disable eager skill catalog in system prompt" \
"- Remove active-skills section from compose_system_prompt for now
- Leave hook commented for future load_skill on-demand guide integration"

git add backend/docs/assistant-load-skill-integration.md
cm "docs: document load_skill integration plan" \
"- Describe how on-demand SKILL.md guides should attach to SDK agents
- Capture temporary prompt-composer changes and re-enable checklist"

git add -u \
  backend/app/modules/assistant/agent/orchestrator.py \
  backend/app/modules/assistant/agent/response_format.py \
  backend/app/modules/assistant/agent/activity_emit.py \
  backend/app/modules/assistant/agent/lane_queue.py \
  backend/app/modules/assistant/agent/context.py \
  backend/app/modules/assistant/conversation_service.py \
  backend/app/modules/assistant/conversation_cache.py \
  backend/app/modules/assistant/chat_attachments.py \
  backend/app/modules/assistant/service.py \
  backend/app/modules/assistant/usage/
cm "remove: drop legacy orchestrator and usage stack" \
"- Delete hand-rolled orchestrator, response_format, and lane queue runtime
- Remove conversation CRUD service, Redis cache, and chat attachment helpers
- Retire assistant usage metering adapters no longer used by the agent API"

git add backend/app/modules/assistant/api.py backend/app/modules/assistant/schemas.py backend/app/db/uow.py
cm "refactor: expose single agent chat SSE endpoint" \
"- Replace profile, conversation, usage, and asset routes with stream_chat handler
- Simplify AssistantChatRequest schema for message plus optional conversation_id
- Trim UnitOfWork assistant repositories to conversation persistence only
- BREAKING CHANGE: assistant profile, conversation CRUD, and usage API routes removed"

git add backend/app/modules/assistant/import_assets.py backend/tests/modules/test_assistant_import_assets.py
cm "refactor: decouple import assets from chat attachments" \
"- Keep menu_source and product_photo validation for skill-driven uploads
- Remove chat attachment path coupling from import asset tests"

git add \
  backend/tests/modules/test_assistant_workflow_context_loader.py \
  backend/tests/modules/test_assistant_workflow_orchestrator.py \
  backend/tests/modules/test_assistant_workflow_tool_catalog.py \
  backend/tests/modules/test_assistant_agent_service.py \
  backend/tests/modules/test_assistant_agent_tracing.py \
  backend/tests/modules/test_assistant_tool_schema.py \
  backend/tests/api/test_assistant_agent_chat_api.py \
  backend/tests/conftest.py
cm "test: add workflow orchestrator and chat API coverage" \
"- Cover context loader, tool catalog, orchestrator, service, and tracing units
- Add SSE chat API test for the new agent endpoint
- Extend conftest fixtures for agent workflow test runs"

git add -u \
  backend/tests/modules/test_activity_emit.py \
  backend/tests/modules/test_agent_orchestrator.py \
  backend/tests/modules/test_agent_response_format.py \
  backend/tests/modules/test_assistant_chat_attachments.py \
  backend/tests/modules/test_assistant_profile.py \
  backend/tests/modules/test_assistant_service_compression.py \
  backend/tests/modules/test_assistant_usage.py \
  backend/tests/modules/test_context_compressor.py \
  backend/tests/modules/test_prompt_composer.py \
  backend/tests/services/test_assistant_service.py \
  backend/tests/api/test_assistant_conversations_api.py \
  backend/tests/api/test_assistant_menu_read_api.py \
  backend/tests/api/test_assistant_profile_api.py \
  backend/tests/api/test_assistant_usage_api.py
cm "remove: drop legacy assistant orchestrator test suites" \
"- Delete tests for removed conversation cache, usage recorder, and JSON orchestrator
- Remove API coverage for retired profile, conversation, and usage endpoints"

git add backend/tests/modules/test_assistant_skill_registry.py backend/tests/api/test_api_v1.py
cm "test: update registry and API smoke tests" \
"- Assert skill registry resolve_tool behavior replaces prompt section loader
- Adjust API v1 smoke expectations for simplified assistant routes"

# ── menu_read ─────────────────────────────────────────────────────────

git add backend/app/modules/assistant/skills/menu_read/search.py backend/app/modules/assistant/skills/menu_read/tools.py backend/app/modules/assistant/skills/menu_read/SKILL.md
cm "feat: add bulk_get_products for multi-product audits" \
"- Fetch many products by id or name in one call with promotion context attached
- Import AgentContext from skills package and document bulk read workflow in SKILL.md
- Extend search helpers used by bulk resolution and fuzzy name matching"

git add backend/tests/modules/test_menu_read_search.py backend/tests/modules/test_menu_read_tools.py
cm "test: cover bulk_get_products and status-aware reads" \
"- Add bulk lookup, deduplication, and limit validation tests
- Refresh list and get product tests for unified status payloads"

# ── menu_write ────────────────────────────────────────────────────────

git add \
  backend/app/modules/assistant/skills/menu_write/tools.py \
  backend/app/modules/assistant/skills/menu_write/bulk.py \
  backend/app/modules/assistant/skills/menu_write/category_bulk.py \
  backend/app/modules/assistant/skills/menu_write/option_item_bulk.py \
  backend/app/modules/assistant/skills/menu_write/product_photos.py \
  backend/app/modules/assistant/skills/menu_write/theme_tools.py \
  backend/app/modules/assistant/skills/menu_write/SKILL.md
cm "refactor: migrate product tools to status column" \
"- Replace is_published, is_active, and approval_status tool fields with status
- Auto-resolve option group_id in bulk complement updates when omitted
- Import AgentContext from skills package and refresh SKILL.md guidance"

git add backend/tests/modules/test_menu_write_tools.py backend/tests/modules/test_menu_write_product_photos.py
cm "test: update tool tests for status-based mutations" \
"- Assert create and update tools accept active, inactive, and draft status values
- Refresh photo assignment tests for skills AgentContext import path"

# ── menu_import ───────────────────────────────────────────────────────

git add \
  backend/app/modules/assistant/skills/menu_import/apply_batch.py \
  backend/app/modules/assistant/skills/menu_import/tools.py \
  backend/app/modules/assistant/skills/menu_import/description_enhance.py \
  backend/app/modules/assistant/skills/menu_import/SKILL.md
cm "refactor: publish imports with status and immediate commits" \
"- Set imported products to active or inactive status instead of publish flags
- Commit agent mutations after batch apply so SSE teardown does not roll back
- Simplify update_menu_knowledge to finalize session notes without profile writes"

git add \
  backend/tests/modules/test_menu_import_apply.py \
  backend/tests/modules/test_menu_import_tools.py \
  backend/tests/modules/test_menu_import_reconcile.py \
  backend/tests/modules/test_menu_import_e2e_stub.py \
  backend/tests/modules/test_menu_import_photos.py
cm "test: align import suites with status and skills context" \
"- Refresh apply, reconcile, tools, e2e stub, and photo tests for new imports
- Keep concierge one-shot import expectations after AgentContext package move"

# ── Other skills ──────────────────────────────────────────────────────

git add \
  backend/app/modules/assistant/skills/menu_best_practices/tools.py \
  backend/app/modules/assistant/skills/menu_media/tools.py \
  backend/app/modules/assistant/skills/menu_media/product_context.py \
  backend/app/modules/assistant/skills/promotions/tools.py \
  backend/app/modules/assistant/skills/promotions/banner_generate.py \
  backend/app/modules/assistant/skills/product_resolve.py
cm "refactor: point remaining tools at skills context" \
"- Import AgentContext from skills.context across media, promotions, and resolver tools
- Align product_resolve lookups with status-backed menu product records"

git add \
  backend/app/modules/assistant/skills/menu_intelligence/tools.py \
  backend/app/modules/assistant/skills/menu_intelligence/catalog_hints.py \
  backend/app/modules/assistant/skills/menu_intelligence/prompts.py \
  backend/app/modules/assistant/skills/menu_intelligence/SKILL.md
cm "refactor: remove suggest_complements tool" \
"- Drop complement suggestion LLM flow superseded by menu_write bulk tooling
- Trim catalog hint helpers and prompts tied to the removed tool
- Update SKILL.md to reflect the narrower intelligence surface"

git add \
  backend/tests/modules/test_menu_intelligence_tools.py \
  backend/tests/modules/test_menu_media_tools.py \
  backend/tests/modules/test_product_resolve.py \
  backend/tests/modules/test_promotions_tools.py \
  backend/tests/modules/test_promotion_option_item_sync.py \
  backend/tests/modules/test_promotion_pricing.py
cm "test: refresh intelligence media and promotion test suites" \
"- Update menu_intelligence tests after suggest_complements removal
- Align promotion, media, and product_resolve tests with skills context imports"

git add -u backend/tests/modules/test_menu_intelligence_prompts.py
cm "remove: drop menu_intelligence complement prompt tests" \
"- Delete tests for removed suggest_complements prompt builders"

# ── Frontend ──────────────────────────────────────────────────────────

git add frontend/src/lib/assistant/workflowTelemetry.ts frontend/src/components/assistant/AssistantWorkflowTelemetry.tsx frontend/src/components/assistant/AssistantWorkflowTelemetry.module.css
cm "feat: add assistant workflow telemetry panel" \
"- Define workflow phase and step status types shared by the chat UI
- Render phased agent progress alongside streamed assistant replies"

git add frontend/src/lib/api/assistant.ts frontend/src/components/assistant/ChatStreamProcessing.tsx frontend/src/components/assistant/ChatStreamProcessing.module.css
cm "refactor: stream agent chat without conversations CRUD" \
"- Replace profile and conversation REST helpers with single SSE chat client
- Parse workflow step events from the simplified assistant stream payload"

git add frontend/src/components/assistant/AssistantChatPanel.tsx frontend/src/components/assistant/AssistantChatPanel.module.css
git add -u frontend/src/components/assistant/AssistantConversationList.tsx frontend/src/components/assistant/AssistantConversationList.module.css
cm "refactor: replace conversation list with workflow chat panel" \
"- Simplify AssistantChatPanel around single-thread agent streaming
- Remove sidebar conversation list and attachment-heavy legacy chat chrome
- Surface workflow telemetry and markdown replies in the docked panel"

git add \
  frontend/src/lib/api/types.ts \
  frontend/src/lib/api/mappers.ts \
  frontend/src/lib/api/menu.ts \
  frontend/src/lib/menu/productVisibility.ts \
  frontend/src/lib/digital-menu/orderableProducts.ts \
  frontend/src/components/digital-menu/DigitalMenuProductDetail.tsx \
  frontend/src/components/digital-menu/menuProductUi.tsx \
  frontend/src/components/pages/ProductsPage.tsx \
  frontend/src/components/pages/MarketingPage.tsx \
  frontend/src/services/db/supplierCatalogTypes.ts \
  frontend/src/services/db/supplierProducts.ts \
  frontend/src/services/db/index.ts
cm "refactor: use product status for visibility and ordering" \
"- Map API product.status through menu mappers and owner product pages
- Gate digital menu orderability on active status instead of publish flags
- Drop legacy is_published and approval fields from supplier catalog types"

echo "Done. Remaining:"
git status --short
