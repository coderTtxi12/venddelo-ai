import type { DigitalMenuTheme } from './types';
import { DIGITAL_MENU_THEMES } from './catalog';
import { buildDigitalMenuThemeSearchText } from './themeSearch';

export type DigitalMenuThemeGroupId =
  | 'essentials'
  | 'soft-color'
  | 'cafe-bakery'
  | 'premium'
  | 'casual-street'
  | 'cuisine'
  | 'world'
  | 'dark'
  | 'seasonal';

export type DigitalMenuThemeGroup = {
  id: DigitalMenuThemeGroupId;
  label: string;
  description: string;
};

const ESSENTIAL_THEME_IDS = new Set([
  'original',
  'original-verde',
  'clasico-rojo',
  'white-crimson',
  'white-violet',
  'white-navy',
  'white-emerald',
  'white-fuchsia',
  'white-amber',
  'white-cyan',
  'white-royal',
  'white-wine',
  'white-olive',
  'white-sunset',
  'white-ocean',
  'white-plum',
  'white-impact',
  'white-graphite',
  'white-blush',
]);

const SOFT_COLOR_THEME_IDS = new Set([
  'soft-order',
  'bubble-mint',
  'peach-soft',
  'berry-soft',
  'sky-soft',
  'citrus-soft',
  'ink-blue',
  'forest-clean',
  'amber-pulse',
  'slate-indigo',
  'teal-trust',
  'editorial-ink',
  'rose-neutral',
  'graphite-lime',
  'copper-modern',
]);

const CAFE_BAKERY_THEME_IDS = new Set([
  'cafe-artesanal',
  'pasteleria-dulce',
  'brunch-dorado',
  'helado-gelato',
  'roastery-latte',
]);

const PREMIUM_THEME_IDS = new Set([
  'fine-dining-oro',
  'cava-vino',
  'steak-carbon',
  'bistro-frances',
  'obsidiana-oro',
  'void-omakase',
  'noir-copa',
  'maitre-elegance',
]);

const CASUAL_STREET_THEME_IDS = new Set([
  'taqueria-viva',
  'burger-bold',
  'food-truck',
  'tex-mex-cantina',
  'diner-retro',
  'street-neon',
  'antojo-urbano',
]);

const CUISINE_THEME_IDS = new Set([
  'trattoria-roma',
  'sushi-zen',
  'ensalada-fresca',
  'mariscos-costa',
  'pizzeria-napoli',
]);

const WORLD_THEME_IDS = new Set([
  'korean-bbq',
  'curry-india',
  'bbq-humo',
  'vegan-verde',
  'mediterraneo',
  'thai-vibrante',
  'ramen-miso',
  'poke-hawaiian',
  'dim-sum-china',
  'ceviche-peru',
  'griego-aegeo',
  'pho-saigon',
  'cubano-caribe',
  'granja-organica',
  'lounge-nocturno',
  'libanes-fenix',
]);

const DARK_THEME_IDS = new Set([
  'neon-tokyo',
  'carbon-bbq',
  'midnight-taco',
  'cyber-void',
  'lampara-ramen',
  'abisal-mar',
  'forno-notte',
  'subway-nocturno',
]);

const SEASONAL_THEME_IDS = new Set([
  'septiembre-patrio',
  'grito-independencia',
  'dia-muertos',
  'mundial-2026',
  'navidad-posadas',
  'cinco-mayo',
  'revolucion-mx',
]);

export const DIGITAL_MENU_THEME_GROUPS: DigitalMenuThemeGroup[] = [
  {
    id: 'essentials',
    label: 'Esenciales',
    description: 'Lienzo blanco puro (como Original): solo cambian acentos y tipografía',
  },
  {
    id: 'soft-color',
    label: 'Soft & color',
    description: 'Fondos blancos con superficies tintadas, acentos vivos y tipografías expresivas',
  },
  {
    id: 'cafe-bakery',
    label: 'Café & panadería',
    description: 'Cafeterías de especialidad, tostadores, panaderías y brunch',
  },
  {
    id: 'premium',
    label: 'Premium & alta cocina',
    description: 'Fine dining, cavas, chef table y experiencias de autor',
  },
  {
    id: 'casual-street',
    label: 'Casual & street food',
    description: 'Taquerías, antojitos, food trucks y comida rápida urbana',
  },
  {
    id: 'cuisine',
    label: 'Por cocina',
    description: 'Temas curados para tipos de comida específicos',
  },
  {
    id: 'world',
    label: 'Internacional',
    description: 'Inspiración global y estilos de mundo',
  },
  {
    id: 'dark',
    label: 'Modo oscuro',
    description: 'Fondos oscuros con acentos vibrantes',
  },
  {
    id: 'seasonal',
    label: 'Festividades MX',
    description: 'Temas de temporada y celebraciones en México',
  },
];

export function getDigitalMenuThemeGroupId(themeId: string): DigitalMenuThemeGroupId {
  if (ESSENTIAL_THEME_IDS.has(themeId)) return 'essentials';
  if (SOFT_COLOR_THEME_IDS.has(themeId)) return 'soft-color';
  if (CAFE_BAKERY_THEME_IDS.has(themeId)) return 'cafe-bakery';
  if (PREMIUM_THEME_IDS.has(themeId)) return 'premium';
  if (CASUAL_STREET_THEME_IDS.has(themeId)) return 'casual-street';
  if (CUISINE_THEME_IDS.has(themeId)) return 'cuisine';
  if (WORLD_THEME_IDS.has(themeId)) return 'world';
  if (DARK_THEME_IDS.has(themeId)) return 'dark';
  if (SEASONAL_THEME_IDS.has(themeId)) return 'seasonal';
  return 'cuisine';
}

export function groupDigitalMenuThemes(
  themes: DigitalMenuTheme[] = DIGITAL_MENU_THEMES,
): Record<DigitalMenuThemeGroupId, DigitalMenuTheme[]> {
  const grouped: Record<DigitalMenuThemeGroupId, DigitalMenuTheme[]> = {
    essentials: [],
    'soft-color': [],
    'cafe-bakery': [],
    premium: [],
    'casual-street': [],
    cuisine: [],
    world: [],
    dark: [],
    seasonal: [],
  };

  for (const theme of themes) {
    grouped[getDigitalMenuThemeGroupId(theme.id)].push(theme);
  }

  return grouped;
}

export function filterDigitalMenuThemes(
  themes: DigitalMenuTheme[],
  query: string,
  activeGroups: DigitalMenuThemeGroupId[] | null,
): DigitalMenuTheme[] {
  const queryTokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return themes.filter((theme) => {
    if (activeGroups && activeGroups.length > 0) {
      const groupId = getDigitalMenuThemeGroupId(theme.id);
      if (!activeGroups.includes(groupId)) return false;
    }

    if (queryTokens.length === 0) return true;

    const groupLabel =
      DIGITAL_MENU_THEME_GROUPS.find((group) => group.id === getDigitalMenuThemeGroupId(theme.id))
        ?.label ?? '';
    const haystack = `${buildDigitalMenuThemeSearchText(theme)} ${groupLabel}`.toLowerCase();
    return queryTokens.every((token) => haystack.includes(token));
  });
}
