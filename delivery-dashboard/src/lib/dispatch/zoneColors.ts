export const ALL_ZONES_ID = 'all';

export type ZoneColor = {
  fill: string;
  stroke: string;
  solid: string;
};

/** Colorblind-safe categorical hues: tracking blue, delivery orange, teal, gold, sky, rust. */
export const ZONE_PALETTE: ZoneColor[] = [
  { fill: '#93C5FD', stroke: '#2563EB', solid: '#2563EB' },
  { fill: '#FDBA74', stroke: '#EA580C', solid: '#EA580C' },
  { fill: '#5EEAD4', stroke: '#0F766E', solid: '#0F766E' },
  { fill: '#FDE68A', stroke: '#CA8A04', solid: '#CA8A04' },
  { fill: '#7DD3FC', stroke: '#0369A1', solid: '#0369A1' },
  { fill: '#FECACA', stroke: '#9A3412', solid: '#9A3412' },
];

export function zoneColorForId(
  zoneId: string | null | undefined,
  zoneIds: string[],
): ZoneColor {
  if (!zoneId) return ZONE_PALETTE[0];
  const index = zoneIds.indexOf(zoneId);
  return ZONE_PALETTE[(index < 0 ? 0 : index) % ZONE_PALETTE.length];
}
