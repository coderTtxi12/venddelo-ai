'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { OptionGroup, Product, Promotion } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import { attachDragOverlay } from '@/lib/dragOverlay';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import { ProductImagePlaceholder } from '@/components/digital-menu/ProductImagePlaceholder';
import { PromotionCountdown } from '@/components/digital-menu/PromotionCountdown';
import {
  bundleComplementExcludedBadge,
  bundleComplementExcludedTitle,
  isOptionExcludedFromBundlePromo,
  type BundleComplementRules,
} from '@/lib/promotions/bundlePromoEligibility';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import {
  activeOptionGroups,
  displayOptionGroups,
  OPTION_ITEM_SOLD_OUT_LABEL,
  optionGroupSelectionHint,
} from './optionGroupHint';
import {
  reorderActiveOptionGroups,
  reorderActiveOptionItems,
} from './optionGroupReorder';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import { PRODUCT_UNAVAILABLE_LABEL } from '@/components/digital-menu/menuProductUi';
import { triggerHaptic } from '@/lib/haptics/triggerHaptic';
import {
  computeLineTotal,
  createEmptySelections,
  getGroupSelection,
  getIncompleteRequiredGroups,
  incompleteRequiredGroupsMessage,
  isGroupSelectionComplete,
  isItemSelected,
  toggleOptionSelection,
  type OptionSelections,
} from './productOptionSelection';
import styles from './DigitalMenuProductDetail.module.css';
import {
  DIGITAL_MENU_COVER_HEIGHT_PX,
  DIGITAL_MENU_PINNED_BAR_HEIGHT_PX,
} from '@/lib/digital-menu/layout';

export const PRODUCT_HERO_HEIGHT = DIGITAL_MENU_COVER_HEIGHT_PX;
export const PRODUCT_PINNED_BAR_HEIGHT = DIGITAL_MENU_PINNED_BAR_HEIGHT_PX;
export const PRODUCT_NOTES_MAX_LENGTH = 250;

type AddToCartPayload = {
  quantity: number;
  selections: OptionSelections;
  lineTotal: number;
  notes: string;
};

