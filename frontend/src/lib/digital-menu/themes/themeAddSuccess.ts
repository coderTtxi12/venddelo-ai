/**
 * Vivid "Agregado" feedback per digital menu theme.
 * Each color is chosen to harmonize with the theme palette (primary/accent)
 * while staying fluorescent enough to read as instant success confirmation.
 */
export type ThemeAddSuccessTokens = {
  addSuccess: string;
  addSuccessText: string;
};

export const THEME_ADD_SUCCESS: Record<string, ThemeAddSuccessTokens> = {
  // Neutral slate — electric mint pops against dark CTA
  original: { addSuccess: '#00E676', addSuccessText: '#0A1628' },
  // Delivery green accent — brighter neon sibling
  'original-verde': { addSuccess: '#00FF94', addSuccessText: '#0A1628' },
  // Red + gold — chartreuse contrasts appetite red
  'clasico-rojo': { addSuccess: '#7FFF00', addSuccessText: '#1A0505' },

  // ── Soft & color (tinted surfaces) ──
  'soft-order': { addSuccess: '#00E676', addSuccessText: '#1C1917' },
  'bubble-mint': { addSuccess: '#00FF9C', addSuccessText: '#064E3B' },
  'peach-soft': { addSuccess: '#FF6B9A', addSuccessText: '#4C0519' },
  'berry-soft': { addSuccess: '#E879F9', addSuccessText: '#4A044E' },
  'sky-soft': { addSuccess: '#00D9FF', addSuccessText: '#0C4A6E' },
  'citrus-soft': { addSuccess: '#A3E635', addSuccessText: '#1A2E05' },
  'ink-blue': { addSuccess: '#00E5FF', addSuccessText: '#1E3A8A' },
  'forest-clean': { addSuccess: '#76FF03', addSuccessText: '#022C22' },
  'amber-pulse': { addSuccess: '#00E676', addSuccessText: '#0F172A' },
  'slate-indigo': { addSuccess: '#A5B4FC', addSuccessText: '#1E1B4B' },
  'teal-trust': { addSuccess: '#00FFBB', addSuccessText: '#134E4A' },
  'editorial-ink': { addSuccess: '#FFD700', addSuccessText: '#1C1917' },
  'rose-neutral': { addSuccess: '#FF6B9A', addSuccessText: '#4C0519' },
  'graphite-lime': { addSuccess: '#A3E635', addSuccessText: '#18181B' },
  'copper-modern': { addSuccess: '#FFAA00', addSuccessText: '#431407' },

  // ── Pure white canvas essentials ──
  'white-crimson': { addSuccess: '#00E676', addSuccessText: '#111827' },
  'white-violet': { addSuccess: '#C4B5FD', addSuccessText: '#1E1B4B' },
  'white-navy': { addSuccess: '#00E5FF', addSuccessText: '#111827' },
  'white-emerald': { addSuccess: '#76FF03', addSuccessText: '#111827' },
  'white-fuchsia': { addSuccess: '#FF6B9A', addSuccessText: '#111827' },
  'white-amber': { addSuccess: '#00E676', addSuccessText: '#111827' },
  'white-cyan': { addSuccess: '#00D9FF', addSuccessText: '#111827' },
  'white-royal': { addSuccess: '#A5B4FC', addSuccessText: '#111827' },
  'white-wine': { addSuccess: '#FF6B9A', addSuccessText: '#111827' },
  'white-olive': { addSuccess: '#A3E635', addSuccessText: '#111827' },
  'white-sunset': { addSuccess: '#00E676', addSuccessText: '#111827' },
  'white-ocean': { addSuccess: '#00FFBB', addSuccessText: '#111827' },
  'white-plum': { addSuccess: '#E879F9', addSuccessText: '#111827' },
  'white-impact': { addSuccess: '#7FFF00', addSuccessText: '#111827' },
  'white-graphite': { addSuccess: '#A3E635', addSuccessText: '#111827' },
  'white-blush': { addSuccess: '#00E676', addSuccessText: '#7A3A52' },
  // Rose + blue — tropical neon mint vs pink
  'taqueria-viva': { addSuccess: '#00F5A0', addSuccessText: '#0A1628' },
  // Magenta + gold — vivid lemon gold flash
  'trattoria-roma': { addSuccess: '#FFE566', addSuccessText: '#4A0A2A' },
  // Black + gold — neon jade on dark luxury
  'sushi-zen': { addSuccess: '#4DFF88', addSuccessText: '#0A0A0A' },
  // Coffee brown + amber — fluorescent honey
  'cafe-artesanal': { addSuccess: '#FFDD00', addSuccessText: '#3D2008' },
  'burger-bold': { addSuccess: '#7FFF00', addSuccessText: '#1A0505' },
  // Cyan + fresh green — electric aqua-green
  'ensalada-fresca': { addSuccess: '#00FF9C', addSuccessText: '#043A4A' },
  // Black + gold luxury — pure vivid gold
  'fine-dining-oro': { addSuccess: '#FFD700', addSuccessText: '#1C1917' },
  // Purple neon street — classic neon green sign
  'street-neon': { addSuccess: '#39FF14', addSuccessText: '#1A0A2E' },
  // Sea green + teal — electric turquoise
  'mariscos-costa': { addSuccess: '#00FFD0', addSuccessText: '#023D2A' },
  // Italian red + green — lime flash
  'pizzeria-napoli': { addSuccess: '#6EFF00', addSuccessText: '#4A0808' },
  // Sweet pink — hot pink neon
  'pasteleria-dulce': { addSuccess: '#FF69F0', addSuccessText: '#FFFFFF' },
  // Korean red + blue — neon mint vs charcoal red
  'korean-bbq': { addSuccess: '#00FF87', addSuccessText: '#1A0508' },
  // Saffron spice — electric teal cools warm palette
  'curry-india': { addSuccess: '#00E5A0', addSuccessText: '#4A2000' },
  // Navy + gold — electric mint vs blue
  'bistro-frances': { addSuccess: '#00FFAA', addSuccessText: '#0A1840' },
  // Smoky brown — fluorescent amber ember
  'bbq-humo': { addSuccess: '#FFAA00', addSuccessText: '#3D2008' },
  // Forest vegan — lime neon
  'vegan-verde': { addSuccess: '#76FF03', addSuccessText: '#0A3018' },
  // Wine burgundy — vivid champagne
  'cava-vino': { addSuccess: '#FFD54F', addSuccessText: '#3D1008' },
  // Retro diner — classic neon OPEN green
  'diner-retro': { addSuccess: '#00FF66', addSuccessText: '#0A1840' },
  // Terracotta mediterranean — vivid lawn green
  mediterraneo: { addSuccess: '#7CFC00', addSuccessText: '#4A2818' },
  // Thai green + orange — hot coral neon
  'thai-vibrante': { addSuccess: '#FF3366', addSuccessText: '#FFFFFF' },
  // Miso brown — vivid egg-yolk yellow
  'ramen-miso': { addSuccess: '#FFEE00', addSuccessText: '#5C3A08' },
  // Hawaiian ocean — tropical neon aqua
  'poke-hawaiian': { addSuccess: '#00FFBB', addSuccessText: '#043848' },
  // Steakhouse dark red — chartreuse flash
  'steak-carbon': { addSuccess: '#C6FF00', addSuccessText: '#2A0808' },
  // Chinese red + gold — jade neon
  'dim-sum-china': { addSuccess: '#00FF7F', addSuccessText: '#5C0810' },
  // Peruvian sky blue — coastal neon green
  'ceviche-peru': { addSuccess: '#00FF88', addSuccessText: '#043A58' },
  // Aegean blue + orange — vivid sun yellow
  'griego-aegeo': { addSuccess: '#FFE135', addSuccessText: '#0A2860' },
  // Pho warm broth — fresh herb neon
  'pho-saigon': { addSuccess: '#00FFA3', addSuccessText: '#4A2808' },
  // Pastel gelato — electric sky blue pop
  'helado-gelato': { addSuccess: '#00D9FF', addSuccessText: '#4A0828' },
  // Caribbean red — tropical aqua
  'cubano-caribe': { addSuccess: '#00FFCC', addSuccessText: '#4A0808' },
  'tex-mex-cantina': { addSuccess: '#CCFF00', addSuccessText: '#4A0810' },
  // Food truck yellow + red — go-signal green
  'food-truck': { addSuccess: '#00FF66', addSuccessText: '#4A3800' },
  // Organic farm — electric harvest lime
  'granja-organica': { addSuccess: '#AAFF00', addSuccessText: '#2A4008' },
  // Dark lounge + gold — neon against night
  'lounge-nocturno': { addSuccess: '#00FF94', addSuccessText: '#1A1408' },
  // Brunch orange — fresh morning mint
  'brunch-dorado': { addSuccess: '#00E676', addSuccessText: '#4A2800' },
  // Lebanese phoenix — mediterranean mint
  'libanes-fenix': { addSuccess: '#00FF9F', addSuccessText: '#4A2008' },
  // Septiembre — vivid gold bandera
  'septiembre-patrio': { addSuccess: '#FFD700', addSuccessText: '#004D30' },
  // Grito — vivid green on gold/red
  'grito-independencia': { addSuccess: '#00FF7F', addSuccessText: '#8A0000' },
  // Día de Muertos — fluorescent magenta ofrenda
  'dia-muertos': { addSuccess: '#FF00AA', addSuccessText: '#FFFFFF' },
  // Mundial — pitch neon green
  'mundial-2026': { addSuccess: '#00FF88', addSuccessText: '#004D30' },
  // Navidad — vivid holly green
  'navidad-posadas': { addSuccess: '#00FF66', addSuccessText: '#5C0810' },
  // Cinco de Mayo — party gold
  'cinco-mayo': { addSuccess: '#FFE000', addSuccessText: '#004D30' },
  // Revolución — field lime
  'revolucion-mx': { addSuccess: '#AAFF00', addSuccessText: '#3D2A14' },
  // ── Pure black (#000000) themes ──
  'obsidiana-oro': { addSuccess: '#FFD700', addSuccessText: '#000000' },
  'neon-tokyo': { addSuccess: '#39FF14', addSuccessText: '#000000' },
  'carbon-bbq': { addSuccess: '#7FFF00', addSuccessText: '#1A0500' },
  'midnight-taco': { addSuccess: '#00FF88', addSuccessText: '#000000' },
  'void-omakase': { addSuccess: '#4DFF88', addSuccessText: '#000000' },
  'noir-copa': { addSuccess: '#00FFAA', addSuccessText: '#000000' },
  'cyber-void': { addSuccess: '#39FF14', addSuccessText: '#0A0014' },
  'lampara-ramen': { addSuccess: '#00FF66', addSuccessText: '#1A0500' },
  'abisal-mar': { addSuccess: '#00FFBB', addSuccessText: '#000000' },
  'forno-notte': { addSuccess: '#7FFF00', addSuccessText: '#1A0505' },
  // Subway green on black — vivid neon flash vs brand green
  'subway-nocturno': { addSuccess: '#39FF14', addSuccessText: '#000000' },
};
