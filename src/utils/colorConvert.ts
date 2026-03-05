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

// ── 内部工具 ──────────────────────────────────────────────────────────────────

/** 整数 clamp 到 [0, 255] 并转 2 位 hex */
function byteHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

/** 解析 2 位 hex 子串为整数 */
function parseHex2(s: string, offset: number): number {
  return parseInt(s.charAt(offset) + s.charAt(offset + 1), 16) || 0;
}

// ── 公开 API ──────────────────────────────────────────────────────────────────

/** 将 3/4 位短 hex 扩展为 6/8 位标准 hex */
export function expandHex(hex: string): string {
  const len = hex.length;
  if (len === 4) {
    const r = hex.charAt(1), g = hex.charAt(2), b = hex.charAt(3);
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (len === 5) {
    const r = hex.charAt(1), g = hex.charAt(2), b = hex.charAt(3), a = hex.charAt(4);
    return `#${r}${r}${g}${g}${b}${b}${a}${a}`;
  }
  return hex;
}

/**
 * 标准化 hex：展开短格式 → 小写 → 去除尾部全不透明 alpha（#rrggbbff → #rrggbb）
 *
 * 用途：比较两个颜色值是否「视觉等价」。
 */
export function normalizeHex(hex: string): string {
  const expanded = expandHex(hex).toLowerCase();
  // 9 字符 = # + 8 hex digits；尾部 ff 表示完全不透明，可省略
  if (expanded.length === 9 && expanded.charAt(7) === 'f' && expanded.charAt(8) === 'f') {
    return expanded.slice(0, 7);
  }
  return expanded;
}

/** hex → RGBA 对象 */
export function hexToRGBA(hex: string): RGBA {
  const full = expandHex(hex);
  // 跳过 '#' = offset 1
  return {
    r: parseHex2(full, 1),
    g: parseHex2(full, 3),
    b: parseHex2(full, 5),
    a: full.length === 9 ? parseHex2(full, 7) / 255 : 1,
  };
}

/**
 * hex → CSS rgba() 字符串。
 *
 * 替代 chroma-js 依赖——在标签背景、边框等场景生成带透明度的 CSS 颜色。
 */
export function hexToRgbaString(hex: string, alpha: number): string {
  const { r, g, b } = hexToRGBA(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** RGBA → hex */
export function rgbaToHex(r: number, g: number, b: number, a: number = 1): string {
  const alphaHex = a < 1 ? byteHex(a * 255) : '';
  return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}${alphaHex}`;
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
