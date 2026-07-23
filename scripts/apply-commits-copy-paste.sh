#!/usr/bin/env bash
# Products category status filters — copy-paste commit batch
# Run from repo root: bash scripts/apply-commits-copy-paste.sh
set -euo pipefail

CSS=frontend/src/components/pages/ProductsPage.module.css
TSX=frontend/src/components/pages/ProductsPage.tsx

printf 'y\nn\n' | git add -p "$CSS"
git commit -m "style(frontend): add category filter chip styles on products page" -m "- Style filter popover chips with active/inactive category tones
- Add two-line category chips with name and status pill in the filter menu"

printf 'y\n' | git add -p "$CSS"
git commit -m "style(frontend): add category status chips in products table column" -m "- Add pill layout for category name plus Activa/Inactiva badge in table rows
- Use distinct active and inactive surface colors for quick scanning"

printf 'y\ny\nq\n' | git add -p "$TSX"
git commit -m "feat(frontend): add category active filter types and matching helper" -m "- Add CategoryActiveFilter model and Activa/Inactiva filter options
- Match products when any assigned category satisfies the selected status filters"

printf 'y\ny\ny\ny\ny\ny\ny\ny\nq\n' | git add -p "$TSX"
git commit -m "feat(frontend): wire category active filter into products table pipeline" -m "- Track productCategoryActiveFilter state alongside existing category filters
- Apply status filter in client-side rows pipeline and clear/reset paths
- Count status filters as active filters for catalog reload fallback"

printf 'y\ny\nq\n' | git add -p "$TSX"
git commit -m "feat(frontend): plumb category status filters through products controls" -m "- Pass category status filter state into ProductMobileControls
- Include status selections in mobile category filter badge count"

printf 'y\nq\n' | git add -p "$TSX"
git commit -m "feat(frontend): show removable category status badges in table header" -m "- Render Activa/Inactiva badges under the Categorías column header when filtered
- Allow removing individual status filters without opening the popover"

printf 'y\ny\nq\n' | git add -p "$TSX"
git commit -m "feat(frontend): render category status chips in products table rows" -m "- Replace plain category name chips with ProductCategoryChip component
- Resolve categories through categoryById lookup for consistent status display"

printf 'y\ny\nq\n' | git add -p "$TSX"
git commit -m "feat(frontend): add category status filter to desktop category popover" -m "- Add Estado de categoría section with Activa/Inactiva toggle chips
- Show category status on each selectable category chip in the popover"

git add "$TSX"
git commit -m "feat(frontend): sync category status filters in mobile controls" -m "- Show removable category status badges in mobile active-filters row
- Keep mobile category button count in sync with name and status selections"

git add scripts/apply-commits-copy-paste.sh
git commit -m "chore: add apply-commits copy-paste helper script" -m "- Script applies the products category status filter commit batch in order"

echo "Done. $(git log --oneline -12)"
