'use client';

import type { DigitalMenuSpecialCategoryConfig } from '@/lib/digital-menu/specialCategories';
import {
  DEFAULT_DIGITAL_MENU_LIMITED_TIME_CATEGORY_NAME,
  DEFAULT_DIGITAL_MENU_PROMOTIONS_CATEGORY_NAME,
} from '@/lib/digital-menu/specialCategories';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import styles from './DigitalMenuSpecialCategoriesPanel.module.css';

type DigitalMenuSpecialCategoriesPanelProps = {
  config: DigitalMenuSpecialCategoryConfig;
  onPromotionsEnabledChange: (enabled: boolean) => void;
  onPromotionsNameChange: (name: string) => void;
  onLimitedTimeEnabledChange: (enabled: boolean) => void;
  onLimitedTimeNameChange: (name: string) => void;
};

export function DigitalMenuSpecialCategoriesPanel({
  config,
  onPromotionsEnabledChange,
  onPromotionsNameChange,
  onLimitedTimeEnabledChange,
  onLimitedTimeNameChange,
}: DigitalMenuSpecialCategoriesPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="dm-special-categories-title">
      <div className={styles.panelHeader}>
        <div className={styles.panelTitleRow}>
          <LocalOfferOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
          <h2 id="dm-special-categories-title" className={styles.panelTitle}>
            Categorías especiales
          </h2>
        </div>
        <p className={styles.panelHint}>
          Aparecen arriba del menú cuando hay promociones activas. Puedes renombrarlas o
          desactivarlas.
        </p>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={config.promotionsCategoryEnabled}
            onChange={(event) => onPromotionsEnabledChange(event.target.checked)}
          />
          <span>Mostrar categoría de promociones</span>
        </label>
        <label className={styles.fieldLabel} htmlFor="dm-promotions-category-name">
          Nombre en el menú
        </label>
        <input
          id="dm-promotions-category-name"
          className={styles.textInput}
          defaultValue={config.promotionsCategoryName}
          key={`promotions-name-${config.promotionsCategoryName}`}
          placeholder={DEFAULT_DIGITAL_MENU_PROMOTIONS_CATEGORY_NAME}
          disabled={!config.promotionsCategoryEnabled}
          onBlur={(event) => onPromotionsNameChange(event.target.value)}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={config.limitedTimeCategoryEnabled}
            onChange={(event) => onLimitedTimeEnabledChange(event.target.checked)}
          />
          <span>Mostrar categoría por tiempo limitado</span>
        </label>
        <label className={styles.fieldLabel} htmlFor="dm-limited-time-category-name">
          Nombre en el menú
        </label>
        <input
          id="dm-limited-time-category-name"
          className={styles.textInput}
          defaultValue={config.limitedTimeCategoryName}
          key={`limited-time-name-${config.limitedTimeCategoryName}`}
          placeholder={DEFAULT_DIGITAL_MENU_LIMITED_TIME_CATEGORY_NAME}
          disabled={!config.limitedTimeCategoryEnabled}
          onBlur={(event) => onLimitedTimeNameChange(event.target.value)}
        />
        <p className={styles.fieldHint}>
          Se activa automáticamente cuando algún producto tiene descuento o promoción vigente. Se
          muestra en fila horizontal debajo de promociones.
        </p>
      </div>
    </section>
  );
}
