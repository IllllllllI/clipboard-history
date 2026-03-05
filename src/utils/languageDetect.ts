/**
 * 代码语言自动检测工具
 *
 * 改进设计：
 * - 加权评分：每条模式携带 weight（1 = 弱线索，2 = 中等特征，3 = 决定性标志）
 * - 高置信早退：单语言得分超过阈值时立即返回，跳过剩余语言
 * - 输入采样：长文本只取首尾片段检测，避免对整段大文本逐一 regex
 * - LRU 缓存：根据 (前缀 hash + 长度) 缓存检测结果，同一文本不重复检测
 * - 语言扩展正确映射：Go / Shell 不再错误映射到 JavaScript
 */

import type { Extension } from '@codemirror/state';

// ============================================================================
// 语言定义
// ============================================================================

export type LanguageId =
  | 'javascript' | 'typescript' | 'jsx' | 'tsx'
  | 'python' | 'rust' | 'java' | 'cpp' | 'c'
  | 'html' | 'css' | 'scss'
  | 'json' | 'yaml' | 'xml' | 'svg'
  | 'sql' | 'markdown' | 'php'
  | 'go' | 'shell'
  | 'plaintext';

/** 模式权重：越高说明该模式越能唯一标识语言 */
const W = { WEAK: 1, MID: 2, STRONG: 3 } as const;

interface WeightedPattern {
  re: RegExp;
  w: number; // 权重
}

interface LanguageDef {
  id: LanguageId;
  label: string;
  patterns: WeightedPattern[];
}

// ============================================================================
// 辅助：快捷构造函数
// ============================================================================

const p = (re: RegExp, w: number = W.MID): WeightedPattern => ({ re, w });

// ============================================================================
// 语言特征库（按检测优先级排列，高特异性语言在前）
// ============================================================================

