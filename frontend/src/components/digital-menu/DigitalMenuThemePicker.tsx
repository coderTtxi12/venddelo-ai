'use client';

import { useMemo, useState } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  DIGITAL_MENU_THEMES,
  type DigitalMenuTheme,
} from '@/lib/digital-menu/themes';
import {
  DIGITAL_MENU_THEME_GROUPS,
  filterDigitalMenuThemes,
  getDigitalMenuThemeGroupId,
  groupDigitalMenuThemes,
  type DigitalMenuThemeGroupId,
} from '@/lib/digital-menu/themes/themeGroups';
import styles from './DigitalMenuThemePicker.module.css';

type DigitalMenuThemePickerProps = {
  value: string;
  onChange: (themeId: string) => void;
};

function ThemeSwatch({
  theme,
  selected,
  onSelect,
}: {
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

function ActiveThemeInsight({ theme }: { theme: DigitalMenuTheme }) {
  const groupLabel =
    DIGITAL_MENU_THEME_GROUPS.find((group) => group.id === getDigitalMenuThemeGroupId(theme.id))
      ?.label ?? 'Por cocina';

  return (
    <footer className={styles.activeFooter} aria-label={`Detalles del tema ${theme.name}`}>
      <p className={styles.activeFooterTitle}>
        {theme.name}
        <span className={styles.activeFooterDot} aria-hidden>
          ·
        </span>
        <span className={styles.activeFooterGroup}>{groupLabel}</span>
      </p>
      <p className={styles.activeFooterRow}>
        <span className={styles.activeFooterLabel}>Qué es</span> {theme.context}
      </p>
      <p className={styles.activeFooterRow}>
        <span className={styles.activeFooterLabel}>Recomendado para</span> {theme.recommendation}
      </p>
    </footer>
  );
}

export function DigitalMenuThemePicker({ value, onChange }: DigitalMenuThemePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroupFilter, setActiveGroupFilter] = useState<DigitalMenuThemeGroupId | 'all'>(
    'all',
  );

  const active = DIGITAL_MENU_THEMES.find((theme) => theme.id === value);

  const filteredThemes = useMemo(
    () =>
      filterDigitalMenuThemes(
        DIGITAL_MENU_THEMES,
        searchQuery,
        activeGroupFilter === 'all' ? null : [activeGroupFilter],
      ),
    [searchQuery, activeGroupFilter],
  );

  const groupedFiltered = useMemo(() => groupDigitalMenuThemes(filteredThemes), [filteredThemes]);

  const showGroupedSections = activeGroupFilter === 'all' && !searchQuery.trim();

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
            ? 'Explora otros estilos o usa la búsqueda para encontrar el ideal'
            : 'Elige un estilo para la vista previa del menú'}
        </p>
      </div>

      <div className={styles.searchRow}>
        <SearchOutlinedIcon className={styles.searchIcon} aria-hidden />
        <input
          type="search"
          className={styles.searchInput}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por cocina, estilo o contexto del tema…"
          aria-label="Buscar temas del menú"
        />
      </div>

      <div className={styles.groupFilters} role="group" aria-label="Filtrar por categoría de tema">
        <button
          type="button"
          className={`${styles.groupChip} ${activeGroupFilter === 'all' ? styles.groupChipActive : ''}`}
          onClick={() => setActiveGroupFilter('all')}
        >
          Todos
        </button>
        {DIGITAL_MENU_THEME_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`${styles.groupChip} ${
              activeGroupFilter === group.id ? styles.groupChipActive : ''
            }`}
            onClick={() => setActiveGroupFilter(group.id)}
            title={group.description}
          >
            {group.label}
          </button>
        ))}
      </div>

      {filteredThemes.length === 0 ? (
        <p className={styles.emptyResults}>No hay temas que coincidan con tu búsqueda.</p>
      ) : (
        <div
          className={styles.themePickerBody}
          role="listbox"
          aria-label="Temas del menú digital"
          aria-activedescendant={value ? `dm-theme-${value}` : undefined}
        >
          {showGroupedSections
            ? DIGITAL_MENU_THEME_GROUPS.map((group) => {
                const themes = groupedFiltered[group.id];
                if (themes.length === 0) return null;

                return (
                  <div key={group.id} className={styles.themeGroup}>
                    <div className={styles.themeGroupHeader}>
                      <h3 className={styles.themeGroupTitle}>{group.label}</h3>
                      <span className={styles.themeGroupCount}>{themes.length}</span>
                    </div>
                    <div className={styles.themeGrid}>
                      {themes.map((theme) => (
                        <div key={theme.id} id={`dm-theme-${theme.id}`}>
                          <ThemeSwatch
                            theme={theme}
                            selected={value === theme.id}
                            onSelect={() => onChange(theme.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            : (
              <div className={styles.themeGrid}>
                {filteredThemes.map((theme) => (
                  <div key={theme.id} id={`dm-theme-${theme.id}`}>
                    <ThemeSwatch
                      theme={theme}
                      selected={value === theme.id}
                      onSelect={() => onChange(theme.id)}
                    />
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {active ? <ActiveThemeInsight theme={active} /> : null}
    </section>
  );
}
