'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import type { OptionGroup, Product } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import { attachDragOverlay } from '@/lib/dragOverlay';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { activeOptionGroups, optionGroupSelectionHint } from './optionGroupHint';
import {
  reorderActiveOptionGroups,
  reorderActiveOptionItems,
} from './optionGroupReorder';
import {
  canAddProductToCart,
  computeLineTotal,
  createEmptySelections,
  getGroupSelection,
  isGroupSelectionComplete,
  isItemSelected,
  toggleOptionSelection,
  type OptionSelections,
} from './productOptionSelection';
import pageStyles from '../pages/DigitalMenuPage.module.css';
import styles from './DigitalMenuProductDetail.module.css';

export const PRODUCT_HERO_HEIGHT = 140;
export const PRODUCT_PINNED_BAR_HEIGHT = 48;

type DigitalMenuProductDetailProps = {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
  heroCollapsed: boolean;
  onHeroCollapsedChange: (collapsed: boolean) => void;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onReorderGroups?: (groups: OptionGroup[]) => Promise<void>;
  onReorderItems?: (groupId: string, group: OptionGroup) => Promise<void>;
};

function DetailPrice({
  product,
  discount,
}: {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
}) {
  const originalPrice = product.price_cents / 100;
  const hasPriceDiscount = discount != null && discount.amountOff > 0;

  if (!hasPriceDiscount && !discount?.badge) {
    return (
      <span className={styles.productPrice}>{formatMoney(originalPrice, product.currency)}</span>
    );
  }

  return (
    <div className={styles.productPriceRow}>
      {hasPriceDiscount ? (
        <>
          <span className={styles.productPriceOriginal}>
            {formatMoney(originalPrice, product.currency)}
          </span>
          <span className={styles.productPriceSale}>
            {formatMoney(discount.finalPrice, product.currency)}
          </span>
        </>
      ) : (
        <span className={styles.productPrice}>{formatMoney(originalPrice, product.currency)}</span>
      )}
      {discount?.badge ? (
        <span className={styles.productDiscountBadge}>{discount.badge}</span>
      ) : null}
    </div>
  );
}

function formatCollapsedGroupSummary(
  group: OptionGroup,
  selectedIds: string[],
  currency: string,
): string {
  const selectedSet = new Set(selectedIds);
  const items = group.items.filter((item) => selectedSet.has(item.id));
  if (items.length === 0) return 'Sin seleccionar';
  return items
    .map((item) => {
      if (item.price_delta_cents !== 0) {
        return `${item.label} (+${formatMoney(item.price_delta_cents / 100, currency)})`;
      }
      return item.label;
    })
    .join(' · ');
}

