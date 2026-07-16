cd /Users/oliver/startup/venddelo-ai/venddelo-ai

git add frontend/src/lib/digital-menu/useCategoryScrollSpy.ts
git commit -m "fix: defer category scroll spy attachment until scroll root mounts" -m "- Retry scroll listener setup with requestAnimationFrame when ref is null
- Cancel pending attach frames and detach listeners safely on cleanup"

git add frontend/src/components/pages/PublicDigitalMenuPage.tsx
git commit -m "fix: disable mobile category scroll spy on read-only menus" -m "- Require isInteractive before enabling mobile scroll spy on public menu
- Avoid highlight churn when the catalog is shown in preview-only mode"

git add \
  backend/app/modules/assistant/skills/menu_import/samples/aux.json \
  backend/app/modules/assistant/skills/menu_import/samples/aux-gpt5.json
git commit -m "test: add baseline Gula menu OCR draft fixtures" -m "- Check in first literal OCR snapshots for local menu import tuning
- Keep aux.json and aux-gpt5.json as reference ImportDraft outputs"

git add backend/app/modules/assistant/skills/menu_import/samples/aux-2.json
git commit -m "test: add Gula menu OCR draft fixture iteration aux-2" -m "- Capture second-pass literal extraction output for regression comparison
- Use alongside existing sample.json fixtures during prompt iteration"

git add backend/app/modules/assistant/skills/menu_import/samples/aux-3.json
git commit -m "test: add Gula menu OCR draft fixture iteration aux-3" -m "- Store third OCR iteration with expanded category and option coverage
- Support manual diffing against prior aux snapshots during modeling changes"

git add backend/app/modules/assistant/skills/menu_import/samples/aux-4.json
git commit -m "test: add Gula menu OCR draft fixture iteration aux-4" -m "- Persist fourth OCR snapshot after extraction prompt refinements
- Keep fixture available for offline draft modeling experiments"

git add backend/app/modules/assistant/skills/menu_import/samples/aux-5.json
git commit -m "test: add Gula menu OCR draft fixture iteration aux-5" -m "- Add fifth iteration snapshot with constraints_notes on categories
- Track latest pre-modeling literal draft before aux-5.1 adjustments"

git add backend/app/modules/assistant/skills/menu_import/samples/aux-5.1.json
git commit -m "test: add Gula menu OCR draft fixture iteration aux-5.1" -m "- Store follow-up OCR snapshot after aux-5 prompt tuning
- Preserve newest Gula import draft for local validation runs"

git add \
  docs/presentacion/generate_pdf.py \
  docs/presentacion/generate_funciones_pdf.py \
  docs/presentacion/assets/
git commit -m "docs: add Mexy AI presentation PDF generator scripts and assets" -m "- Add slide image assets and Python generators for restaurant decks
- Keep source artwork versioned separately from exported PDFs"

git add \
  docs/presentacion/Mexy-AI-Presentacion-Restaurantes.pdf \
  docs/presentacion/Mexy-AI-Funciones-Panel.pdf
git commit -m "docs: add Mexy AI restaurant and panel presentation PDFs" -m "- Export restaurant onboarding deck and panel features overview
- Ship ready-to-share PDFs alongside generator sources"

git add \
  scripts/apply-commits-copy-paste.sh \
  scripts/apply-pending-commits.sh
git commit -m "chore: add git commit batch helper scripts" -m "- Add copy-paste script for applying conventional commit sequences
- Add pending-commits helper for replaying staged commit plans"

echo "Done. Remaining:"
git status --short
