'use client';

import { useCallback, type ReactNode } from 'react';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { Product } from '@/lib/api/types';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import { attachDragOverlay } from '@/lib/dragOverlay';
import {
  ProductCardContent,
  ProductListThumb,
  productAriaLabel,
  productCardClassName,
  type ProductListLayout,
} from '@/components/digital-menu/menuProductUi';
import styles from '@/components/pages/DigitalMenuPage.module.css';

export type ProductDragTarget = {
  categoryId: string;
  productId: string;
} | null;

type SortableProductListProps = {
  categoryId: string;
  layout: ProductListLayout;
  products: Product[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  dragTarget: ProductDragTarget;
  dropTarget: ProductDragTarget;
  onDragTargetChange: (target: ProductDragTarget) => void;
  onDropTargetChange: (target: ProductDragTarget) => void;
  onProductDrop: (categoryId: string, targetProductId: string) => void;
  onProductClick: (productId: string) => void;
};

function SortableProductShell({
  product,
  categoryId,
  dragTarget,
  dropTarget,
  onDragTargetChange,
  onDropTargetChange,
  onProductDrop,
  shellClassName,
  children,
}: {
  product: Product;
  categoryId: string;
  dragTarget: ProductDragTarget;
  dropTarget: ProductDragTarget;
  onDragTargetChange: (target: ProductDragTarget) => void;
  onDropTargetChange: (target: ProductDragTarget) => void;
  onProductDrop: (categoryId: string, targetProductId: string) => void;
  shellClassName: string;
  children: ReactNode;
}) {
  const isDragging =
    dragTarget?.categoryId === categoryId && dragTarget.productId === product.id;
  const isDropTarget =
    dropTarget?.categoryId === categoryId &&
    dropTarget.productId === product.id &&
    dragTarget?.categoryId === categoryId &&
    dragTarget.productId !== product.id;

  return (
    <div
      className={`${styles.productSortable} ${shellClassName} ${
        isDragging ? styles.productSortableDragging : ''
      } ${isDropTarget ? styles.productSortableDropTarget : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (
          dragTarget?.categoryId === categoryId &&
          dragTarget.productId !== product.id
        ) {
          onDropTargetChange({ categoryId, productId: product.id });
        }
      }}
      onDragLeave={() => {
        if (
          dropTarget?.categoryId === categoryId &&
          dropTarget.productId === product.id
        ) {
          onDropTargetChange(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        onProductDrop(categoryId, product.id);
      }}
    >
      <button
        type="button"
        className={styles.productDragHandle}
        draggable
        aria-label={`Reordenar producto ${product.name}`}
        title="Arrastrar para reordenar"
        onDragStart={(e) => {
          const shell = (e.currentTarget as HTMLElement).closest(`.${styles.productSortable}`);
          if (shell instanceof HTMLElement) {
            attachDragOverlay(e, shell, {
              offsetX: 24,
              offsetY: 28,
              overlayClassName: styles.dragOverlayClone,
              bodyDraggingClassName: styles.bodyDragging,
            });
          }
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', product.id);
          onDragTargetChange({ categoryId, productId: product.id });
        }}
        onDragEnd={() => {
          onDragTargetChange(null);
          onDropTargetChange(null);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <DragIndicatorIcon sx={{ fontSize: 16 }} aria-hidden />
      </button>
      {children}
    </div>
  );
}

export function SortableProductList({
  categoryId,
  layout,
  products,
  productDiscounts,
  dragTarget,
  dropTarget,
  onDragTargetChange,
  onDropTargetChange,
  onProductDrop,
  onProductClick,
}: SortableProductListProps) {
  const renderProductButton = useCallback(
    (
      product: Product,
      buttonClassName: string,
      content: ReactNode,
    ) => (
      <button
        type="button"
        className={productCardClassName(buttonClassName, product)}
        onClick={() => onProductClick(product.id)}
        aria-label={productAriaLabel(product)}
      >
        {content}
      </button>
    ),
    [onProductClick],
  );

  if (products.length === 0) {
    return <div className={styles.emptyProducts}>Sin productos en esta categoría</div>;
  }

  if (layout === 'tablet') {
    return (
      <div className={styles.productsTabletGrid}>
        {products.map((product) => (
          <SortableProductShell
            key={product.id}
            product={product}
            categoryId={categoryId}
            dragTarget={dragTarget}
            dropTarget={dropTarget}
            onDragTargetChange={onDragTargetChange}
            onDropTargetChange={onDropTargetChange}
            onProductDrop={onProductDrop}
            shellClassName={styles.productSortableTablet}
          >
            {renderProductButton(
              product,
              styles.productCardTablet,
              <>
                <ProductListThumb product={product} className={styles.productThumb} />
                <ProductCardContent
                  product={product}
                  discount={productDiscounts.get(product.id)}
                  bodyClassName={styles.productCardTabletBody}
                />
              </>,
            )}
          </SortableProductShell>
        ))}
      </div>
    );
  }

  if (layout === 'horizontal') {
    return (
      <div className={styles.productsHorizontal}>
        {products.map((product) => (
          <SortableProductShell
            key={product.id}
            product={product}
            categoryId={categoryId}
            dragTarget={dragTarget}
            dropTarget={dropTarget}
            onDragTargetChange={onDragTargetChange}
            onDropTargetChange={onDropTargetChange}
            onProductDrop={onProductDrop}
            shellClassName={styles.productSortableHorizontal}
          >
            {renderProductButton(
              product,
              styles.productCardH,
              <>
                <ProductListThumb product={product} className={styles.productThumb} />
                <ProductCardContent
                  product={product}
                  discount={productDiscounts.get(product.id)}
                />
              </>,
            )}
          </SortableProductShell>
        ))}
      </div>
    );
  }

  if (layout === 'grid') {
    return (
      <div className={styles.productsGrid}>
        {products.map((product) => (
          <SortableProductShell
            key={product.id}
            product={product}
            categoryId={categoryId}
            dragTarget={dragTarget}
            dropTarget={dropTarget}
            onDragTargetChange={onDragTargetChange}
            onDropTargetChange={onDropTargetChange}
            onProductDrop={onProductDrop}
            shellClassName={styles.productSortableGrid}
          >
            {renderProductButton(
              product,
              styles.productCardG,
              <>
                <ProductListThumb product={product} className={styles.productThumb} />
                <ProductCardContent
                  product={product}
                  discount={productDiscounts.get(product.id)}
                />
              </>,
            )}
          </SortableProductShell>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.productsVertical}>
      {products.map((product) => (
        <SortableProductShell
          key={product.id}
          product={product}
          categoryId={categoryId}
          dragTarget={dragTarget}
          dropTarget={dropTarget}
          onDragTargetChange={onDragTargetChange}
          onDropTargetChange={onDropTargetChange}
          onProductDrop={onProductDrop}
          shellClassName={styles.productSortableVertical}
        >
          {renderProductButton(
            product,
            styles.productRow,
            <>
              <div className={styles.productRowBody}>
                <ProductCardContent
                  product={product}
                  discount={productDiscounts.get(product.id)}
                />
              </div>
              <ProductListThumb product={product} className={styles.productThumb} />
            </>,
          )}
        </SortableProductShell>
      ))}
    </div>
  );
}
