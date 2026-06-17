'use client';

import CheckIcon from '@mui/icons-material/Check';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import {
  DIGITAL_MENU_THEMES,
  type DigitalMenuTheme,
} from '@/lib/digital-menu/themes';
import styles from './DigitalMenuThemePicker.module.css';

type DigitalMenuThemePickerProps = {
  value: string;
  onChange: (themeId: string) => void;
};

function ThemeSwatch({ theme, selected, onSelect }: {
  theme: DigitalMenuTheme;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = theme;

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`${theme.name}. ${theme.description}`}
      title={theme.description}
      className={`${styles.themeOption} ${selected ? styles.themeOptionSelected : ''}`}
      onClick={onSelect}
    >
      <span className={styles.swatchRow} aria-hidden>
        <span className={styles.swatch} style={{ background: colors.primary }} />
        <span className={styles.swatch} style={{ background: colors.background }} />
        <span className={styles.swatch} style={{ background: colors.accent }} />
      </span>
      <span className={styles.themeLabel}>{theme.label}</span>
      {selected ? (
        <span className={styles.selectedMark} aria-hidden>
          <CheckIcon sx={{ fontSize: 14 }} />
        </span>
      ) : null}
    </button>
  );
}

export function DigitalMenuThemePicker({ value, onChange }: DigitalMenuThemePickerProps) {
  const active = DIGITAL_MENU_THEMES.find((t) => t.id === value);

  return (
    <section className={styles.panel} aria-labelledby="dm-theme-picker-title">
      <div className={styles.panelHeader}>
        <div className={styles.panelTitleRow}>
          <PaletteOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
          <h2 id="dm-theme-picker-title" className={styles.panelTitle}>
            Tema visual
          </h2>
        </div>
        <p className={styles.panelHint}>
          {active
            ? `${active.name} — ${active.bestFor.slice(0, 2).join(', ')}`
            : 'Elige un estilo para la vista previa del menú'}
        </p>
      </div>

      <div
        className={styles.themeList}
        role="listbox"
        aria-label="Temas del menú digital"
        aria-activedescendant={value ? `dm-theme-${value}` : undefined}
      >
        {DIGITAL_MENU_THEMES.map((theme) => (
          <div key={theme.id} id={`dm-theme-${theme.id}`}>
            <ThemeSwatch
              theme={theme}
              selected={value === theme.id}
              onSelect={() => onChange(theme.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
