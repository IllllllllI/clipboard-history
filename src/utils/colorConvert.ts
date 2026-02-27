// ============================================================================
// 颜色格式转换工具函数
// ============================================================================

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface HSLA {
  h: number;
  s: number;
  l: number;
  a: number;
}

/** 将 3 位 hex 扩展为 6 位，或 4 位扩展为 8 位 */
export function expandHex(hex: string): string {
  if (hex.length === 4) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  if (hex.length === 5) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] + hex[4] + hex[4];
  }
  return hex;
}

/** hex → RGBA */
export function hexToRGBA(hex: string): RGBA {
  const full = expandHex(hex).replace('#', '');
  return {
    r: parseInt(full.substring(0, 2), 16) || 0,
    g: parseInt(full.substring(2, 4), 16) || 0,
    b: parseInt(full.substring(4, 6), 16) || 0,
    a: full.length === 8 ? parseInt(full.substring(6, 8), 16) / 255 : 1,
  };
}

/** RGBA → hex */
export function rgbaToHex(r: number, g: number, b: number, a: number = 1): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  const alphaHex = a < 1 ? toHex(a * 255) : '';
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex}`;
}

/** hex → HSLA */
export function hexToHSLA(hex: string): HSLA {
  const { r, g, b, a } = hexToRGBA(hex);
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100), a };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return { h: Math.round(h * 360) % 360, s: Math.round(s * 100), l: Math.round(l * 100), a };
}

/** HSLA → hex */
export function hslaToHex(h: number, s: number, l: number, a: number = 1): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const aVal = s * Math.min(l, 1 - l);
  const f = (n: number) => l - aVal * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbaToHex(f(0) * 255, f(8) * 255, f(4) * 255, a);
}
