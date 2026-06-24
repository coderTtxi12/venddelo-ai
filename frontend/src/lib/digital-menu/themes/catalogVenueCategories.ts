import type { DigitalMenuTheme, DigitalMenuThemeColors } from './types';

function c(
  colors: Omit<
    DigitalMenuThemeColors,
    'priceOriginal' | 'priceSale' | 'discountBadgeBg' | 'discountBadgeText'
  > &
    Partial<
      Pick<
        DigitalMenuThemeColors,
        'priceOriginal' | 'priceSale' | 'discountBadgeBg' | 'discountBadgeText'
      >
    >,
): DigitalMenuThemeColors {
  return {
    ...colors,
    priceOriginal: colors.priceOriginal ?? colors.textSecondary,
    priceSale: colors.priceSale ?? colors.primary,
    discountBadgeBg: colors.discountBadgeBg ?? colors.background,
    discountBadgeText: colors.discountBadgeText ?? colors.primary,
  };
}

/**
 * Flagship themes for venue-category groups — ui-ux-pro-max verified:
 * style + color + typography domains combined per theme before authoring.
 */
export const VENUE_CATEGORY_DIGITAL_MENU_THEMES: DigitalMenuTheme[] = [
  {
    id: 'roastery-latte',
    name: 'Roastery Latte',
    label: 'Roastery',
    description:
      'Terracota, crema y arena cálida con serif orgánica — tostador de especialidad y pan de masa madre.',
    bestFor: ['Tostador de café', 'Panadería artesanal', 'Brunch de barrio'],
    context:
      'Paleta Nature Distilled: terracota, arena y crema suave con Lora + Raleway. Sensación de tostador de barrio con grano de origen, vitrina de pan y luz matutina — artesanal sin ser recargado.',
    recommendation:
      'Tostadores de especialidad, panaderías de masa madre, cafés de barrio con repostería propia, menús con pour-over, latte art, croissants, sourdough y brunch de fin de semana.',
    designSystemQuery: 'coffee shop artisan roastery nature distilled terracotta cream',
    typography: {
      headingFont: 'Lora, Georgia, serif',
      bodyFont: 'Raleway, system-ui, sans-serif',
      headingWeight: 600,
      bodyWeight: 400,
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Raleway:wght@300;400;500;600;700&display=swap',
      mood: 'artisan, organic, warm, roastery, bakery',
    },
    style: {
      name: 'Nature Distilled',
      keywords: ['terracotta', 'sand', 'organic', 'artisan', 'warm'],
      borderRadius: 'soft',
      cardRadiusPx: 14,
      categoryTabStyle: 'pill',
    },
    colors: c({
      primary: '#B5651D',
      secondary: '#C67B5C',
      accent: '#6B7B3C',
      background: '#F5F0E1',
      surface: '#FFFBF5',
      text: '#451A03',
      textMuted: '#78350F',
      textSecondary: '#92400E',
      border: '#E8DCC8',
      categoryActive: '#451A03',
      categoryIndicator: '#B5651D',
      price: '#451A03',
      coverPlaceholderFrom: '#D4C4A8',
      coverPlaceholderTo: '#B5651D',
      coverScrim: 'linear-gradient(to top, rgba(69, 26, 3, 0.32), transparent)',
      floatButtonBg: 'rgba(255, 251, 245, 0.95)',
      floatButtonText: '#451A03',
      logoBorder: '#FFFBF5',
      logoPlaceholderBg: '#F5F0E1',
      productThumbBg: '#F5F0E1',
    }),
  },
  {
    id: 'maitre-elegance',
    name: 'Maître Élégance',
    label: 'Maître',
    description:
      'Piedra premium, oro refinado y serif Cormorant — alta cocina, cava y experiencias de autor.',
    bestFor: ['Alta cocina', 'Chef table', 'Wine pairing'],
    context:
      'Liquid Glass con negro piedra, oro #CA8A04 y tipografía Luxury Serif (Cormorant + Montserrat). Editorial, reservado y con jerarquía tipográfica de menú degustación — lujo sin exceso visual.',
    recommendation:
      'Restaurantes de alta cocina, chef table, cavas con maridaje, menús degustación, omakase premium en sala clara y venues donde el ticket y la experiencia son el protagonista.',
    designSystemQuery: 'fine dining luxury hospitality gold liquid glass cormorant',
    typography: {
      headingFont: 'Cormorant, Georgia, serif',
      bodyFont: 'Montserrat, system-ui, sans-serif',
      headingWeight: 600,
      bodyWeight: 400,
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Cormorant:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600;700&display=swap',
      mood: 'luxury, high-end, refined, premium, hospitality',
    },
    style: {
      name: 'Liquid Glass',
      keywords: ['luxury', 'gold', 'refined', 'premium', 'editorial'],
      borderRadius: 'rounded',
      cardRadiusPx: 10,
      categoryTabStyle: 'underline',
    },
    colors: c({
      primary: '#1C1917',
      secondary: '#44403C',
      accent: '#CA8A04',
      background: '#FAFAF9',
      surface: '#FFFFFF',
      text: '#0C0A09',
      textMuted: '#44403C',
      textSecondary: '#57534E',
      border: '#E7E5E4',
      categoryActive: '#0C0A09',
      categoryIndicator: '#CA8A04',
      price: '#0C0A09',
      priceSale: '#CA8A04',
      discountBadgeBg: '#F5F5F4',
      discountBadgeText: '#92400E',
      coverPlaceholderFrom: '#A8A29E',
      coverPlaceholderTo: '#1C1917',
      coverScrim: 'linear-gradient(to top, rgba(12, 10, 9, 0.48), transparent)',
      floatButtonBg: 'rgba(250, 250, 249, 0.94)',
      floatButtonText: '#0C0A09',
      logoBorder: '#FAFAF9',
      logoPlaceholderBg: '#F5F5F4',
      productThumbBg: '#F5F5F4',
    }),
  },
  {
    id: 'antojo-urbano',
    name: 'Antojo Urbano',
    label: 'Antojo',
    description:
      'Naranja callejero, bloques bold y sans geométrica — puestos, esquites y antojitos de avenida.',
    bestFor: ['Antojitos', 'Puesto callejero', 'Comida rápida urbana'],
    context:
      'Vibrant & Block-based con naranja #EA580C, ámbar y Outfit + Rubik bold. Energía de puesto en la esquina: menú corto, precios visibles y colores que invitan al antojo inmediato.',
    recommendation:
      'Puestos de esquites, elotes, tortas ambulantes, marquesitas, antojerías urbanas y menús cortos de comida rápida mexicana con promos del día y combos accesibles.',
    designSystemQuery: 'street food casual urban orange vibrant block outfit rubik',
    typography: {
      headingFont: 'Outfit, system-ui, sans-serif',
      bodyFont: 'Rubik, system-ui, sans-serif',
      headingWeight: 700,
      bodyWeight: 400,
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Rubik:wght@300;400;500;600;700&display=swap',
      mood: 'bold, urban, playful, street, energetic',
    },
    style: {
      name: 'Vibrant & Block-based',
      keywords: ['orange', 'bold', 'block layout', 'street', 'energetic'],
      borderRadius: 'sharp',
      cardRadiusPx: 10,
      categoryTabStyle: 'filled',
    },
    colors: c({
      primary: '#EA580C',
      secondary: '#F97316',
      accent: '#FBBF24',
      background: '#FFF7ED',
      surface: '#FFFFFF',
      text: '#431407',
      textMuted: '#9A3412',
      textSecondary: '#C2410C',
      border: '#FED7AA',
      categoryActive: '#FFFFFF',
      categoryIndicator: '#EA580C',
      price: '#431407',
      coverPlaceholderFrom: '#FB923C',
      coverPlaceholderTo: '#EA580C',
      coverScrim: 'linear-gradient(to top, rgba(67, 20, 7, 0.38), transparent)',
      floatButtonBg: 'rgba(255, 255, 255, 0.94)',
      floatButtonText: '#431407',
      logoBorder: '#FFFFFF',
      logoPlaceholderBg: '#FFEDD5',
      productThumbBg: '#FFEDD5',
    }),
  },
];