const LANGUAGES: LanguageDef[] = [
  // ── TSX（TS + JSX 交叉特征） ──
  {
    id: 'tsx',
    label: 'TSX',
    patterns: [
      p(/:\s*(React\.FC|JSX\.Element|ReactNode)\b/, W.STRONG),
      p(/\bconst\s+\w+\s*:\s*\w+.*=.*<\w/, W.STRONG),
      p(/<\w+[^>]*\s(className|onClick|onChange)\s*=/, W.MID),
      p(/\breturn\s*\(\s*<.*\bclassName\b/, W.MID),
      p(/\binterface\s+\w+Props\b/, W.STRONG),
    ],
  },
  // ── TypeScript ──
  {
    id: 'typescript',
    label: 'TypeScript',
    patterns: [
      p(/\binterface\s+\w+\s*\{/, W.STRONG),
      p(/\btype\s+\w+\s*=\s*/, W.STRONG),
      p(/:\s*(string|number|boolean|void|any|never|unknown)\b/, W.MID),
      p(/\bas\s+(string|number|boolean|any|const)\b/, W.MID),
      p(/\b(enum|namespace|declare)\s+\w+/, W.STRONG),
      p(/<\w+>\s*\(/, W.WEAK),
    ],
  },
  // ── JSX ──
  {
    id: 'jsx',
    label: 'JSX',
    patterns: [
      p(/\breturn\s*\(\s*</, W.MID),
      p(/<\w+[^>]*\s(className|onClick|onChange)\s*=/, W.MID),
      p(/\b(useState|useEffect|useCallback|useMemo|useRef)\s*\(/, W.STRONG),
      p(/\bReact\.(createElement|memo|forwardRef)\b/, W.STRONG),
    ],
  },
  // ── JavaScript ──
  {
    id: 'javascript',
    label: 'JavaScript',
    patterns: [
      p(/\b(const|let|var)\s+\w+\s*=\s*(function|\(|async|\[|\{|require\()/, W.MID),
      p(/\bfunction\s+\w+\s*\(/, W.WEAK),
      p(/\b(module\.exports|exports\.\w+|require\()/, W.STRONG),
      p(/\bconsole\.(log|warn|error)\(/, W.MID),
      p(/=>\s*\{/, W.WEAK),
      p(/\bnew\s+(Promise|Map|Set|Array|Error)\b/, W.WEAK),
      p(/\bimport\s+.*\s+from\s+['"]/, W.MID),
      p(/\bexport\s+(default|const|function|class)\b/, W.MID),
    ],
  },
  // ── Rust ──
  {
    id: 'rust',
    label: 'Rust',
    patterns: [
      p(/\bfn\s+\w+\s*(<.*>)?\s*\(/, W.STRONG),
      p(/\b(pub\s+)?(struct|enum|trait|impl|mod)\s+\w+/, W.STRONG),
      p(/\blet\s+(mut\s+)?\w+\s*(:\s*\w+)?\s*=/, W.MID),
      p(/#\[(derive|test|cfg|allow|warn|macro)\b/, W.STRONG),
      p(/\b(println!|format!|vec!|eprintln!|panic!)\s*\(/, W.STRONG),
      p(/\b(Ok|Err|Some|None)\s*\(/, W.MID),
      p(/\b(Result|Option)<.*>/, W.MID),
      p(/->\s*(Self|&|[A-Z]\w*)/, W.MID),
      p(/\b(unwrap|expect|map_err|and_then)\s*\(/, W.WEAK),
    ],
  },
  // ── Python ──
  {
    id: 'python',
    label: 'Python',
    patterns: [
      p(/\bdef\s+\w+\s*\(/, W.STRONG),
      p(/\bclass\s+\w+\s*(\(.*\))?:\s*$/m, W.STRONG),
      p(/\bfrom\s+\w+\s+import\b/, W.STRONG),
      p(/\bif\s+__name__\s*==\s*['"]__main__['"]/, W.STRONG),
      p(/\b(self|cls)\.\w+/, W.STRONG),
      p(/\bprint\s*\(/, W.WEAK),
      p(/^\s*@\w+\s*$/m, W.MID),
      p(/\b(elif|except|finally|yield|lambda)\b/, W.MID),
    ],
  },
  // ── Java ──
  {
    id: 'java',
    label: 'Java',
    patterns: [
      p(/\bpublic\s+(static\s+)?class\s+\w+/, W.STRONG),
      p(/\bpublic\s+static\s+void\s+main\s*\(/, W.STRONG),
      p(/\bSystem\.(out|err)\.(print|println)\(/, W.STRONG),
      p(/\b(private|protected|public)\s+(static\s+)?(final\s+)?\w+\s+\w+\s*[=(;]/, W.MID),
      p(/\bpackage\s+[\w.]+;/, W.STRONG),
      p(/\bimport\s+[\w.*]+;/, W.MID),
      p(/@Override\b/, W.STRONG),
    ],
  },
  // ── C++ ──
  {
    id: 'cpp',
    label: 'C++',
    patterns: [
      p(/\bstd::\w+/, W.STRONG),
      p(/\busing\s+namespace\s+std\b/, W.STRONG),
      p(/\bcout\s*<</, W.STRONG),
      p(/\b(template\s*<|nullptr|constexpr)\b/, W.STRONG),
      p(/\b#include\s*<\w+>/, W.MID),
      p(/\bint\s+main\s*\(\s*(int\s+argc|void)?\s*[\),]/, W.MID),
      p(/\bclass\s+\w+\s*:\s*(public|private|protected)\b/, W.STRONG),
    ],
  },
  // ── C ──
  {
    id: 'c',
    label: 'C',
    patterns: [
      p(/\b#include\s*<(stdio|stdlib|string|math)\.h>/, W.STRONG),
      p(/\bprintf\s*\(/, W.MID),
      p(/\bscanf\s*\(/, W.STRONG),
      p(/\bmalloc\s*\(/, W.STRONG),
      p(/\btypedef\s+(struct|enum|union)\b/, W.STRONG),
    ],
  },
  // ── Go ──
  {
    id: 'go',
    label: 'Go',
    patterns: [
      p(/\bfunc\s+\w+\s*\(/, W.MID),
      p(/\bpackage\s+(main|fmt|net|os|io)\b/, W.STRONG),
      p(/\bfmt\.(Print|Sprint|Fprint)(f|ln)?\s*\(/, W.STRONG),
      p(/\b(chan\s+\w|go\s+func|defer\s+\w)\b/, W.STRONG),
      p(/:=\s*/, W.MID),
      p(/\bfunc\s*\(\w+\s+\*?\w+\)\s+\w+\(/, W.STRONG),
    ],
  },
  // ── PHP ──
  {
    id: 'php',
    label: 'PHP',
    patterns: [
      p(/<\?php\b/, W.STRONG),
      p(/\$\w+\s*=/, W.MID),
      p(/\bfunction\s+\w+\s*\(.*\$\w+/, W.STRONG),
      p(/\b(echo|print_r|var_dump)\s*[\(;]/, W.STRONG),
      p(/->\s*\w+\s*\(/, W.WEAK),
    ],
  },
  // ── Shell ──
  {
    id: 'shell',
    label: 'Shell',
    patterns: [
      p(/^#!\s*\/bin\/(bash|sh|zsh)/m, W.STRONG),
      p(/\becho\s+["'$]/, W.MID),
      p(/\bif\s*\[\s*["-$]/, W.MID),
      p(/\b(apt-get|yum|brew|pip|npm|cargo)\s+(install|update)/, W.STRONG),
      p(/\$\{\w+[:#%/]/, W.STRONG),       // 参数展开语法 ${var:-default}
      p(/\bexport\s+\w+=/, W.MID),
      p(/\bfi\b.*$|^\s*done\s*$/m, W.MID),
    ],
  },
  // ── HTML ──
  {
    id: 'html',
    label: 'HTML',
    patterns: [
      p(/<!DOCTYPE\s+html>/i, W.STRONG),
      p(/<html[\s>]/i, W.STRONG),
      p(/<(head|body)\b/i, W.STRONG),
      p(/<(div|span|p|a|img|script|style|link|meta|form|input|button|table|ul|ol|li|h[1-6])\b/i, W.WEAK),
    ],
  },
  // ── SVG ──
  {
    id: 'svg',
    label: 'SVG',
    patterns: [
      p(/<svg[\s>]/i, W.STRONG),
      p(/\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/, W.STRONG),
      p(/<(path|circle|rect|line|polygon|g)\b/i, W.MID),
    ],
  },
  // ── XML ──
  {
    id: 'xml',
    label: 'XML',
    patterns: [
      p(/<\?xml\s+version\s*=/i, W.STRONG),
      p(/xmlns[:=]/, W.MID),
      p(/<\/\w+:\w+>/, W.MID),
    ],
  },
  // ── CSS ──
  {
    id: 'css',
    label: 'CSS',
    patterns: [
      p(/[\w.#\-[\]]+\s*\{[^}]*\b(color|margin|padding|display|font|background|border|width|height)\s*:/, W.STRONG),
      p(/@(media|keyframes|font-face)\s/, W.STRONG),
      p(/\b(flex|grid|block|inline|none|relative|absolute|fixed)\s*;/, W.WEAK),
    ],
  },
  // ── SCSS ──
  {
    id: 'scss',
    label: 'SCSS',
    patterns: [
      p(/\$[\w-]+\s*:\s*/, W.MID),
      p(/&\.\w+/, W.STRONG),
      p(/@mixin\s+\w+/, W.STRONG),
      p(/@include\s+\w+/, W.STRONG),
    ],
  },
  // ── JSON ──
  {
    id: 'json',
    label: 'JSON',
    patterns: [
      p(/^\s*\{[^]*?"[\w-]+":\s*/m, W.WEAK),
      p(/^\s*\[[^]*?\{[^]*?"[\w-]+":/m, W.WEAK),
    ],
  },
  // ── YAML ──
  {
    id: 'yaml',
    label: 'YAML',
    patterns: [
      p(/^---\s*$/m, W.STRONG),
      p(/^\w[\w-]*:\s+\S/m, W.WEAK),
      p(/^\s+-\s+\w[\w-]*:\s+\S/m, W.MID),
    ],
  },
  // ── SQL ──
  {
    id: 'sql',
    label: 'SQL',
    patterns: [
      p(/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i, W.STRONG),
      p(/\b(FROM|WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET)\b/i, W.MID),
      p(/\b(PRIMARY\s+KEY|FOREIGN\s+KEY|NOT\s+NULL|AUTO_INCREMENT|DEFAULT)\b/i, W.MID),
    ],
  },
  // ── Markdown ──
  {
    id: 'markdown',
    label: 'Markdown',
    patterns: [
      p(/^#{1,6}\s+\S/m, W.MID),
      p(/\[.+?\]\(.+?\)/, W.MID),
      p(/```\w*\n/, W.STRONG),
      p(/\*\*\w+\*\*/, W.MID),
      p(/^>\s+\S/m, W.WEAK),
    ],
  },
];

// ============================================================================
// 检测引擎
// ============================================================================

export interface DetectResult {
  id: LanguageId;
  label: string;
}

/** 输入采样：长文本只取首尾片段 */
const SAMPLE_THRESHOLD = 2000;
const SAMPLE_HEAD = 1500;
const SAMPLE_TAIL = 500;

function sampleText(code: string): string {
  if (code.length <= SAMPLE_THRESHOLD) return code;
  return code.slice(0, SAMPLE_HEAD) + '\n' + code.slice(-SAMPLE_TAIL);
}

/** 高置信早退阈值（加权得分） */
const EARLY_EXIT_SCORE = 6;

// ── LRU 检测缓存 ──────────────────────────────────────────────────────────

const CACHE_MAX = 64;
const CACHE_KEY_LEN = 200; // 取前 N 字符作 key 前缀

function cacheKey(code: string): string {
  return `${code.length}:${code.slice(0, CACHE_KEY_LEN)}`;
}

const detectCache = new Map<string, DetectResult>();

function cachePut(key: string, value: DetectResult): void {
  if (detectCache.size >= CACHE_MAX) {
    // 淘汰最旧条目（Map 按插入顺序迭代）
    const oldest = detectCache.keys().next().value;
    if (oldest !== undefined) detectCache.delete(oldest);
  }
  detectCache.set(key, value);
}

// ── JSON 快速路径 ──────────────────────────────────────────────────────────

const JSON_PREFIX_LEN = 512;

function isLikelyJson(trimmed: string): boolean {
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return false;
  // 对短文本完整 parse；对长文本只截取前缀做结构嗅探
  if (trimmed.length <= JSON_PREFIX_LEN) {
    try { JSON.parse(trimmed); return true; } catch { return false; }
  }
  // 长文本：检查前 N 字符是否符合 JSON 结构（高精度启发式）
  const prefix = trimmed.slice(0, JSON_PREFIX_LEN);
  return /^\s*[\[{]/.test(prefix)
    && /"[\w$@\-.]+":\s*/.test(prefix)
    && !/\b(function|const|let|var|import|export|class|def|fn|pub)\b/.test(prefix);
}

// ── 主检测函数 ─────────────────────────────────────────────────────────────

/**
 * 自动检测代码语言
 *
 * 加权评分 + LRU 缓存 + 输入采样 + 高置信早退。
 */
export function detectLanguage(code: string): DetectResult {
  const key = cacheKey(code);
  const cached = detectCache.get(key);
  if (cached) return cached;

  const trimmed = code.trim();
  if (trimmed.length === 0) return result('plaintext', '纯文本', key);

  // JSON 快速路径
  if (isLikelyJson(trimmed)) {
    return result('json', 'JSON', key);
  }

  const sample = sampleText(trimmed);

  let bestScore = 0;
  let bestLang: LanguageDef | null = null;

  for (const lang of LANGUAGES) {
    let score = 0;
    for (const { re, w } of lang.patterns) {
      if (re.test(sample)) score += w;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
      // 高置信早退
      if (bestScore >= EARLY_EXIT_SCORE) break;
    }
  }

  if (bestLang && bestScore >= 2) {
    return result(bestLang.id, bestLang.label, key);
  }

  return result('plaintext', '纯文本', key);
}

function result(id: LanguageId, label: string, cacheKeyStr: string): DetectResult {
  const r: DetectResult = { id, label };
  cachePut(cacheKeyStr, r);
  return r;
}

// ============================================================================
// CodeMirror 扩展加载器
// ============================================================================

const extensionLoaderMap: Record<LanguageId, () => Promise<Extension>> = {
  tsx: async () => {
    const mod = await import('@codemirror/lang-javascript');
    return mod.javascript({ jsx: true, typescript: true });
  },
  typescript: async () => {
    const mod = await import('@codemirror/lang-javascript');
    return mod.javascript({ typescript: true });
  },
  jsx: async () => {
    const mod = await import('@codemirror/lang-javascript');
    return mod.javascript({ jsx: true });
  },
  javascript: async () => {
    const mod = await import('@codemirror/lang-javascript');
    return mod.javascript();
  },
  python: async () => (await import('@codemirror/lang-python')).python(),
  rust: async () => (await import('@codemirror/lang-rust')).rust(),
  java: async () => (await import('@codemirror/lang-java')).java(),
  cpp: async () => (await import('@codemirror/lang-cpp')).cpp(),
  c: async () => (await import('@codemirror/lang-cpp')).cpp(),
  html: async () => (await import('@codemirror/lang-html')).html(),
  css: async () => (await import('@codemirror/lang-css')).css(),
  scss: async () => (await import('@codemirror/lang-css')).css(),
  json: async () => (await import('@codemirror/lang-json')).json(),
  yaml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  xml: async () => (await import('@codemirror/lang-xml')).xml(),
  svg: async () => (await import('@codemirror/lang-xml')).xml(),
  sql: async () => (await import('@codemirror/lang-sql')).sql(),
  markdown: async () => (await import('@codemirror/lang-markdown')).markdown(),
  php: async () => (await import('@codemirror/lang-php')).php(),
  // Go / Shell 无已安装专用扩展 → 回退纯文本而非错误映射到 JavaScript
  go: async () => [],
  shell: async () => [],
  plaintext: async () => [],
};

const extensionCache = new Map<LanguageId, Promise<Extension>>();

export async function loadLanguageExtension(id: LanguageId): Promise<Extension> {
  const cached = extensionCache.get(id);
  if (cached) return cached;

  const loader = extensionLoaderMap[id] ?? extensionLoaderMap.plaintext;
  const loading = loader().catch(() => [] as Extension);
  extensionCache.set(id, loading);
  return loading;
}

// ============================================================================
// 语言列表（单例）
// ============================================================================

let _availableLanguages: { id: LanguageId; label: string }[] | null = null;

/**
 * 获取所有可用语言列表（用于语言选择器下拉框）
 * 冻结单例，避免每次调用重建数组。
 */
export function getAvailableLanguages(): { id: LanguageId; label: string }[] {
  if (!_availableLanguages) {
    _availableLanguages = Object.freeze([
      ...LANGUAGES.map(l => ({ id: l.id, label: l.label })),
      { id: 'plaintext' as LanguageId, label: '纯文本' },
    ]) as { id: LanguageId; label: string }[];
  }
  return _availableLanguages;
}
