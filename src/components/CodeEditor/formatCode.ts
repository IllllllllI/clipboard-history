/**
 * 代码格式化工具 — 基于 Prettier + sql-formatter。
 *
 * 支持的语言及后端：
 *  - JS / TS / JSX / TSX → Prettier (babel / babel-ts)
 *  - HTML                → Prettier (html)
 *  - CSS / SCSS          → Prettier (css / scss)
 *  - JSON                → Prettier (json)
 *  - YAML                → Prettier (yaml)
 *  - Markdown            → Prettier (markdown)
 *  - PHP                 → Prettier (php)
 *  - XML / SVG           → Prettier + @prettier/plugin-xml
 *  - SQL                 → sql-formatter
 *  - 其它                → 通用清理（行尾空格 + 末尾空行）
 */

import type { LanguageId } from '../../utils/languageDetect';
import type { IndentStyle, IndentSize } from './types';

// ── Prettier lazy import (tree-shaking friendly) ──
let prettierPromise: Promise<typeof import('prettier')> | null = null;
function loadPrettier() {
  if (!prettierPromise) {
    prettierPromise = import('prettier');
  }
  return prettierPromise;
}

// ── Parser / plugin lazy loaders ──
// Prettier 3.x ESM 需要显式加载每个 parser 插件
const pluginCache = new Map<string, Promise<unknown>>();

function loadPlugin(id: string, loader: () => Promise<unknown>): Promise<unknown> {
  let p = pluginCache.get(id);
  if (!p) {
    p = loader();
    pluginCache.set(id, p);
  }
  return p;
}

const loadHtmlPlugin = () => loadPlugin('html', () => import('prettier/plugins/html'));
const loadBabelPlugin = () => loadPlugin('babel', () => import('prettier/plugins/babel'));
const loadEstreePlugin = () => loadPlugin('estree', () => import('prettier/plugins/estree'));
const loadTsPlugin = () => loadPlugin('typescript', () => import('prettier/plugins/typescript'));
const loadCssPlugin = () => loadPlugin('css', () => import('prettier/plugins/postcss'));
const loadMarkdownPlugin = () => loadPlugin('markdown', () => import('prettier/plugins/markdown'));
const loadYamlPlugin = () => loadPlugin('yaml', () => import('prettier/plugins/yaml'));
const loadXmlPlugin = () => loadPlugin('xml', async () => {
  const mod = await import('@prettier/plugin-xml');
  return mod.default ?? mod;
});

export interface FormatOptions {
  langId: LanguageId;
  indentStyle: IndentStyle;
  indentSize: IndentSize;
}

export interface FormatResult {
  formatted: string;
  changed: boolean;
}

/** Prettier parser 映射 */
type PrettierParser =
  | 'babel'
  | 'babel-ts'
  | 'html'
  | 'css'
  | 'scss'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'xml';

const PRETTIER_PARSER_MAP: Partial<Record<LanguageId, PrettierParser>> = {
  javascript: 'babel',
  jsx: 'babel',
  typescript: 'babel-ts',
  tsx: 'babel-ts',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yaml',
  markdown: 'markdown',
  xml: 'xml',
  svg: 'xml',
};

/** 需要 XML 插件的 parser */
const XML_PARSERS = new Set<string>(['xml']);

/** 按 parser 加载对应插件，利用 Promise.all 保证并发加载 */
async function loadPluginsForParser(parser: PrettierParser): Promise<unknown[]> {
  switch (parser) {
    case 'html':
      return Promise.all([loadHtmlPlugin()]);
    case 'babel':
      return Promise.all([loadBabelPlugin(), loadEstreePlugin()]);
    case 'babel-ts':
      return Promise.all([loadTsPlugin(), loadEstreePlugin()]);
    case 'css':
    case 'scss':
      return Promise.all([loadCssPlugin()]);
    case 'json':
      return Promise.all([loadBabelPlugin(), loadEstreePlugin()]);
    case 'yaml':
      return Promise.all([loadYamlPlugin()]);
    case 'markdown':
      return Promise.all([loadMarkdownPlugin()]);
    case 'xml':
      return Promise.all([loadXmlPlugin()]);
    default:
      return [];
  }
}

/** 所有可格式化的语言（用于 UI 显示） */
export const FORMATTABLE_LANGUAGES = new Set<LanguageId>([
  'javascript', 'typescript', 'jsx', 'tsx',
  'html', 'css', 'scss',
  'json', 'yaml', 'markdown',
  'xml', 'svg',
  'sql',
]);

/**
 * 异步格式化入口。
 *
 * 对不支持的语言仅执行通用清理。
 */
export async function formatCode(
  source: string,
  options: FormatOptions,
): Promise<FormatResult> {
  const { langId, indentStyle, indentSize } = options;

  // SQL → sql-formatter
  if (langId === 'sql') {
    return formatSql(source, indentStyle, indentSize);
  }

  // Prettier 支持的语言
  const parser = PRETTIER_PARSER_MAP[langId];
  if (parser) {
    return formatWithPrettier(source, parser, indentStyle, indentSize);
  }

  // 通用清理
  const cleaned = formatGeneric(source);
  return { formatted: cleaned, changed: cleaned !== source };
}

// ═══════════════════════════════════════════════════════════════════════
// Prettier
// ═══════════════════════════════════════════════════════════════════════

async function formatWithPrettier(
  source: string,
  parser: PrettierParser,
  indentStyle: IndentStyle,
  indentSize: IndentSize,
): Promise<FormatResult> {
  try {
    const prettier = await loadPrettier();
    const plugins = await loadPluginsForParser(parser);

    const formatted = await prettier.format(source, {
      parser,
      plugins,
      useTabs: indentStyle === 'tabs',
      tabWidth: indentSize,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
      semi: true,
      // HTML 特有
      ...(parser === 'html' && {
        htmlWhitespaceSensitivity: 'ignore' as const,
      }),
    });

    return { formatted, changed: formatted !== source };
  } catch (e) {
    console.warn('[formatCode] Prettier format failed, falling back to generic:', e);
    const fallback = formatGeneric(source);
    return { formatted: fallback, changed: fallback !== source };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SQL
// ═══════════════════════════════════════════════════════════════════════

async function formatSql(
  source: string,
  indentStyle: IndentStyle,
  indentSize: IndentSize,
): Promise<FormatResult> {
  try {
    const { format } = await import('sql-formatter');
    const formatted = format(source, {
      tabWidth: indentSize,
      useTabs: indentStyle === 'tabs',
      keywordCase: 'upper',
    });
    return { formatted, changed: formatted !== source };
  } catch (e) {
    console.warn('[formatCode] SQL format failed, falling back to generic:', e);
    const fallback = formatGeneric(source);
    return { formatted: fallback, changed: fallback !== source };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 通用（行尾空格 + 末尾空行）
// ═══════════════════════════════════════════════════════════════════════

function formatGeneric(source: string): string {
  const lines = source.split(/\r\n|\r|\n/);
  const trimmed = lines.map((l) => l.trimEnd());
  while (trimmed.length > 1 && trimmed[trimmed.length - 1] === '') {
    trimmed.pop();
  }
  return trimmed.join('\n') + (source.endsWith('\n') ? '\n' : '');
}
