/**
 * 代码语言自动检测工具
 *
 * 通过特征模式匹配，根据剪贴板内容自动推断编程语言。
 * 语言高亮扩展按需动态加载，避免首包静态引入全部 @codemirror/lang-*。
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

interface LanguageDef {
  id: LanguageId;
  label: string;
  /** 匹配模式（正则数组），按优先级顺序排列 */
  patterns: RegExp[];
}

// ============================================================================
// 语言特征库
// ============================================================================

const LANGUAGES: LanguageDef[] = [
  {
    id: 'tsx',
    label: 'TSX',
    patterns: [
      /:\s*(React\.FC|JSX\.Element|ReactNode)/,          // : React.FC
      /\bconst\s+\w+\s*:\s*\w+.*=.*</,                  // const Foo: Type = <
      /<\w+[^>]*\s(className|onClick|onChange)\s*=/,     // JSX with TS props
      /\breturn\s*\(\s*<.*\bclassName\b/,               // return (< ... className — TS + JSX 共现
    ],
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    patterns: [
      /\binterface\s+\w+\s*\{/,
      /\btype\s+\w+\s*=\s*/,
      /:\s*(string|number|boolean|void|any|never|unknown)\b/,
      /\bas\s+(string|number|boolean|any|const)\b/,
      /\b(enum|namespace|declare)\s+\w+/,
      /<\w+>\s*\(/,                                      // generic <T>(
    ],
  },
  {
    id: 'jsx',
    label: 'JSX',
    patterns: [
      /\breturn\s*\(\s*</,                               // return (<
      /<\w+[^>]*\s(className|onClick|onChange)\s*=/,
      /\buseState|useEffect|useCallback|useMemo|useRef\b/,
    ],
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    patterns: [
      /\b(const|let|var)\s+\w+\s*=\s*(function|\(|async|\[|\{|require\()/,
      /\bfunction\s+\w+\s*\(/,
      /\b(module\.exports|exports\.\w+|require\()/,
      /\bconsole\.(log|warn|error)\(/,
      /=>\s*\{/,
      /\bnew\s+(Promise|Map|Set|Array|Error)\b/,
      /\bimport\s+.*\s+from\s+['"]/,
      /\bexport\s+(default|const|function|class)\b/,
    ],
  },
  {
    id: 'rust',
    label: 'Rust',
    patterns: [
      /\bfn\s+\w+\s*(<.*>)?\s*\(/,
      /\b(pub\s+)?(fn|struct|enum|trait|impl|mod|use|crate)\b/,
      /\blet\s+(mut\s+)?\w+\s*(:\s*\w+)?\s*=/,
      /#\[(derive|test|cfg|allow|warn|macro)\b/,
      /\b(println!|format!|vec!|eprintln!|panic!)\s*\(/,
      /\b(Ok|Err|Some|None)\s*\(/,
      /\bResult<.*>/,
      /\bOption<.*>/,
      /->\s*(Self|&|[A-Z]\w*)/,
      /\b(unwrap|expect|map_err|and_then)\s*\(/,
    ],
  },
  {
    id: 'python',
    label: 'Python',
    patterns: [
      /\bdef\s+\w+\s*\(/,
      /\bclass\s+\w+\s*(\(.*\))?:\s*$/m,
      /\bimport\s+\w+|from\s+\w+\s+import\b/,
      /\bif\s+__name__\s*==\s*['"]__main__['"]/,
      /\b(self|cls)\.\w+/,
      /\bprint\s*\(/,
      /^\s*@\w+\s*$/m,                                  // decorators
      /\b(elif|except|finally|yield|lambda)\b/,
    ],
  },
  {
    id: 'java',
    label: 'Java',
    patterns: [
      /\bpublic\s+(static\s+)?class\s+\w+/,
      /\bpublic\s+static\s+void\s+main\s*\(/,
      /\bSystem\.(out|err)\.(print|println)\(/,
      /\b(private|protected|public)\s+(static\s+)?(final\s+)?\w+\s+\w+\s*[=(;]/,
      /\bnew\s+\w+<.*>\s*\(/,
      /\bpackage\s+[\w.]+;/,
      /\bimport\s+[\w.*]+;/,
      /@Override\b/,
    ],
  },
  {
    id: 'cpp',
    label: 'C++',
    patterns: [
      /\b#include\s*<\w+>/,
      /\bstd::\w+/,
      /\busing\s+namespace\s+\w+/,
      /\bcout\s*<</,
      /\b(template|class|virtual|nullptr|constexpr)\b/,
      /\bint\s+main\s*\(\s*(int\s+argc|void)?\s*[\),]/,
    ],
  },
  {
    id: 'c',
    label: 'C',
    patterns: [
      /\b#include\s*<(stdio|stdlib|string|math)\.h>/,
      /\bprintf\s*\(/,
      /\bscanf\s*\(/,
      /\bmalloc\s*\(/,
      /\btypedef\s+(struct|enum|union)\b/,
    ],
  },
  {
    id: 'go',
    label: 'Go',
    patterns: [
      /\bfunc\s+((\(\w+\s+\*?\w+\)\s+)?\w+)?\s*\(/,
      /\bpackage\s+\w+/,
      /\bfmt\.(Print|Sprint|Fprint)/,
      /\b(chan|goroutine|defer|go\s+func)\b/,
      /:=\s*/,
    ],
  },
  {
    id: 'php',
    label: 'PHP',
    patterns: [
      /<\?php\b/,
      /\$\w+\s*=/,
      /\bfunction\s+\w+\s*\(.*\$\w+/,
      /\b(echo|print_r|var_dump)\s*[\(;]/,
      /->\s*\w+\s*\(/,
    ],
  },
  {
    id: 'shell',
    label: 'Shell',
    patterns: [
      /^#!\s*\/bin\/(bash|sh|zsh)/m,
      /\becho\s+["'$]/,
      /\bif\s*\[\s*["-$]/,
      /\b(apt-get|yum|brew|pip|npm|cargo)\s+(install|update)/,
      /\$\{\w+\}/,
      /\bexport\s+\w+=/,
    ],
  },
  {
    id: 'html',
    label: 'HTML',
    patterns: [
      /<!DOCTYPE\s+html>/i,
      /<html[\s>]/i,
      /<(head|body|div|span|p|a|img|script|style|link|meta|form|input|button|table|ul|ol|li|h[1-6])\b/i,
    ],
  },
  {
    id: 'svg',
    label: 'SVG',
    patterns: [
      /<svg[\s>]/i,
      /\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/,
    ],
  },
  {
    id: 'xml',
    label: 'XML',
    patterns: [
      /<\?xml\s+version\s*=/i,
      /xmlns[:=]/,
    ],
  },
  {
    id: 'css',
    label: 'CSS',
    patterns: [
      /\b[\w.#-]+\s*\{[^}]*\b(color|margin|padding|display|font|background|border|width|height)\s*:/,
      /@(media|keyframes|import|font-face)\b/,
      /\b(flex|grid|block|inline|none|relative|absolute|fixed)\s*;/,
    ],
  },
  {
    id: 'scss',
    label: 'SCSS',
    patterns: [
      /\$\w+\s*:\s*/,          // $variable: value
      /&\.\w+/,                 // &.class
      /@mixin\s+\w+/,
      /@include\s+\w+/,
    ],
  },
  {
    id: 'json',
    label: 'JSON',
    patterns: [
      /^\s*\{[\s\S]*"[\w-]+":\s*/,    // starts with { ... "key":
      /^\s*\[[\s\S]*\{[\s\S]*"[\w-]+":/,  // starts with [ ... { "key":
    ],
  },
  {
    id: 'yaml',
    label: 'YAML',
    patterns: [
      /^---\s*$/m,
      /^\w[\w-]*:\s+\S/m,      // key: value
      /^\s+-\s+\w/m,           // - item (list)
    ],
  },
  {
    id: 'sql',
    label: 'SQL',
    patterns: [
      /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE|JOIN|GROUP BY|ORDER BY)\b/i,
      /\b(TABLE|INDEX|VIEW|DATABASE|COLUMN|PRIMARY KEY|FOREIGN KEY)\b/i,
    ],
  },
  {
    id: 'markdown',
    label: 'Markdown',
    patterns: [
      /^#{1,6}\s+\S/m,                          // # heading
      /^\s*[-*+]\s+\S/m,                         // - list item
      /\[.+?\]\(.+?\)/,                          // [link](url)
      /```\w*\n/,                                 // code block
      /\*\*\w+\*\*/,                             // **bold**
    ],
  },
];

// ============================================================================
// 检测引擎
// ============================================================================

interface DetectResult {
  id: LanguageId;
  label: string;
}

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
  go: async () => {
    const mod = await import('@codemirror/lang-javascript');
    return mod.javascript();
  },
  shell: async () => {
    const mod = await import('@codemirror/lang-javascript');
    return mod.javascript();
  },
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

/**
 * 自动检测代码语言
 *
 * 对每种语言的特征模式进行匹配，计算命中数，取最高分。
 * JSON 使用快速路径（尝试 JSON.parse）。
 */
export function detectLanguage(code: string): DetectResult {
  const trimmed = code.trim();

  // 快速判断 JSON
  if (/^\s*[\[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      const lang = LANGUAGES.find(l => l.id === 'json')!;
      return { id: lang.id, label: lang.label };
    } catch {
      // not valid JSON, continue detection
    }
  }

  let bestScore = 0;
  let bestLang: LanguageDef | null = null;

  for (const lang of LANGUAGES) {
    let score = 0;
    for (const pattern of lang.patterns) {
      if (pattern.test(code)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  // 至少匹配 1 个特征才认为有效
  if (bestLang && bestScore >= 1) {
    return { id: bestLang.id, label: bestLang.label };
  }

  // 无法检测时返回纯文本
  return { id: 'plaintext', label: '纯文本' };
}

/**
 * 获取所有可用语言列表（用于语言选择器下拉框）
 */
export function getAvailableLanguages(): { id: LanguageId; label: string }[] {
  return [
    ...LANGUAGES.map(l => ({ id: l.id, label: l.label })),
    { id: 'plaintext' as LanguageId, label: '纯文本' },
  ];
}
