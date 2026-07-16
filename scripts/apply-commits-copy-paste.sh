cd /Users/oliver/startup/venddelo-ai/venddelo-ai

git add backend/app/core/config.py
git commit -m "chore: remove menu import photo match confidence setting" -m "- Drop unused MENU_IMPORT_PHOTO_MATCH_THRESHOLD config after vision matching removal
- Keep menu import byte limits unchanged for source and photo uploads"

git add backend/app/modules/assistant/image_webp.py backend/requirements.txt
git commit -m "feat: add WebP conversion helper for assistant uploads" -m "- Convert raster chat attachment bytes to WebP before inbox storage
- Pin Pillow dependency for server-side image normalization"

git add \
  backend/app/modules/assistant/import_asset_paths.py \
  backend/tests/modules/test_import_asset_paths.py \
  backend/tests/modules/test_import_asset_branding_paths.py
git commit -m "feat: add import asset path helpers for inbox promotion" -m "- Centralize inbox, products, logo, and cover path rules for assistant uploads
- Promote inbox files into final restaurant asset folders on assign"

git add \
  backend/app/modules/assistant/import_assets.py \
  backend/app/modules/assistant/api.py \
  backend/app/modules/assistant/schemas.py \
  backend/tests/modules/test_assistant_import_assets.py \
  backend/tests/modules/test_assistant_chat_attachments.py \
  backend/tests/modules/test_assistant_chat_attachment_describer.py \
  backend/tests/api/test_assistant_agent_chat_api.py \
  frontend/src/lib/api/assistantImport.ts
git commit -m "refactor: migrate assistant import uploads to MIME-based inbox storage" -m "- Classify uploads as document or image without a kind query parameter
- Store images as WebP under import/inbox and keep PDF/DOCX documents unchanged
- Accept legacy menu_source and product_photo kinds in chat attachment schemas"

git add \
  backend/app/modules/assistant/skills/menu_import/session_handoff.py \
  backend/app/modules/assistant/skills/menu_import/tools.py \
  backend/app/modules/assistant/skills/menu_import/SKILL.md \
  backend/docs/menu-import-onboarding.md \
  backend/tests/modules/test_menu_import_session_handoff.py
git commit -m "refactor: recognize document attachments in menu import handoff" -m "- Treat inbox PDF/DOCX uploads as menu sources during import session bootstrap
- Validate registered source paths with menu import inbox path helpers"

git add \
  backend/migrations/versions/0045_restaurant_branch_count.py \
  backend/app/db/models/restaurant.py \
  backend/app/modules/restaurants/schemas.py \
  backend/tests/modules/test_restaurants_repo.py \
  backend/tests/api/test_api_v1.py \
  frontend/src/lib/api/types.ts \
  frontend/src/lib/api/restaurants.ts \
  frontend/src/lib/onboarding/submitOnboarding.ts
git commit -m "feat: add restaurant branch_count field for onboarding" -m "- Persist optional branch_count on restaurants with 1–999 validation
- Expose branch_count through create API, DTOs, and onboarding submit payload"

git add \
  backend/app/modules/analytics/__init__.py \
  backend/app/modules/analytics/schemas.py \
  backend/app/modules/analytics/repository.py \
  backend/app/modules/analytics/adapters.py \
  backend/app/modules/analytics/service.py \
  backend/app/modules/analytics/api.py \
  backend/app/api/v1/router.py \
  backend/app/db/uow.py \
  backend/tests/modules/test_analytics_repo.py
git commit -m "feat: add restaurant analytics dashboard API" -m "- Aggregate revenue, sales series, top products, and customer stats in SQL
- Expose GET /restaurants/{id}/analytics with daily, weekly, and monthly granularity"

git add \
  backend/migrations/versions/0046_digital_menu_theme_colors_typography.py \
  backend/app/db/models/digital_menu_theme.py \
  backend/app/modules/digital_menu_themes/repository.py \
  backend/scripts/sync_digital_menu_themes.py
git commit -m "feat: persist digital menu theme colors and typography" -m "- Add colors and typography JSONB columns to digital_menu_themes
- Upsert full design tokens from sync script after schema migration"

