/** 编辑器光标 / 选区信息 */
export interface EditorCursorInfo {
  line: number;
  col: number;
  /** 选中字符数（无选中时为 0） */
  selectedChars: number;
  /** 选中行数（无选中 / 单行时为 0） */
  selectedLines: number;
}

export const INITIAL_CURSOR: EditorCursorInfo = { line: 1, col: 1, selectedChars: 0, selectedLines: 0 };

/** 缩进模式 */
export type IndentStyle = 'spaces' | 'tabs';

/** 可用的缩进宽度 */
export const INDENT_SIZES = [2, 4, 8] as const;
export type IndentSize = (typeof INDENT_SIZES)[number];
