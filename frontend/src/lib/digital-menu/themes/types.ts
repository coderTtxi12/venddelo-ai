/** Visual style metadata from ui-ux-pro-max style recommendations. */
export type DigitalMenuCategoryTabStyle = 'underline' | 'pill' | 'filled';
export type DigitalMenuBorderRadiusScale = 'sharp' | 'rounded' | 'soft' | 'pill';

export interface DigitalMenuThemeColors {
  /** Brand primary — category accents, links, focus rings */
  primary: string;
  /** Secondary brand — badges, highlights */
  secondary: string;
  /** Call-to-action — prices emphasis, buttons */
  accent: string;
  /** Page / phone scroll background */
  background: string;
  /** Cards, headers, category bar, compact bar */
  surface: string;
  /** Primary text — titles, product names */
  text: string;
  /** Body / descriptions */
  textMuted: string;
  /** Hints, addresses, empty states */
  textSecondary: string;
  /** Dividers, borders */
  border: string;
  /** Active category tab text */
  categoryActive: string;
  /** Category tab indicator (underline / pill fill) */
  categoryIndicator: string;
  /** Product price (sin descuento) */
  price: string;
  /** Precio tachado cuando hay promoción */
  priceOriginal: string;
  /** Precio final con descuento */
  priceSale: string;
  /** Fondo del badge (% off, 2x1, etc.) */
  discountBadgeBg: string;
  /** Texto del badge de promoción */
  discountBadgeText: string;
  /** Cover area when no image */
  coverPlaceholderFrom: string;
  coverPlaceholderTo: string;
  /** Gradient over cover bottom for float buttons */
  coverScrim: string;
  /** Share / search float buttons on cover */
  floatButtonBg: string;
  floatButtonText: string;
  /** Logo ring */
  logoBorder: string;
  logoPlaceholderBg: string;
  /** Product thumbnail fallback */
  productThumbBg: string;
  /** Live menu "Agregado" CTA background — optional override */
  addSuccess?: string;
  /** Text on addSuccess background — optional override */
  addSuccessText?: string;
}

export interface DigitalMenuThemeTypography {
  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  bodyWeight: number;
  /** Full Google Fonts CSS2 URL */
  googleFontsUrl: string;
  /** Mood label from ui-ux-pro-max typography domain */
  mood: string;
}

export interface DigitalMenuThemeStyle {
  /** ui-ux-pro-max style name */
  name: string;
  keywords: string[];
  borderRadius: DigitalMenuBorderRadiusScale;
  /** Product cards & thumbs */
  cardRadiusPx: number;
  categoryTabStyle: DigitalMenuCategoryTabStyle;
}

export interface DigitalMenuTheme {
  id: string;
  name: string;
  /** Short label for theme picker UI */
  label: string;
  description: string;
  /** Cuisine / venue hint for restaurateurs */
  bestFor: string[];
  colors: DigitalMenuThemeColors;
  typography: DigitalMenuThemeTypography;
  style: DigitalMenuThemeStyle;
  /** Source query used with ui-ux-pro-max --design-system */
  designSystemQuery: string;
}

/** CSS custom properties applied on the phone preview root */
export type DigitalMenuThemeCssVars = Record<string, string>;
