import type { DigitalMenuTheme } from './types';

export function buildDigitalMenuThemeSearchText(theme: DigitalMenuTheme): string {
  return [
    theme.name,
    theme.label,
    theme.description,
    theme.context,
    theme.recommendation,
    ...theme.bestFor,
    ...theme.style.keywords,
    theme.style.name,
    theme.typography.mood,
    theme.designSystemQuery,
  ]
    .join(' ')
    .toLowerCase();
}
