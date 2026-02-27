import chroma from 'chroma-js';

/** Hex 转 RGBA 字符串 */
export const hexToRgba = (hex: string, alpha: number): string =>
  chroma(hex).alpha(alpha).css();
