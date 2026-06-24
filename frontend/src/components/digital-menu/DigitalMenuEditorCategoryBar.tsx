'use client';

import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { RefObject } from 'react';
import type { Category } from '@/lib/api/types';
import { attachDragOverlay } from '@/lib/dragOverlay';
import { isDigitalMenuSpecialCategoryId } from '@/lib/digital-menu/specialCategories';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';

type DigitalMenuEditorCategoryBarProps = {
  displayCategories: Category[];
  activeCategoryId: string | null;
  heroCollapsed: boolean;
  dragCategoryId: string | null;
  dropCategoryId: string | null;
  onDragCategoryIdChange: (categoryId: string | null) => void;
  onDropCategoryIdChange: (categoryId: string | null) => void;
  onCategoryDrop: (targetId: string) => void;
  onCategorySelect: (categoryId: string) => void;
  categoryBarRef?: RefObject<HTMLDivElement | null>;
};

export function DigitalMenuEditorCategoryBar({
  displayCategories,
  activeCategoryId,
  heroCollapsed,
  dragCategoryId,
  dropCategoryId,
  onDragCategoryIdChange,
  onDropCategoryIdChange,
  onCategoryDrop,
  onCategorySelect,
  categoryBarRef,
}: DigitalMenuEditorCategoryBarProps) {
  return (
    <div
      ref={categoryBarRef}
      className={`${menuStyles.categoryBar} ${heroCollapsed ? menuStyles.categoryBarPinned : ''}`}
    >
      {displayCategories.map((cat) => {
        const isSpecial = isDigitalMenuSpecialCategoryId(cat.id);

        return (
          <div
            key={cat.id}
            className={`${menuStyles.categoryTab} ${
              activeCategoryId === cat.id ? menuStyles.categoryTabActive : ''
            } ${!isSpecial && dragCategoryId === cat.id ? menuStyles.categoryTabDragging : ''} ${
              !isSpecial && dropCategoryId === cat.id && dragCategoryId !== cat.id
                ? menuStyles.categoryTabDropTarget
                : ''
            }`}
            onDragOver={(e) => {
              if (isSpecial) return;
              e.preventDefault();
              if (dragCategoryId && dragCategoryId !== cat.id) {
                onDropCategoryIdChange(cat.id);
              }
            }}
            onDragLeave={() => {
              if (dropCategoryId === cat.id) onDropCategoryIdChange(null);
            }}
            onDrop={(e) => {
              if (isSpecial) return;
              e.preventDefault();
              onCategoryDrop(cat.id);
            }}
          >
            {!isSpecial ? (
              <button
                type="button"
                className={menuStyles.dragHandle}
                draggable
                aria-label={`Reordenar categoría ${cat.name}`}
                title="Arrastrar para reordenar"
                onDragStart={(e) => {
                  const tab = (e.currentTarget as HTMLElement).closest(
                    `.${menuStyles.categoryTab}`,
                  );
                  if (tab instanceof HTMLElement) {
                    attachDragOverlay(e, tab, {
                      offsetX: 24,
                      offsetY: 20,
                      overlayClassName: menuStyles.dragOverlayClone,
                      bodyDraggingClassName: menuStyles.bodyDragging,
                    });
                  }
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', cat.id);
                  onDragCategoryIdChange(cat.id);
                }}
                onDragEnd={() => {
                  onDragCategoryIdChange(null);
                  onDropCategoryIdChange(null);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <DragIndicatorIcon sx={{ fontSize: 16 }} />
              </button>
            ) : null}
            <button
              type="button"
              data-category-tab={cat.id}
              onClick={() => onCategorySelect(cat.id)}
              style={{
                border: 'none',
                background: 'transparent',
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {cat.name}
            </button>
          </div>
        );
      })}
    </div>
  );
}