export function DigitalMenuProductDetail({
  product,
  discount,
  heroCollapsed,
  onHeroCollapsedChange,
  scrollRootRef,
  onBack,
  onReorderGroups,
  onReorderItems,
}: DigitalMenuProductDetailProps) {
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropItemId, setDropItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<OptionSelections>(createEmptySelections);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const imageUrl = storagePublicUrl(product.image_path);
  const groups = activeOptionGroups(product);
  const canReorder = onReorderGroups != null && onReorderItems != null;
  const unitPrice =
    discount != null && discount.amountOff > 0
      ? discount.finalPrice
      : product.price_cents / 100;

  const canAdd = useMemo(() => canAddProductToCart(groups, selections), [groups, selections]);
  const lineTotal = useMemo(
    () => computeLineTotal(unitPrice, groups, selections, quantity),
    [unitPrice, groups, selections, quantity],
  );

  useEffect(() => {
    setQuantity(1);
    setSelections(createEmptySelections());
    setExpandedGroups({});
  }, [product.id]);

  useEffect(() => {
    onHeroCollapsedChange(false);
  }, [product.id, onHeroCollapsedChange]);

  useEffect(() => {
    const root = scrollRootRef.current;
    const sentinel = heroSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        onHeroCollapsedChange(!entry.isIntersecting);
      },
      {
        root,
        threshold: 0,
        rootMargin: `-${PRODUCT_PINNED_BAR_HEIGHT}px 0px 0px 0px`,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [product.id, scrollRootRef, onHeroCollapsedChange]);

  const handleGroupDrop = (targetGroupId: string) => {
    if (!canReorder || !onReorderGroups || !dragGroupId || dragGroupId === targetGroupId) return;
    const from = groups.findIndex((group) => group.id === dragGroupId);
    const to = groups.findIndex((group) => group.id === targetGroupId);
    if (from < 0 || to < 0) return;
    const reordered = reorderActiveOptionGroups(product.option_groups, from, to);
    setDragGroupId(null);
    setDropGroupId(null);
    void onReorderGroups(reordered);
  };

  const handleItemDrop = (group: OptionGroup, targetItemId: string) => {
    if (!canReorder || !onReorderItems || !dragItemId || dragItemId === targetItemId) return;
    const activeItems = group.items.filter((item) => item.is_active);
    const from = activeItems.findIndex((item) => item.id === dragItemId);
    const to = activeItems.findIndex((item) => item.id === targetItemId);
    if (from < 0 || to < 0) return;
    const reorderedGroup = reorderActiveOptionItems(group, from, to);
    setDragItemId(null);
    setDropItemId(null);
    void onReorderItems(group.id, reorderedGroup);
  };

  const handleOptionToggle = (group: OptionGroup, itemId: string) => {
    setSelections((prev) => {
      const next = toggleOptionSelection(group, itemId, prev);
      const selectedIds = getGroupSelection(next, group.id);
      if (isGroupSelectionComplete(group, selectedIds)) {
        setExpandedGroups((current) => ({ ...current, [group.id]: false }));
      }
      return next;
    });
  };

  const isGroupExpanded = (groupId: string) => expandedGroups[groupId] !== false;

  return (
    <>
      <div className={styles.detailRoot}>
        <section className={styles.productHero} aria-label={product.name}>
          <div className={styles.productHeroWrap}>
            {imageUrl ? (
              <img src={imageUrl} alt={product.name} className={styles.heroImage} />
            ) : (
              <div className={styles.heroPlaceholder} aria-hidden />
            )}
            <div
              className={styles.heroFloatBar}
              data-visible={heroCollapsed ? 'false' : 'true'}
              aria-hidden={heroCollapsed}
            >
              <button
                type="button"
                className={styles.heroFloatBack}
                aria-label="Volver al menú"
                onClick={onBack}
              >
                <ArrowBackIcon fontSize="small" />
              </button>
            </div>
          </div>
          <div ref={heroSentinelRef} className={styles.heroSentinel} aria-hidden />
        </section>

        <div className={styles.detailBody}>
          <h1 className={styles.productTitle}>{product.name}</h1>
          {product.description ? (
            <p className={styles.productDescription}>{product.description}</p>
          ) : null}
          <div className={styles.priceBlock}>
            <DetailPrice product={product} discount={discount} />
          </div>

          {groups.length === 0 ? (
            <p className={styles.emptyOptions}>Este producto no tiene opciones configuradas.</p>
          ) : (
            <div className={styles.optionSections}>
              {groups.map((group) => {
                const activeItems = group.items.filter((item) => item.is_active);
                const selectedIds = getGroupSelection(selections, group.id);
                const isComplete = isGroupSelectionComplete(group, selectedIds);
                const isExpanded = isGroupExpanded(group.id);
                const isCollapsed = isComplete && !isExpanded;
                const collapsedSummary = formatCollapsedGroupSummary(
                  group,
                  selectedIds,
                  product.currency,
                );

                return (
                  <div
                    key={group.id}
                    className={`${styles.optionGroupSortable} ${
                      dragGroupId === group.id ? styles.optionGroupDragging : ''
                    } ${
                      dropGroupId === group.id && dragGroupId !== group.id
                        ? styles.optionGroupDropTarget
                        : ''
                    }`}
                    onDragOver={
                      canReorder
                        ? (e) => {
                            e.preventDefault();
                            if (dragGroupId && dragGroupId !== group.id) {
                              setDropGroupId(group.id);
                            }
                          }
                        : undefined
                    }
                    onDragLeave={
                      canReorder
                        ? () => {
                            if (dropGroupId === group.id) setDropGroupId(null);
                          }
                        : undefined
                    }
                    onDrop={
                      canReorder
                        ? (e) => {
                            e.preventDefault();
                            handleGroupDrop(group.id);
                          }
                        : undefined
                    }
                  >
                    {canReorder ? (
                    <button
                      type="button"
                      className={styles.groupDragHandle}
                      draggable
                      aria-label={`Reordenar grupo ${group.title}`}
                      title="Arrastrar para reordenar"
                      onDragStart={(e) => {
                        const container = (e.currentTarget as HTMLElement).closest(
                          `.${styles.optionGroupSortable}`,
                        );
                        if (container instanceof HTMLElement) {
                          attachDragOverlay(e, container, {
                            offsetX: 24,
                            offsetY: 28,
                            overlayClassName: pageStyles.dragOverlayClone,
                            bodyDraggingClassName: pageStyles.bodyDragging,
                          });
                        }
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', group.id);
                        setDragGroupId(group.id);
                      }}
                      onDragEnd={() => {
                        setDragGroupId(null);
                        setDropGroupId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DragIndicatorIcon sx={{ fontSize: 18 }} aria-hidden />
                    </button>
                    ) : null}

                    <section
                      className={`${styles.optionGroupCard} ${
                        isCollapsed ? styles.optionGroupCardCollapsed : ''
                      }`}
                      aria-label={group.title}
                    >
                      {isCollapsed ? (
                        <button
                          type="button"
                          className={styles.optionGroupCollapsedBtn}
                          aria-expanded={false}
                          onClick={() =>
                            setExpandedGroups((current) => ({ ...current, [group.id]: true }))
                          }
                        >
                          <span className={styles.optionGroupCollapsedMain}>
                            <span className={styles.optionGroupCollapsedTop}>
                              <CheckCircleIcon
                                className={styles.optionGroupCompleteIcon}
                                sx={{ fontSize: 18 }}
                                aria-hidden
                              />
                              <span className={styles.optionGroupTitle}>{group.title}</span>
                            </span>
                            <span className={styles.optionGroupSummary}>{collapsedSummary}</span>
                          </span>
                          <ExpandMoreIcon className={styles.optionGroupChevron} aria-hidden />
                        </button>
                      ) : (
                        <>
                          <div className={styles.optionGroupHeader}>
                            <div className={styles.optionGroupTitleRow}>
                              <h2 className={styles.optionGroupTitle}>{group.title}</h2>
                              <div className={styles.optionGroupTitleActions}>
                                {isComplete ? (
                                  <span className={styles.completeBadge}>
                                    <CheckCircleIcon sx={{ fontSize: 14 }} aria-hidden />
                                    Listo
                                  </span>
                                ) : null}
                                {group.required ? (
                                  <span className={styles.requiredBadge}>Obligatorio</span>
                                ) : null}
                              </div>
                            </div>
                            <span className={styles.optionGroupHint}>
                              {optionGroupSelectionHint(group)}
                            </span>
                          </div>
                          <ul
                            className={styles.optionList}
                            role={group.selection === 'single' ? 'radiogroup' : 'group'}
                            aria-label={group.title}
                          >
                        {activeItems.map((item) => {
                          const selected = isItemSelected(selections, group.id, item.id);
                          return (
                          <li
                            key={item.id}
                            className={`${styles.optionItemSortable} ${
                              dragItemId === item.id ? styles.optionItemDragging : ''
                            } ${
                              dropItemId === item.id && dragItemId !== item.id
                                ? styles.optionItemDropTarget
                                : ''
                            }`}
                            onDragOver={
                              canReorder
                                ? (e) => {
                                    e.preventDefault();
                                    if (dragItemId && dragItemId !== item.id) {
                                      setDropItemId(item.id);
                                    }
                                  }
                                : undefined
                            }
                            onDragLeave={
                              canReorder
                                ? () => {
                                    if (dropItemId === item.id) setDropItemId(null);
                                  }
                                : undefined
                            }
                            onDrop={
                              canReorder
                                ? (e) => {
                                    e.preventDefault();
                                    handleItemDrop(group, item.id);
                                  }
                                : undefined
                            }
                          >
                            {canReorder ? (
                            <button
                              type="button"
                              className={styles.itemDragHandle}
                              draggable
                              aria-label={`Reordenar opción ${item.label}`}
                              title="Arrastrar para reordenar"
                              onDragStart={(e) => {
                                const row = (e.currentTarget as HTMLElement).closest(
                                  `.${styles.optionItemSortable}`,
                                );
                                if (row instanceof HTMLElement) {
                                  attachDragOverlay(e, row, {
                                    offsetX: 18,
                                    offsetY: 20,
                                    overlayClassName: pageStyles.dragOverlayClone,
                                    bodyDraggingClassName: pageStyles.bodyDragging,
                                  });
                                }
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', item.id);
                                setDragItemId(item.id);
                              }}
                              onDragEnd={() => {
                                setDragItemId(null);
                                setDropItemId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DragIndicatorIcon sx={{ fontSize: 16 }} aria-hidden />
                            </button>
                            ) : null}
                            <button
                              type="button"
                              className={`${styles.optionItem} ${selected ? styles.optionItemSelected : ''}`}
                              role={group.selection === 'single' ? 'radio' : 'checkbox'}
                              aria-checked={selected}
                              aria-label={`${item.label}${
                                item.price_delta_cents
                                  ? `, ${formatMoney(item.price_delta_cents / 100, product.currency)} extra`
                                  : ''
                              }`}
                              onClick={() => handleOptionToggle(group, item.id)}
                            >
                              <span
                                className={`${styles.optionControl} ${
                                  group.selection === 'single'
                                    ? styles.optionControlSingle
                                    : styles.optionControlMulti
                                } ${selected ? styles.optionControlSelected : ''}`}
                                aria-hidden
                              >
                                {selected && group.selection === 'multi' ? (
                                  <CheckIcon sx={{ fontSize: 14, color: '#fff' }} />
                                ) : null}
                              </span>
                              <span className={styles.optionItemLabel}>{item.label}</span>
                              {item.price_delta_cents !== 0 ? (
                                <span className={styles.optionItemPrice}>
                                  +{formatMoney(item.price_delta_cents / 100, product.currency)}
                                </span>
                              ) : null}
                            </button>
                          </li>
                          );
                        })}
                          </ul>
                          {isComplete ? (
                            <button
                              type="button"
                              className={styles.optionGroupMinimizeBtn}
                              onClick={() =>
                                setExpandedGroups((current) => ({ ...current, [group.id]: false }))
                              }
                            >
                              Minimizar
                            </button>
                          ) : null}
                        </>
                      )}
                    </section>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <footer className={styles.detailFooter}>
        <div className={styles.qtyStepper} aria-label="Cantidad">
          <button
            type="button"
            className={styles.qtyBtn}
            aria-label="Disminuir cantidad"
            disabled={quantity <= 1}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
          >
            <RemoveIcon sx={{ fontSize: 20 }} />
          </button>
          <span className={styles.qtyValue} aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            className={styles.qtyBtn}
            aria-label="Aumentar cantidad"
            onClick={() => setQuantity((value) => value + 1)}
          >
            <AddIcon sx={{ fontSize: 20 }} />
          </button>
        </div>
        <button
          type="button"
          className={`${styles.addBtn} ${canAdd ? styles.addBtnReady : ''}`}
          disabled={!canAdd}
          aria-disabled={!canAdd}
        >
          <span className={styles.addBtnLabel}>Agregar</span>
          <span className={styles.addBtnPrice} aria-live="polite">
            {formatMoney(lineTotal, product.currency)}
          </span>
        </button>
      </footer>
    </>
  );
}