git add \
  frontend/scripts/export-digital-menu-themes.ts \
  backend/data/digital_menu_themes.json
git commit -m "feat: export catalog colors and typography to backend JSON" -m "- Add TypeScript exporter from frontend theme catalog to backend seed JSON
- Regenerate digital_menu_themes.json with colors and typography for all themes"

git add \
  frontend/package.json \
  frontend/pnpm-lock.yaml \
  frontend/src/lib/api/analytics.ts \
  frontend/src/hooks/useRestaurantAnalytics.ts \
  frontend/src/components/pages/AnalyticsPage.tsx \
  frontend/src/components/pages/AnalyticsPage.module.css \
  frontend/src/components/analytics/InteractiveDonutChart.tsx \
  frontend/src/components/analytics/InteractiveDonutChart.module.css \
  frontend/src/components/analytics/InteractiveProductBarChart.tsx \
  frontend/src/components/analytics/InteractiveProductBarChart.module.css \
  frontend/src/components/analytics/InteractiveSalesChart.tsx \
  frontend/src/components/analytics/InteractiveSalesChart.module.css
git commit -m "feat: add restaurant analytics page with interactive charts" -m "- Wire AnalyticsPage to backend dashboard API with period comparison KPIs
- Add Recharts donut, bar, and sales components plus tsx export script dependency"

git add \
  frontend/src/components/pages/DashboardPage.tsx \
  frontend/src/components/pages/DashboardPage.module.css
git commit -m "refactor: slim dashboard to quick actions and analytics entry" -m "- Remove inline mock KPIs and charts from the owner dashboard
- Add Analíticas quick action linking to the dedicated analytics page"

git add \
  frontend/src/lib/search/fuzzyMatch.ts \
  frontend/src/lib/search/fuzzyMatch.test.ts \
  frontend/src/lib/search/dashboardSearch.ts \
  frontend/src/lib/search/dashboardSearch.test.ts \
  frontend/src/lib/search/productsPageFilter.ts \
  frontend/src/lib/search/productsPageFilter.test.ts \
  frontend/src/hooks/useDashboardSearchData.ts \
  frontend/src/components/ui/DashboardSearch.tsx \
  frontend/src/components/ui/DashboardSearch.module.css \
  frontend/src/components/ui/TopBar.tsx \
  frontend/src/components/ui/TopBar.module.css
git commit -m "feat: add fuzzy global dashboard search in TopBar" -m "- Search navigation, products, categories, and orders from the panel header
- Replace placeholder search input and remove unused notification bell UI"

git add \
  frontend/src/components/pages/ProductsPage.tsx \
  frontend/src/app/(panel)/products/page.tsx
git commit -m "feat: apply dashboard search filters on products page" -m "- Read q and tab query params from dashboard search navigation
- Wrap products route in Suspense for useSearchParams deep links"

git add \
  delivery-dashboard/src/components/ui/TopBar.tsx \
  delivery-dashboard/src/components/ui/TopBar.module.css
git commit -m "chore: remove placeholder notification bell from delivery TopBar" -m "- Drop unused bell icon styles from delivery dashboard header
- Keep delivery TopBar actions aligned with owner panel cleanup"

git add \
  frontend/src/components/assistant/ChatMarkdown.tsx \
  frontend/src/components/assistant/ChatMarkdown.module.css \
  frontend/src/components/assistant/chatPlainText.tsx \
  frontend/src/components/assistant/chatColorSwatch.tsx \
  frontend/src/components/assistant/chatMessageLink.tsx \
  frontend/src/components/assistant/chatInlineText.tsx \
  frontend/src/components/assistant/chatInlineText.test.tsx \
  frontend/src/components/assistant/ChatMarkdown.links.test.tsx
git commit -m "feat: enrich assistant chat markdown with links and color swatches" -m "- Auto-link URLs and render hex color chips inside assistant markdown
- Add safe internal link helper and inline text parsing tests"

git add \
  frontend/src/components/assistant/AssistantChatPanel.tsx \
  frontend/src/components/assistant/AssistantChatPanel.module.css
