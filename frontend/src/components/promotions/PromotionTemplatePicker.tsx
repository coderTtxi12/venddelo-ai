'use client';

import type { PromotionTemplate } from '@/lib/promotions/templates';
import { PROMOTION_TEMPLATE_OPTIONS } from '@/lib/promotions/templates';
import styles from './PromotionTemplatePicker.module.css';

type PromotionTemplatePickerProps = {
  value: PromotionTemplate | null;
  onSelect: (template: PromotionTemplate) => void;
};

export function PromotionTemplatePicker({ value, onSelect }: PromotionTemplatePickerProps) {
  return (
    <div className={styles.grid} role="listbox" aria-label="Tipo de promoción">
      {PROMOTION_TEMPLATE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="option"
          aria-selected={value === option.id}
          className={value === option.id ? `${styles.card} ${styles.cardActive}` : styles.card}
          onClick={() => onSelect(option.id)}
        >
          <strong className={styles.title}>{option.title}</strong>
          <span className={styles.description}>{option.description}</span>
        </button>
      ))}
    </div>
  );
}
