'use client';

import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import LunchDiningOutlinedIcon from '@mui/icons-material/LunchDiningOutlined';
import RedeemOutlinedIcon from '@mui/icons-material/RedeemOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import type { PromotionTemplate } from '@/lib/promotions/templates';
import { PROMOTION_TEMPLATE_OPTIONS } from '@/lib/promotions/templates';
import styles from '../marketing/PromotionForm.module.css';

const TEMPLATE_ICONS: Record<PromotionTemplate, typeof LocalOfferOutlinedIcon> = {
  product_discount: LocalOfferOutlinedIcon,
  bundle: RedeemOutlinedIcon,
  combo: LunchDiningOutlinedIcon,
  order_threshold: ShoppingCartOutlinedIcon,
};

type PromotionTemplatePickerProps = {
  value: PromotionTemplate | null;
  onSelect: (template: PromotionTemplate) => void;
};

export function PromotionTemplatePicker({ value, onSelect }: PromotionTemplatePickerProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.scroll}>
        <div className={styles.templateList} role="listbox" aria-label="Tipo de promoción">
          {PROMOTION_TEMPLATE_OPTIONS.map((option) => {
            const Icon = TEMPLATE_ICONS[option.id];
            const active = value === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={active}
                className={active ? `${styles.templateCard} ${styles.templateCardActive}` : styles.templateCard}
                onClick={() => onSelect(option.id)}
              >
                <span className={styles.templateIcon} aria-hidden>
                  <Icon fontSize="small" />
                </span>
                <span className={styles.templateCopy}>
                  <span className={styles.templateTitle}>{option.title}</span>
                  <span className={styles.templateDescription}>{option.description}</span>
                </span>
                <ChevronRightOutlinedIcon className={styles.templateChevron} fontSize="small" aria-hidden />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