git commit -m "feat: render user and streaming messages with ChatMarkdown" -m "- Show markdown in user bubbles and streaming assistant replies
- Adjust bubble styles for links, swatches, and reduced-motion scrolling"

git add \
  frontend/src/lib/onboarding/storage.ts \
  frontend/src/hooks/useOpenAssistantAfterOnboarding.ts \
  frontend/src/app/onboarding/page.tsx \
  frontend/src/components/pages/DigitalMenuPage.tsx
git commit -m "feat: open assistant after onboarding on digital menu" -m "- Persist a one-shot flag when onboarding completes successfully
- Redirect new owners to digital menu and auto-open the assistant chat"

git add \
  backend/app/modules/assistant/skills/menu_write/product_photos.py \
  backend/app/modules/assistant/skills/menu_write/product_image_paths.py \
  backend/app/modules/assistant/skills/menu_write/bulk.py \
  backend/tests/modules/test_menu_write_product_photos.py
git commit -m "refactor: drop vision photo matching and promote inbox images on assign" -m "- Remove match_product_photos flow and copy inbox images into products/ on assign
- Add remove_product_image helpers and return final image_path in bulk results"

git rm backend/app/modules/assistant/skills/menu_write/product_photo_prompt.py
git commit -m "remove: delete unused menu write product photo match prompt" -m "- Drop vision matching prompt module superseded by owner-confirmed bulk assign
- Keep product photo assignment logic in menu_write product_photos helpers"

git add backend/app/modules/assistant/skills/menu_write/restaurant_settings_tools.py
git commit -m "feat: add restaurant settings helpers for hours and branding" -m "- Read and replace restaurant schedules from assistant tool handlers
- Assign or remove logo and cover images promoted from import inbox paths"

git add \
  backend/app/modules/assistant/skills/menu_write/theme_tools.py \
  backend/tests/modules/test_digital_menu_theme_payload.py
git commit -m "feat: expose theme colors and typography in menu_write theme tools" -m "- Include colors and typography maps in list and apply theme payloads
- Assert theme tool responses surface persisted design tokens"

git add \
  backend/app/modules/assistant/skills/menu_write/tools.py \
  backend/app/modules/assistant/agent/workflow/tool_catalog.py \
  backend/app/modules/assistant/skills/menu_write/SKILL.md \
  backend/tests/modules/test_restaurant_settings_tools.py
git commit -m "feat: expand menu_write skill tool registry" -m "- Register restaurant settings, photo removal, and enriched theme tools
- Document inbox-based uploads and branding workflows in menu_write SKILL.md"

git add backend/app/modules/assistant/skills/menu_import/prompts.py
git commit -m "refactor: translate menu import executor prompts to English" -m "- Rewrite executor instructions in English for model consistency
- Keep owner-facing responder guidance in Spanish with plain-language rules"

git add \
  backend/app/modules/assistant/skills/menu_import/public_menu_url.py \
  backend/app/modules/assistant/agent/workflow/context_loader.py \
  backend/app/modules/assistant/agent/workflow/orchestrator.py \
  backend/tests/modules/test_menu_import_public_menu_url.py \
  backend/tests/modules/test_menu_import_responder_input.py
git commit -m "feat: inject public menu link into menu import responder input" -m "- Detect successful live apply turns and pass public menu URL to responder prompt
- Track executor tools_used so apply tools gate link injection"

git add backend/app/modules/assistant/agent/workflow/prompts.py
git commit -m "refactor: tighten workflow router and responder owner-facing constraints" -m "- Broaden executor routing and forbid unsolicited menu change recommendations
- Hide storage paths, internal IDs, and engineering terms from owner replies"

git rm scripts/apply-commits-copy-paste.sh scripts/apply-pending-commits.sh 2>/dev/null || true
git add -u scripts/
git commit -m "chore: remove git commit batch helper scripts" -m "- Delete local copy-paste commit replay utilities from the repo
- Stop tracking one-off commit batch helpers under scripts/"

echo "Done. Remaining:"
git status --short
