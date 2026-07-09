'use client';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import styles from './ListPagination.module.css';

type ListPaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: number;
  itemLabel: string;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

export function ListPagination({
  page,
  totalPages,
  totalItems,
  rangeStart,
  rangeEnd,
  pageSize,
  itemLabel,
  loading = false,
  onPageChange,
}: ListPaginationProps) {
  if (totalItems === 0) return null;

  const canGoPrev = page > 1 && !loading;
  const canGoNext = page < totalPages && !loading;

  const rangeText =
    totalItems === 0
      ? `0 ${itemLabel}`
      : rangeStart === rangeEnd
        ? `Mostrando ${rangeStart} de ${totalItems} ${itemLabel}`
        : `Mostrando ${rangeStart}–${rangeEnd} de ${totalItems} ${itemLabel}`;

  return (
    <nav className={styles.bar} aria-label={`Paginación de ${itemLabel}`}>
      <div className={styles.meta}>
        <span className={styles.range}>{rangeText}</span>
        <span className={styles.pageSize}>{pageSize} por página</span>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onPageChange(page - 1)}
          disabled={!canGoPrev}
          aria-label="Página anterior"
        >
          <ChevronLeftIcon fontSize="small" aria-hidden />
          Anterior
        </button>

        <span className={styles.pageIndicator} aria-current="page">
          Página {page} de {totalPages}
        </span>

        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onPageChange(page + 1)}
          disabled={!canGoNext}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRightIcon fontSize="small" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
