export const RADIAL_MENU_LAYOUT_PRESETS = {
  compact: {
    size: 344,
    innerRadius: 76,
    outerRadius: 132,
    nodeRadius: 102,
    labelRadius: 140,
    sectorSpanDeg: 52,
    pointerTailExtra: 4,
    cancelDeadzoneRadius: 34,
  },
  standard: {
    size: 344,
    innerRadius: 72,
    outerRadius: 136,
    nodeRadius: 108,
    labelRadius: 146,
    sectorSpanDeg: 58,
    pointerTailExtra: 6,
    cancelDeadzoneRadius: 30,
  },
  relaxed: {
    size: 344,
    innerRadius: 68,
    outerRadius: 140,
    nodeRadius: 114,
    labelRadius: 152,
    sectorSpanDeg: 66,
    pointerTailExtra: 8,
    cancelDeadzoneRadius: 26,
  },
} as const;

export const DEFAULT_RADIAL_MENU_LAYOUT = RADIAL_MENU_LAYOUT_PRESETS.standard;

export const MENU_SIZE = DEFAULT_RADIAL_MENU_LAYOUT.size;
export const MENU_CENTER = MENU_SIZE / 2;

export function polarToCartesian(angleDeg: number, radius: number) {
  const rad = angleDeg * (Math.PI / 180);
  return {
    x: MENU_CENTER + Math.cos(rad) * radius,
    y: MENU_CENTER + Math.sin(rad) * radius,
  };
}

export function describeSectorPath(startDeg: number, endDeg: number, innerRadius: number, outerRadius: number): string {
  const startOuter = polarToCartesian(startDeg, outerRadius);
  const endOuter = polarToCartesian(endDeg, outerRadius);
  const endInner = polarToCartesian(endDeg, innerRadius);
  const startInner = polarToCartesian(startDeg, innerRadius);
  const delta = ((endDeg - startDeg) + 360) % 360;
  const largeArc = delta > 180 ? 1 : 0;

  return [
    'M', startOuter.x, startOuter.y,
    'A', outerRadius, outerRadius, 0, largeArc, 1, endOuter.x, endOuter.y,
    'L', endInner.x, endInner.y,
    'A', innerRadius, innerRadius, 0, largeArc, 0, startInner.x, startInner.y,
    'Z',
  ].join(' ');
}
