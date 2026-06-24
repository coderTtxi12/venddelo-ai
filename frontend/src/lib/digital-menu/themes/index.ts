import { DEFAULT_DIGITAL_MENU_THEME_ID, DIGITAL_MENU_THEMES } from './catalog';

export type {
  DigitalMenuBorderRadiusScale,
  DigitalMenuCategoryTabStyle,
  DigitalMenuTheme,
  DigitalMenuThemeColors,
  DigitalMenuThemeCssVars,
  DigitalMenuThemeStyle,
  DigitalMenuThemeTypography,
} from './types';

export {
  DEFAULT_DIGITAL_MENU_THEME_ID,
  DIGITAL_MENU_THEMES,
} from './catalog';

export {
  digitalMenuThemeToCssVars,
  digitalMenuThemeToStyle,
  loadDigitalMenuThemeFonts,
} from './applyTheme';

export { buildDigitalMenuThemeSearchText } from './themeSearch';
export { filterDigitalMenuThemes } from './themeGroups';

export function getDigitalMenuTheme(id: string) {
  return DIGITAL_MENU_THEMES.find((theme) => theme.id === id);
}

export function getDigitalMenuThemeOrDefault(id?: string | null) {
  if (id) {
    const found = getDigitalMenuTheme(id);
    if (found) return found;
  }
  return getDigitalMenuTheme(DEFAULT_DIGITAL_MENU_THEME_ID)!;
}

export function listDigitalMenuThemes() {
  return DIGITAL_MENU_THEMES.map(
    ({ id, name, label, description, bestFor, context, recommendation }) => ({
      id,
      name,
      label,
      description,
      bestFor,
      context,
      recommendation,
    }),
  );
}