type DigitalMenuProductDetailProps = {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
  timeLimitedPromotion?: Promotion | null;
  promotionTimezone?: string;
  countdownContext?: PromotionCountdownContext;
  bundleComplementRules?: BundleComplementRules | null;
  heroCollapsed: boolean;
  onHeroCollapsedChange: (collapsed: boolean) => void;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onAddToCart?: (payload: AddToCartPayload) => void;
  hideHeroBackButton?: boolean;
  enableHaptics?: boolean;
  isTabletLayout?: boolean;
  /** Editor preview only: keeps mobile footer/layout when the browser viewport is desktop-wide. */
  editorPreviewDevice?: 'mobile' | 'tablet' | 'desktop';
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
  timeLimitedPromotion = null,
  promotionTimezone,
  countdownContext,
  bundleComplementRules = null,
  heroCollapsed,
  onHeroCollapsedChange,
  scrollRootRef,
  onBack,
  onAddToCart,
  hideHeroBackButton = false,
  enableHaptics = false,
  isTabletLayout = false,
  editorPreviewDevice,
  onReorderGroups,
  onReorderItems,
}: DigitalMenuProductDetailProps) {
  const useEditorMobileBand = editorPreviewDevice === 'mobile';
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const addFeedbackTimerRef = useRef<number | null>(null);
  const validationScrollTimerRef = useRef<number | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropItemId, setDropItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<OptionSelections>(createEmptySelections);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [justAdded, setJustAdded] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectionValidationAttempted, setSelectionValidationAttempted] = useState(false);
  const [addBtnAttention, setAddBtnAttention] = useState(false);

  const imageUrl = storagePublicUrl(product.image_path);
  const displayGroups = displayOptionGroups(product);
  const activeGroups = activeOptionGroups(product);
  const canReorder = onReorderGroups != null && onReorderItems != null;
  const isAvailable = product.status === 'active';
  const unitPrice =
    discount != null && discount.amountOff > 0
      ? discount.finalPrice
      : product.price_cents / 100;

  const incompleteRequiredGroups = useMemo(
    () => getIncompleteRequiredGroups(activeGroups, selections),
    [activeGroups, selections],
  );
  const canAdd = useMemo(
    () => isAvailable && incompleteRequiredGroups.length === 0,
    [isAvailable, incompleteRequiredGroups],
  );
  const selectionValidationMessage = useMemo(
    () => incompleteRequiredGroupsMessage(incompleteRequiredGroups),
    [incompleteRequiredGroups],
  );
  const showSelectionValidation =
    selectionValidationAttempted && incompleteRequiredGroups.length > 0;
  const highlightedGroupIds = showSelectionValidation
    ? incompleteRequiredGroups.map((group) => group.id)
    : [];
  const lineTotal = useMemo(
    () => computeLineTotal(unitPrice, activeGroups, selections, quantity),
    [unitPrice, activeGroups, selections, quantity],
  );

  useEffect(() => {
    setQuantity(1);
    setSelections(createEmptySelections());
    setExpandedGroups({});
    setNotes('');
    setSelectionValidationAttempted(false);
    setAddBtnAttention(false);
    if (addFeedbackTimerRef.current != null) {
      window.clearTimeout(addFeedbackTimerRef.current);
      addFeedbackTimerRef.current = null;
    }
    if (validationScrollTimerRef.current != null) {
      window.clearTimeout(validationScrollTimerRef.current);
      validationScrollTimerRef.current = null;
    }
  }, [product.id]);

  useEffect(
    () => () => {
      if (addFeedbackTimerRef.current != null) {
        window.clearTimeout(addFeedbackTimerRef.current);
      }
      if (validationScrollTimerRef.current != null) {
        window.clearTimeout(validationScrollTimerRef.current);
      }
    },
    [],
  );

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
    const from = displayGroups.findIndex((group) => group.id === dragGroupId);
    const to = displayGroups.findIndex((group) => group.id === targetGroupId);
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

  const handleOptionToggle = (group: OptionGroup, itemId: string, itemActive: boolean) => {
    if (!itemActive) return;
    const wasSelected = isItemSelected(selections, group.id, itemId);
    const next = toggleOptionSelection(group, itemId, selections);
    const selectedIds = getGroupSelection(next, group.id);

    setSelections(next);
    if (isGroupSelectionComplete(group, selectedIds)) {
      setExpandedGroups((current) => ({ ...current, [group.id]: false }));
    }

    if (enableHaptics && !wasSelected && isItemSelected(next, group.id, itemId)) {
      triggerHaptic('selection');
    }
  };

  const isGroupExpanded = (groupId: string) => expandedGroups[groupId] !== false;

  const revealIncompleteSelections = () => {
    const incomplete = getIncompleteRequiredGroups(activeGroups, selections);
    if (incomplete.length === 0) return;

    setSelectionValidationAttempted(true);
    setExpandedGroups((current) => {
      const next = { ...current };
      for (const group of incomplete) {
        next[group.id] = true;
      }
      return next;
    });
    setAddBtnAttention(true);
    window.setTimeout(() => setAddBtnAttention(false), 520);

    if (enableHaptics) {
      triggerHaptic('selection');
    }

    const firstGroupId = incomplete[0]?.id;
    if (validationScrollTimerRef.current != null) {
      window.clearTimeout(validationScrollTimerRef.current);
    }
    validationScrollTimerRef.current = window.setTimeout(() => {
      const target = firstGroupId ? groupRefs.current[firstGroupId] : null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      validationScrollTimerRef.current = null;
    }, 80);
  };

  const handleAddToCart = () => {
    if (!onAddToCart || !isAvailable) return;

    if (!canAdd) {
      revealIncompleteSelections();
      return;
    }

    setSelectionValidationAttempted(false);

    if (enableHaptics) {
      triggerHaptic('success');
    }
    onAddToCart({ quantity, selections, lineTotal, notes });
    setJustAdded(true);
    if (addFeedbackTimerRef.current != null) {
      window.clearTimeout(addFeedbackTimerRef.current);
    }
    addFeedbackTimerRef.current = window.setTimeout(() => {
      setJustAdded(false);
      addFeedbackTimerRef.current = null;
    }, 1600);
  };

  const detailContent = (
    <>
      <div className={`${styles.detailRoot} ${isTabletLayout ? menuStyles.publicTablet : ''}`}>
        <section className={styles.productHero} aria-label={product.name}>
          <div className={styles.productHeroWrap}>
            {imageUrl ? (
              <img src={imageUrl} alt={product.name} className={styles.heroImage} />
            ) : (
              <ProductImagePlaceholder
                name={product.name}
                variant="hero"
                className={styles.heroPlaceholder}
              />
            )}
            <div
              className={styles.heroFloatBar}
              data-visible={hideHeroBackButton ? 'false' : heroCollapsed ? 'false' : 'true'}
              aria-hidden={hideHeroBackButton || heroCollapsed}
            >
              {!hideHeroBackButton ? (
              <button
                type="button"
                className={styles.heroFloatBack}
                aria-label="Volver al menú"
                onClick={onBack}
              >
                <ArrowBackIcon fontSize="small" />
              </button>
              ) : null}
            </div>
          </div>
          <div ref={heroSentinelRef} className={styles.heroSentinel} aria-hidden />
        </section>

        <div className={styles.detailBody}>
          <div className={styles.productTitleRow}>
            <h1 className={styles.productTitle}>{product.name}</h1>
            {!isAvailable ? (
              <span className={`${menuStyles.productUnavailableBadge} ${styles.unavailableBadge}`}>
                {PRODUCT_UNAVAILABLE_LABEL}
              </span>
            ) : null}
          </div>
          {!isAvailable ? (
            <p className={styles.unavailableNotice} role="status">
              Este producto no está disponible por ahora. Puedes ver los detalles, pero no agregarlo al
              pedido.
            </p>
          ) : null}
          {product.description ? (
            <p className={styles.productDescription}>{product.description}</p>
          ) : null}
          <div className={styles.priceBlock}>
            <DetailPrice product={product} discount={discount} />
            {discount?.offerSlogan ? (
              <p className={styles.bundleOfferCallout} role="note">
                <LocalOfferOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                <span>{discount.offerSlogan}</span>
              </p>
            ) : null}
            {timeLimitedPromotion && promotionTimezone ? (
              <PromotionCountdown
                promotion={timeLimitedPromotion}
                timezone={promotionTimezone}
                countdownContext={countdownContext}
                variant="detail"
              />
            ) : null}
          </div>

          {displayGroups.length > 0 ? (
            <div className={styles.optionSections}>
              {displayGroups.map((group) => {
                const displayItems = group.items;
                const selectedIds = getGroupSelection(selections, group.id);
                const isComplete = isGroupSelectionComplete(group, selectedIds);
                const isExpanded = isGroupExpanded(group.id);
                const isCollapsed = isComplete && !isExpanded;
                const collapsedSummary = formatCollapsedGroupSummary(
                  group,
                  selectedIds,
                  product.currency,
                );

                const needsAttention = highlightedGroupIds.includes(group.id);

                return (
                  <div
                    key={group.id}
                    ref={(node) => {
                      groupRefs.current[group.id] = node;
                    }}
                    className={`${styles.optionGroupSortable} ${
                      dragGroupId === group.id ? styles.optionGroupDragging : ''
                    } ${
                      dropGroupId === group.id && dragGroupId !== group.id
                        ? styles.optionGroupDropTarget
                        : ''
                    } ${needsAttention ? styles.optionGroupNeedsAttention : ''}`}
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
                            overlayClassName: menuStyles.dragOverlayClone,
                            bodyDraggingClassName: menuStyles.bodyDragging,
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
                      } ${needsAttention ? styles.optionGroupCardNeedsAttention : ''}`}
                      aria-label={group.title}
                      aria-invalid={needsAttention || undefined}
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
                        {displayItems.map((item) => {
                          const isSoldOut = !item.is_active;
                          const selected = !isSoldOut && isItemSelected(selections, group.id, item.id);
                          const excludedFromPromo =
                            !isSoldOut &&
                            bundleComplementRules &&
                            isOptionExcludedFromBundlePromo(item.id, bundleComplementRules);
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
                              canReorder && !isSoldOut
                                ? (e) => {
                                    e.preventDefault();
                                    if (dragItemId && dragItemId !== item.id) {
                                      setDropItemId(item.id);
                                    }
                                  }
                                : undefined
                            }
                            onDragLeave={
                              canReorder && !isSoldOut
                                ? () => {
                                    if (dropItemId === item.id) setDropItemId(null);
                                  }
                                : undefined
                            }
                            onDrop={
                              canReorder && !isSoldOut
                                ? (e) => {
                                    e.preventDefault();
                                    handleItemDrop(group, item.id);
                                  }
                                : undefined
                            }
                          >
                            {canReorder && !isSoldOut ? (
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
                                    overlayClassName: menuStyles.dragOverlayClone,
                                    bodyDraggingClassName: menuStyles.bodyDragging,
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
                            {isSoldOut ? (
                              <div
                                className={`${styles.optionItem} ${styles.optionItemSoldOut}`}
                                role="listitem"
                                aria-disabled="true"
                                aria-label={`${item.label}, ${OPTION_ITEM_SOLD_OUT_LABEL.toLowerCase()}${
                                  item.price_delta_cents
                                    ? `, ${formatMoney(item.price_delta_cents / 100, product.currency)} extra`
                                    : ''
                                }`}
                              >
                                <span
                                  className={`${styles.optionControl} ${
                                    group.selection === 'single'
                                      ? styles.optionControlSingle
                                      : styles.optionControlMulti
                                  } ${styles.optionControlSoldOut}`}
                                  aria-hidden
                                />
                                <span className={styles.optionItemLabelWrap}>
                                  <span className={styles.optionItemLabel}>{item.label}</span>
                                </span>
                                <span className={styles.optionSoldOutBadge}>
                                  {OPTION_ITEM_SOLD_OUT_LABEL}
                                </span>
                              </div>
                            ) : (
                            <button
                              type="button"
                              className={`${styles.optionItem} ${selected ? styles.optionItemSelected : ''} ${
                                excludedFromPromo ? styles.optionItemOutsidePromo : ''
                              }`}
                              role={group.selection === 'single' ? 'radio' : 'checkbox'}
                              aria-checked={selected}
                              aria-label={`${item.label}${
                                item.price_delta_cents
                                  ? `, ${formatMoney(item.price_delta_cents / 100, product.currency)} extra`
                                  : ''
                              }${
                                excludedFromPromo && bundleComplementRules
                                  ? `, fuera de promoción ${bundleComplementExcludedBadge(bundleComplementRules.promoBadge)}`
                                  : ''
                              }`}
                              title={
                                excludedFromPromo && bundleComplementRules
                                  ? bundleComplementExcludedTitle(bundleComplementRules.promoName)
                                  : undefined
                              }
                              onClick={() => handleOptionToggle(group, item.id, item.is_active)}
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
                              <span className={styles.optionItemLabelWrap}>
                                <span className={styles.optionItemLabel}>{item.label}</span>
                                {excludedFromPromo && bundleComplementRules ? (
                                  <span className={styles.optionOutsidePromoBadge}>
                                    {bundleComplementExcludedBadge(bundleComplementRules.promoBadge)}
                                  </span>
                                ) : null}
                              </span>
                              {item.price_delta_cents !== 0 ? (
                                <span className={styles.optionItemPrice}>
                                  +{formatMoney(item.price_delta_cents / 100, product.currency)}
                                </span>
                              ) : null}
                            </button>
                            )}
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
          ) : null}

          {isAvailable ? (
            <section className={styles.notesSection} aria-labelledby={`product-notes-${product.id}`}>
              <div className={styles.notesHeader}>
                <h2 className={styles.notesTitle} id={`product-notes-${product.id}`}>
                  Comentarios adicionales
                </h2>
                <span className={styles.notesOptionalBadge}>Opcional</span>
              </div>
              <p className={styles.notesHint}>
                Indica preferencias o instrucciones especiales para este platillo.
              </p>
              <textarea
                id={`product-notes-input-${product.id}`}
                className={styles.notesInput}
                value={notes}
                maxLength={PRODUCT_NOTES_MAX_LENGTH}
                rows={3}
                placeholder="Ej. sin cebolla, extra picante, empaquetar aparte…"
                aria-describedby={`product-notes-meta-${product.id}`}
                onChange={(event) => setNotes(event.target.value)}
              />
              <p className={styles.notesMeta} id={`product-notes-meta-${product.id}`}>
                {notes.length}/{PRODUCT_NOTES_MAX_LENGTH}
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <footer
        className={`${styles.detailFooter} ${isTabletLayout ? menuStyles.publicTablet : ''}`}
      >
        {showSelectionValidation && selectionValidationMessage ? (
          <div
            id={`product-add-validation-${product.id}`}
            className={styles.addValidationBanner}
            role="alert"
            aria-live="assertive"
          >
            <InfoOutlinedIcon className={styles.addValidationIcon} sx={{ fontSize: 20 }} aria-hidden />
            <p className={styles.addValidationText}>{selectionValidationMessage}</p>
          </div>
        ) : null}
        <div
          className={`${styles.detailFooterInner} ${
            !isAvailable ? styles.detailFooterInnerUnavailable : ''
          }`}
        >
          {isAvailable ? (
          <div className={styles.footerQtyBlock}>
            <span className={styles.footerQtyLabel}>Cantidad</span>
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
          </div>
          ) : null}
          <button
            type="button"
            className={`${styles.addBtn} ${canAdd && onAddToCart ? styles.addBtnReady : ''} ${
              isAvailable && onAddToCart && !canAdd ? styles.addBtnActionable : ''
            } ${justAdded ? styles.addBtnAdded : ''} ${
              addBtnAttention ? styles.addBtnAttention : ''
            } ${!isAvailable ? styles.addBtnUnavailable : ''}`}
            disabled={!isAvailable || !onAddToCart}
            aria-disabled={!canAdd || !onAddToCart}
            aria-describedby={
              showSelectionValidation ? `product-add-validation-${product.id}` : undefined
            }
            onClick={handleAddToCart}
          >
            <span className={styles.addBtnLabel}>
              {!isAvailable ? PRODUCT_UNAVAILABLE_LABEL : justAdded ? 'Agregado' : 'Agregar'}
            </span>
            {isAvailable ? (
            <span className={styles.addBtnPrice} aria-live="polite">
              {formatMoney(lineTotal, product.currency)}
            </span>
            ) : null}
          </button>
        </div>
      </footer>
    </>
  );

  if (useEditorMobileBand) {
    return <div className={styles.detailShellEditorMobile}>{detailContent}</div>;
  }

  return detailContent;
}
