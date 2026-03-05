import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  getAvailableLanguages,
  loadLanguageExtension,
  type LanguageId,
} from '../../src/utils/languageDetect';

// ============================================================================
// detectLanguage — 各语言基本识别
// ============================================================================

describe('detectLanguage', () => {
  // ── TypeScript ──
  it('should detect TypeScript interface', () => {
    const code = `interface User {\n  name: string;\n  age: number;\n}`;
    expect(detectLanguage(code).id).toBe('typescript');
  });

  it('should detect TypeScript type alias', () => {
    const code = `type Result = { ok: boolean; data: any }`;
    expect(detectLanguage(code).id).toBe('typescript');
  });

  it('should detect TypeScript enum', () => {
    const code = `enum Direction {\n  Up,\n  Down,\n  Left,\n  Right,\n}`;
    expect(detectLanguage(code).id).toBe('typescript');
  });

  // ── TSX ──
  it('should detect TSX with React.FC type', () => {
    const code = `const App: React.FC<Props> = ({ name }) => {\n  return <div className="app">{name}</div>;\n};`;
    expect(detectLanguage(code).id).toBe('tsx');
  });

  it('should detect TSX with interface + JSX', () => {
    const code = `interface ButtonProps {\n  label: string;\n}\nexport function Button({ label }: ButtonProps) {\n  return <button className="btn">{label}</button>;\n}`;
    // Could be tsx or typescript — both acceptable; TSX preferred due to JSX patterns
    const result = detectLanguage(code).id;
    expect(['tsx', 'typescript']).toContain(result);
  });

  // ── JSX ──
  it('should detect JSX with hooks', () => {
    const code = `function App() {\n  const [count, setCount] = useState(0);\n  return <div onClick={() => setCount(c => c + 1)}>{count}</div>;\n}`;
    expect(detectLanguage(code).id).toBe('jsx');
  });

  // ── JavaScript ──
  it('should detect JavaScript with module.exports', () => {
    const code = `const path = require('path');\nmodule.exports = { resolve: path.resolve };`;
    expect(detectLanguage(code).id).toBe('javascript');
  });

  it('should detect JavaScript with ES module syntax', () => {
    const code = `import { readFile } from 'fs';\nexport default function handler() {\n  console.log('ready');\n}`;
    expect(detectLanguage(code).id).toBe('javascript');
  });

  // ── Rust ──
  it('should detect Rust', () => {
    const code = `fn main() {\n    let mut v = vec![1, 2, 3];\n    println!("length: {}", v.len());\n}`;
    expect(detectLanguage(code).id).toBe('rust');
  });

  it('should detect Rust with derive macro', () => {
    const code = `#[derive(Debug, Clone)]\npub struct Config {\n    pub name: String,\n    pub value: Option<i32>,\n}`;
    expect(detectLanguage(code).id).toBe('rust');
  });

  // ── Python ──
  it('should detect Python', () => {
    const code = `def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n\nif __name__ == "__main__":\n    print(fibonacci(10))`;
    expect(detectLanguage(code).id).toBe('python');
  });

  it('should detect Python class', () => {
    const code = `class MyModel:\n    def __init__(self):\n        self.name = "test"\n    def predict(self, x):\n        return x * 2`;
    expect(detectLanguage(code).id).toBe('python');
  });

  // ── Java ──
  it('should detect Java', () => {
    const code = `package com.example;\n\npublic class Hello {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}`;
    expect(detectLanguage(code).id).toBe('java');
  });

  // ── C++ ──
  it('should detect C++', () => {
    const code = `#include <iostream>\nusing namespace std;\nint main() {\n    cout << "Hello" << endl;\n    return 0;\n}`;
    expect(detectLanguage(code).id).toBe('cpp');
  });

  // ── C ──
  it('should detect C', () => {
    const code = `#include <stdio.h>\n#include <stdlib.h>\nint main() {\n    printf("Hello\\n");\n    int *p = malloc(sizeof(int) * 10);\n    return 0;\n}`;
    expect(detectLanguage(code).id).toBe('c');
  });

  // ── Go ──
  it('should detect Go', () => {
    const code = `package main\n\nimport "fmt"\n\nfunc main() {\n    ch := make(chan int)\n    go func() { ch <- 42 }()\n    fmt.Println(<-ch)\n}`;
    expect(detectLanguage(code).id).toBe('go');
  });

  // ── PHP ──
  it('should detect PHP', () => {
    const code = `<?php\n$name = "World";\necho "Hello, $name!";\nfunction greet($person) {\n    return "Hi " . $person;\n}`;
    expect(detectLanguage(code).id).toBe('php');
  });

  // ── Shell ──
  it('should detect Shell with shebang', () => {
    const code = `#!/bin/bash\necho "Installing..."\napt-get install -y curl\nexport PATH=$HOME/bin:$PATH`;
    expect(detectLanguage(code).id).toBe('shell');
  });

  // ── HTML ──
  it('should detect HTML', () => {
    const code = `<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body><div>Hello</div></body>\n</html>`;
    expect(detectLanguage(code).id).toBe('html');
  });

  // ── SVG ──
  it('should detect SVG', () => {
    const code = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <circle cx="50" cy="50" r="40"/>\n</svg>`;
    expect(detectLanguage(code).id).toBe('svg');
  });

  // ── XML ──
  it('should detect XML', () => {
    const code = `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n</project>`;
    expect(detectLanguage(code).id).toBe('xml');
  });

  // ── CSS ──
  it('should detect CSS', () => {
    const code = `.container {\n  display: flex;\n  padding: 16px;\n  background: #fff;\n}\n@media (max-width: 768px) {\n  .container { padding: 8px; }\n}`;
    expect(detectLanguage(code).id).toBe('css');
  });

  // ── SCSS ──
  it('should detect SCSS', () => {
    const code = `$primary: #333;\n@mixin flex-center {\n  display: flex;\n  align-items: center;\n}\n.card {\n  @include flex-center;\n  &.active { color: $primary; }\n}`;
    expect(detectLanguage(code).id).toBe('scss');
  });

  // ── JSON ──
  it('should detect JSON object', () => {
    const code = `{\n  "name": "clipboard-history",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^18.0.0"\n  }\n}`;
    expect(detectLanguage(code).id).toBe('json');
  });

  it('should detect JSON array', () => {
    const code = `[{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]`;
    expect(detectLanguage(code).id).toBe('json');
  });

  // ── YAML ──
  it('should detect YAML', () => {
    const code = `---\nname: my-app\nversion: 1.0.0\ndependencies:\n  - react\n  - typescript`;
    expect(detectLanguage(code).id).toBe('yaml');
  });

  // ── SQL ──
  it('should detect SQL', () => {
    const code = `SELECT u.name, o.total\nFROM users u\nJOIN orders o ON u.id = o.user_id\nWHERE o.total > 100\nORDER BY o.total DESC;`;
    expect(detectLanguage(code).id).toBe('sql');
  });

  // ── Markdown ──
  it('should detect Markdown', () => {
    const code = `# README\n\nThis is a **bold** statement.\n\n- item 1\n- item 2\n\n[Link](https://example.com)\n\n\`\`\`js\nconsole.log("hi");\n\`\`\``;
    expect(detectLanguage(code).id).toBe('markdown');
  });

  // ── Plaintext ──
  it('should return plaintext for unrecognized content', () => {
    expect(detectLanguage('Hello world').id).toBe('plaintext');
  });

  it('should return plaintext for empty string', () => {
    expect(detectLanguage('').id).toBe('plaintext');
  });

  it('should return plaintext for whitespace only', () => {
    expect(detectLanguage('   \n\t  ').id).toBe('plaintext');
  });
});

// ============================================================================
// detectLanguage — 性能：缓存
// ============================================================================

describe('detectLanguage caching', () => {
  it('should return identical result for same input (cache hit)', () => {
    const code = `fn main() { println!("hello"); }`;
    const r1 = detectLanguage(code);
    const r2 = detectLanguage(code);
    expect(r1).toBe(r2); // 同一对象引用 = 缓存命中
  });
});

// ============================================================================
// detectLanguage — 边界：长文本采样
// ============================================================================

describe('detectLanguage long input sampling', () => {
  it('should detect language from long Rust code', () => {
    // 生成超过 2000 字符的 Rust 代码
    const padding = '// '.padEnd(60, 'x') + '\n';
    const head = `fn main() {\n    println!("hello");\n`;
    const tail = `    let x: Option<i32> = Some(42);\n}\n`;
    const code = head + padding.repeat(40) + tail;
    expect(code.length).toBeGreaterThan(2000);
    expect(detectLanguage(code).id).toBe('rust');
  });
});

// ============================================================================
// getAvailableLanguages — 单例 + 完整性
// ============================================================================

describe('getAvailableLanguages', () => {
  it('should return frozen singleton', () => {
    const a = getAvailableLanguages();
    const b = getAvailableLanguages();
    expect(a).toBe(b); // 同一引用
  });

  it('should include plaintext', () => {
    const langs = getAvailableLanguages();
    expect(langs.some(l => l.id === 'plaintext')).toBe(true);
  });

  it('should include all defined language IDs', () => {
    const langs = getAvailableLanguages();
    const ids = langs.map(l => l.id);
    const expected: LanguageId[] = [
      'javascript', 'typescript', 'jsx', 'tsx',
      'python', 'rust', 'java', 'cpp', 'c',
      'html', 'css', 'scss',
      'json', 'yaml', 'xml', 'svg',
      'sql', 'markdown', 'php',
      'go', 'shell', 'plaintext',
    ];
    for (const eid of expected) {
      expect(ids).toContain(eid);
    }
  });
});

// ============================================================================
// loadLanguageExtension — 缓存 + 回退
// ============================================================================

describe('loadLanguageExtension', () => {
  it('should return consistent results for same language', async () => {
    const ext1 = await loadLanguageExtension('plaintext');
    const ext2 = await loadLanguageExtension('plaintext');
    expect(ext1).toEqual(ext2);
  });

  it('should resolve to empty array for plaintext', async () => {
    const ext = await loadLanguageExtension('plaintext');
    expect(ext).toEqual([]);
  });

  it('should resolve to empty array for go (no installed extension)', async () => {
    const ext = await loadLanguageExtension('go');
    expect(ext).toEqual([]);
  });

  it('should resolve to empty array for shell (no installed extension)', async () => {
    const ext = await loadLanguageExtension('shell');
    expect(ext).toEqual([]);
  });
});

// ============================================================================
// DetectResult 结构
// ============================================================================

describe('DetectResult structure', () => {
  it('should always have id and label', () => {
    const samples = [
      'const x = 1;',
      'fn main() {}',
      '<!DOCTYPE html>',
      'random text here',
    ];
    for (const s of samples) {
      const r = detectLanguage(s);
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('label');
      expect(typeof r.id).toBe('string');
      expect(typeof r.label).toBe('string');
    }
  });
});
